
import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal, get_db
from app.models import Endpoint, Event, Replay, User
from app.services.broadcaster import broadcaster
from app.services.deps import get_current_user
from app.services.replayer import send_replay
from app.services.serializers import serialize_event
from app.services.slug import generate_slug
from app.services.ssrf import UnsafeTarget, validate_target

router = APIRouter(prefix="/api")

PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL", "http://localhost:8000"
).rstrip("/")

MAX_ENDPOINTS_PER_USER = 50


# ---------------------------------------------------------------------------
# Endpoint management
# ---------------------------------------------------------------------------

@router.post("/endpoints", status_code=201)
async def create_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    owned = (
        await db.execute(
            select(func.count())
            .select_from(Endpoint)
            .where(Endpoint.user_id == user.id)
        )
    ).scalar_one()

    if owned >= MAX_ENDPOINTS_PER_USER:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You've reached the limit of {MAX_ENDPOINTS_PER_USER} endpoints. "
                "Delete one to create another."
            ),
        )

    endpoint = Endpoint(
        slug=generate_slug(),
        user_id=user.id,
    )

    db.add(endpoint)
    await db.commit()
    await db.refresh(endpoint)

    return serialize_endpoint(endpoint)


@router.get("/endpoints")
async def list_endpoints(
    limit: int = Query(50, ge=1, le=100),
    before: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    total = (
        await db.execute(
            select(func.count())
            .select_from(Endpoint)
            .where(Endpoint.user_id == user.id)
        )
    ).scalar_one()

    query = select(Endpoint).where(Endpoint.user_id == user.id)

    if before is not None:
        query = query.where(Endpoint.id < before)

    rows = (
        await db.execute(
            query.order_by(Endpoint.id.desc()).limit(limit + 1)
        )
    ).scalars().all()

    return {
        "items": [serialize_endpoint(endpoint) for endpoint in rows[:limit]],
        "total": total,
        "has_more": len(rows) > limit,
    }


@router.get("/endpoints/{slug}")
async def get_endpoint(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = await get_owned_endpoint(db, slug, user)
    return serialize_endpoint(endpoint)


@router.get("/endpoints/{slug}/events")
async def list_events(
    slug: str,
    limit: int = Query(50, ge=1, le=100),
    before: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = await get_owned_endpoint(db, slug, user)

    total = (
        await db.execute(
            select(func.count())
            .select_from(Event)
            .where(Event.endpoint_id == endpoint.id)
        )
    ).scalar_one()

    query = select(Event).where(Event.endpoint_id == endpoint.id)

    if before is not None:
        query = query.where(Event.id < before)

    rows = (
        await db.execute(
            query.order_by(Event.id.desc()).limit(limit + 1)
        )
    ).scalars().all()

    return {
        "items": [serialize_event(event) for event in rows[:limit]],
        "total": total,
        "has_more": len(rows) > limit,
    }


@router.get("/endpoints/{slug}/events/{event_id}/body")
async def get_event_body(
    slug: str,
    event_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = await get_owned_endpoint(db, slug, user)

    event = (
        await db.execute(
            select(Event).where(
                Event.id == event_id,
                Event.endpoint_id == endpoint.id,
            )
        )
    ).scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Unknown event")

    # Return the exact captured bytes without decoding or JSON processing.
    return Response(
        content=event.body,
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store"},
    )


class ReplayRequest(BaseModel):
    target_url: HttpUrl


@router.post("/endpoints/{slug}/events/{event_id}/replay")
async def replay_event(
    slug: str,
    event_id: int,
    payload: ReplayRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = await get_owned_endpoint(db, slug, user)

    event = (
        await db.execute(
            select(Event).where(
                Event.id == event_id,
                Event.endpoint_id == endpoint.id,
            )
        )
    ).scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Unknown event")

    target = str(payload.target_url)

    try:
        await validate_target(target)
    except UnsafeTarget as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = await send_replay(event, target)

    replay = Replay(
        event_id=event.id,
        target_url=target,
        **result,
    )

    db.add(replay)
    await db.commit()
    await db.refresh(replay)

    return {
        "replay_id": replay.id,
        "target_url": target,
        **result,
    }


@router.get("/endpoints/{slug}/stream")
async def stream_events(
    slug: str,
    request: Request,
):
    # Authenticate and verify ownership using a short-lived DB session.
    # Do not hold a database connection for the lifetime of the stream.
    async with SessionLocal() as db:
        user = await get_current_user(request, db)
        await get_owned_endpoint(db, slug, user)

    queue = broadcaster.subscribe(slug)

    async def event_generator():
        try:
            # Tell the browser when to reconnect.
            yield "retry: 3000\n\n"

            while not await request.is_disconnected():
                try:
                    data = await asyncio.wait_for(
                        queue.get(),
                        timeout=15,
                    )
                    yield f"data: {json.dumps(data)}\n\n"

                except TimeoutError:
                    # Keep the connection alive.
                    yield ": ping\n\n"

        finally:
            broadcaster.unsubscribe(slug, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def serialize_endpoint(endpoint: Endpoint) -> dict:
    return {
        "id": endpoint.id,
        "slug": endpoint.slug,
        "url": f"{PUBLIC_BASE_URL}/h/{endpoint.slug}",
        "expires_at": endpoint.expires_at.isoformat() + "Z",
    }


async def get_owned_endpoint(
    db: AsyncSession,
    slug: str,
    user: User,
) -> Endpoint:
    """Return an endpoint only if it belongs to the authenticated user.

    Someone else's endpoint returns the same 404 as a nonexistent endpoint,
    preventing endpoint slug enumeration.
    """
    endpoint = (
        await db.execute(
            select(Endpoint).where(
                Endpoint.slug == slug,
                Endpoint.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if endpoint is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown endpoint",
        )

    return endpoint
