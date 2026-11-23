from app.models import Event


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
        "body_preview": e.body.decode("utf-8", errors="replace"),
    }