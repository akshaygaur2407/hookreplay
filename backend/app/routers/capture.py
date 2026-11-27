from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Endpoint, Event
from app.models.endpoint import utcnow
from app.services.broadcaster import broadcaster
from app.services.retention import prune_events
from app.services.serializers import serialize_event
from app import config
from app.services.ratelimit import client_ip, enforce

router = APIRouter()

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB cap; public URL, so limit abuse
ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]

async def capture_limits(slug: str, request: Request) -> None:
    await enforce(
        f"cap-ip:{client_ip(request)}", config.CAPTURE_PER_IP_PER_MIN, 60, "Too many requests from your address."
    )
    await enforce(
        f"cap-slug:{slug}", config.CAPTURE_PER_SLUG_PER_MIN, 60, "This endpoint is receiving too many requests."
    )

@router.api_route("/h/{slug}", methods=ALL_METHODS)
@router.api_route("/h/{slug}/{rest:path}", methods=ALL_METHODS)
async def capture(
    slug: str,
    request: Request,
    rest: str = "",
    _limits: None = Depends(capture_limits),
    db: AsyncSession = Depends(get_db),
):
    endpoint = (
        await db.execute(select(Endpoint).where(Endpoint.slug == slug))
    ).scalar_one_or_none()
    if endpoint is None:
        return Response("Unknown endpoint", status_code=404)
    if endpoint.expires_at < utcnow():
        return Response("Endpoint expired", status_code=410)

    # Reject oversized bodies early when Content-Length is honest
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return Response("Payload too large", status_code=413)

    # Read raw bytes in chunks so a lying/absent Content-Length can't blow memory
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            return Response("Payload too large", status_code=413)
        chunks.append(chunk)
    body = b"".join(chunks)

    event = Event(
        endpoint_id=endpoint.id,
        method=request.method,
        path="/" + rest,
        query_string=request.url.query,
        headers=[
            [k.decode("latin-1"), v.decode("latin-1")] for k, v in request.headers.raw
        ],
        body=body,
        content_type=request.headers.get("content-type"),
        source_ip=client_ip(request),
    )
    db.add(event)
    await db.commit()

    broadcaster.publish(slug, serialize_event(event))
    await prune_events(db, endpoint.id)

    return {"received": True, "event_id": event.id}
