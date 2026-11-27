from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Event, Replay

MAX_EVENTS_PER_ENDPOINT = 500


async def prune_events(db: AsyncSession, endpoint_id: int) -> None:
    """Keep only the newest MAX_EVENTS_PER_ENDPOINT events of an endpoint."""
    cutoff = (
        await db.execute(
            select(Event.id)
            .where(Event.endpoint_id == endpoint_id)
            .order_by(Event.id.desc())
            .offset(MAX_EVENTS_PER_ENDPOINT)
            .limit(1)
        )
    ).scalar_one_or_none()
    if cutoff is None:
        return

    old = select(Event.id).where(Event.endpoint_id == endpoint_id, Event.id <= cutoff)
    # explicit: SQLite doesn't enforce ON DELETE CASCADE by default
    await db.execute(delete(Replay).where(Replay.event_id.in_(old)))
    await db.execute(delete(Event).where(Event.endpoint_id == endpoint_id, Event.id <= cutoff))
    await db.commit()