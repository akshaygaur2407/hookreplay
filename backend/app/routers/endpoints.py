import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, HttpUrl
from app.models import Replay
from app.services.replayer import send_replay
from app.services.ssrf import UnsafeTarget, validate_target
from app.database import get_db
from app.models import Endpoint, Event
from app.services.slug import generate_slug
import asyncio
import json

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.database import SessionLocal
from app.services.broadcaster import broadcaster
from app.services.serializers import serialize_event

router = APIRouter(prefix="/api")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")


@router.post("/endpoints", status_code=201)
async def create_endpoint(db: AsyncSession = Depends(get_db)):
    endpoint = Endpoint(slug=generate_slug())
    db.add(endpoint)
    await db.commit()
    return {
        "slug": endpoint.slug,
        "url": f"{PUBLIC_BASE_URL}/h/{endpoint.slug}",
        "expires_at": endpoint.expires_at.isoformat() + "Z",
    }


@router.get("/endpoints/{slug}/events")
async def list_events(slug: str, db: AsyncSession = Depends(get_db)):
    endpoint = (await db.execute(select(Endpoint).where(Endpoint.slug == slug))).scalar_one_or_none()
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
    db: AsyncSession = Depends(get_db),
):
    endpoint = (await db.execute(select(Endpoint).where(Endpoint.slug == slug))).scalar_one_or_none()
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
        endpoint = (await db.execute(select(Endpoint).where(Endpoint.slug == slug))).scalar_one_or_none()
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
                except asyncio.TimeoutError:
                    yield ": ping\n\n"  # keep-alive so proxies don't kill idle connections
        finally:
            broadcaster.unsubscribe(slug, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )