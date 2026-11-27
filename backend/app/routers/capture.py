from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Endpoint, Event
from app.models.endpoint import utcnow
from app.services.broadcaster import broadcaster
from app.services.retention import prune_events
from app.services.serializers import serialize_event

router = APIRouter()

MAX_BODY_BYTES = 1 * 1024 * 1024  # 1 MB cap; public URL, so limit abuse
ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]


@router.api_route("/h/{slug}", methods=ALL_METHODS)
@router.api_route("/h/{slug}/{rest:path}", methods=ALL_METHODS)
async def capture(
    slug: str,
    request: Request,
    rest: str = "",
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
        source_ip=request.client.host if request.client else None,
    )
    db.add(event)
    await db.commit()

    broadcaster.publish(slug, serialize_event(event))
    await prune_events(db, endpoint.id)

    return {"received": True, "event_id": event.id}
