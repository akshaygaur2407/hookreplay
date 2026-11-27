"""Sliding-window rate limiting.

MemoryRateLimiter is correct for ONE worker process. With several workers each
keeps its own counters, so the effective limit multiplies. Swap in a Redis-backed
class with the same `hit` signature when you scale out.
"""

import math
import time
from collections import deque
from typing import Protocol

from fastapi import HTTPException, Request

from app import config


class RateLimiter(Protocol):
    async def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """Record an attempt. Returns (allowed, retry_after_seconds)."""
        ...


class MemoryRateLimiter:
    def __init__(self, max_keys: int = 50_000):
        self._hits: dict[str, tuple[int, deque[float]]] = {}
        self._max_keys = max_keys
        self._calls = 0

    def _purge(self, now: float) -> None:
        dead = [
            key
            for key, (window, hits) in self._hits.items()
            if not hits or hits[-1] <= now - window
        ]
        for key in dead:
            del self._hits[key]

    async def hit(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        # No awaits inside, so this is atomic within the event loop.
        now = time.monotonic()

        self._calls += 1
        if self._calls % 1000 == 0:
            self._purge(now)

        entry = self._hits.get(key)
        if entry is None:
            if len(self._hits) >= self._max_keys:
                self._purge(now)
                if len(self._hits) >= self._max_keys:
                    # still full (attack with endless unique keys): drop the oldest key
                    self._hits.pop(next(iter(self._hits)))
            entry = (window, deque())
            self._hits[key] = entry

        hits = entry[1]
        while hits and hits[0] <= now - window:
            hits.popleft()

        if len(hits) >= limit:
            return False, max(1, math.ceil(hits[0] + window - now))

        hits.append(now)
        return True, 0


limiter: RateLimiter = MemoryRateLimiter()


def client_ip(request: Request) -> str:
    """The real client address.

    Behind N trusted proxies, each appends the address it saw to X-Forwarded-For,
    so the real client is the Nth entry from the RIGHT. Anything further left was
    supplied by the client and can be forged, so it is never used.
    """
    hops = config.TRUSTED_PROXY_HOPS
    if hops > 0:
        header = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in header.split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return request.client.host if request.client else "unknown"


def _human(seconds: int) -> str:
    if seconds < 90:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    return f"{math.ceil(seconds / 60)} minutes"


async def enforce(key: str, limit: int, window: int, message: str = "Too many requests.") -> None:
    if not config.RATE_LIMIT_ENABLED:
        return
    allowed, retry_after = await limiter.hit(key, limit, window)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"{message} Try again in {_human(retry_after)}.",
            headers={"Retry-After": str(retry_after)},
        )


def limit_by_ip(name: str, limit: int, window: int, message: str = "Too many requests."):
    """Dependency factory: limit a route per client IP."""

    async def dependency(request: Request) -> None:
        await enforce(f"{name}:{client_ip(request)}", limit, window, message)

    return dependency