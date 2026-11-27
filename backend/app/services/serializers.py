from app.models import Event

PREVIEW_BYTES = 64 * 1024


def serialize_event(e: Event) -> dict:
    return {
        "id": e.id,
        "method": e.method,
        "path": e.path,
        "query_string": e.query_string,
        "headers": e.headers,
        "content_type": e.content_type,
        "source_ip": e.source_ip,
        "received_at": e.received_at.isoformat() + "Z",
        "body_size": len(e.body),
        # display only; the stored bytes are never modified
        "body_preview": e.body[:PREVIEW_BYTES].decode("utf-8", errors="replace"),
        "body_truncated": len(e.body) > PREVIEW_BYTES,
    }