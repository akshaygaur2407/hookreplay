import asyncio
from collections import defaultdict


class Broadcaster:
    def __init__(self):
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, slug: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subs[slug].add(q)
        return q

    def unsubscribe(self, slug: str, q: asyncio.Queue) -> None:
        self._subs[slug].discard(q)
        if not self._subs[slug]:
            del self._subs[slug]

    def publish(self, slug: str, data: dict) -> None:
        for q in list(self._subs.get(slug, ())):
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                pass  # slow client: drop rather than block the capture path


broadcaster = Broadcaster()
