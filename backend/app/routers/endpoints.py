import asyncio
import json
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import delete, select
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

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")


@router.post("/endpoints", status_code=201)
async def create_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = Endpoint(
        slug=generate_slug(),
        user_id=user.id,
    )

    db.add(endpoint)
    await db.commit()

    return serialize_endpoint(endpoint)


@router.get("/endpoints")
async def list_endpoints(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(Endpoint)
            .where(Endpoint.user_id == user.id)
            .order_by(Endpoint.id.desc())
        )
    ).scalars().all()

    return [serialize_endpoint(e) for e in rows]


@router.delete("/endpoints/{slug}")
async def delete_endpoint(
    slug: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    endpoint = await get_owned_endpoint(db, slug, user)

    # Delete children explicitly: SQLite doesn't enforce ON DELETE CASCADE by default
    event_ids = select(Event.id).where(Event.endpoint_id == endpoint.id)

    await db.execute(
        delete(Replay).where(Replay.event_id.in_(event_ids))
    )
    await db.execute(
        delete(Event).where(Event.endpoint_id == endpoint.id)
    )

    await db.delete(endpoint)
    await db.commit()

    return {"deleted": True}


@router.get("/endpoints/{slug}/events")
async def list_events(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    endpoint = await get_owned_endpoint(db, slug, user)
    if endpoint is None:
        raise HTTPException(404, "Unknown endpoint")

    rows = (
        await db.execute(
            select(Event)
            .where(Event.endpoint_id == endpoint.id)
            .order_by(Event.id.desc())
            .limit(100)
        )
    ).scalars().all()

    return [serialize_event(e) for e in rows]


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
    if endpoint is None:
        raise HTTPException(404, "Unknown endpoint")

    event = (
        await db.execute(
            select(Event).where(Event.id == event_id, Event.endpoint_id == endpoint.id)
        )
    ).scalar_one_or_none()
    if event is None:
        raise HTTPException(404, "Unknown event")

    target = str(payload.target_url)
    try:
        await validate_target(target)
    except UnsafeTarget as exc:
        raise HTTPException(400, str(exc))

    result = await send_replay(event, target)
    replay = Replay(event_id=event.id, target_url=target, **result)
    db.add(replay)
    await db.commit()

    return {"replay_id": replay.id, "target_url": target, **result}


@router.get("/endpoints/{slug}/stream")
async def stream_events(slug: str, request: Request):
    # Open and close a session just for the check, so we don't hold a
    # DB connection for the whole lifetime of the stream
    async with SessionLocal() as db:
        user = await get_current_user(request, db)
        endpoint= await get_owned_endpoint(db, slug, user)

    if endpoint is None:
        raise HTTPException(404, "Unknown endpoint")

    queue = broadcaster.subscribe(slug)

    async def event_generator():
        try:
            yield "retry: 3000\n\n"  # browser reconnect delay
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(data)}\n\n"
                except TimeoutError:
                    yield ": ping\n\n"
        finally:
            broadcaster.unsubscribe(slug, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

def serialize_endpoint(ep: Endpoint) -> dict:
    return {
        "slug": ep.slug,
        "url": f"{PUBLIC_BASE_URL}/h/{ep.slug}",
        "expires_at": ep.expires_at.isoformat() + "Z",
    }


async def get_owned_endpoint(
    db: AsyncSession, slug: str, user: User
) -> Endpoint:
    """Endpoint by slug, only if it belongs to user.

    Someone else's endpoint returns the same 404 as a nonexistent one,
    so slugs can't be probed for existence.
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
        raise HTTPException(404, "Unknown endpoint")

    return endpoint