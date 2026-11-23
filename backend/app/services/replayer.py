import time

import httpx

from app.models import Event

# Headers that must be recomputed for the new request
SKIP_HEADERS = {
    "host", "content-length", "connection", "keep-alive", "transfer-encoding",
    "upgrade", "te", "trailer", "proxy-authorization", "proxy-authenticate",
}


async def send_replay(event: Event, target_url: str) -> dict:
    headers = [(k, v) for k, v in event.headers if k.lower() not in SKIP_HEADERS]
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            resp = await client.request(
                event.method, target_url, headers=headers, content=event.body
            )
        return {
            "status_code": resp.status_code,
            "response_body": resp.content[:10_000].decode("utf-8", errors="replace"),
            "error": None,
            "duration_ms": int((time.perf_counter() - start) * 1000),
        }
    except httpx.HTTPError as exc:
        return {
            "status_code": None,
            "response_body": None,
            "error": f"{type(exc).__name__}: {exc}"[:500],
            "duration_ms": int((time.perf_counter() - start) * 1000),
        }