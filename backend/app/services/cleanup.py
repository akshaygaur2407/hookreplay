"""Retention cleanup: removes expired endpoints, sessions, OTPs and stale signups.

Runs on a schedule inside the app (see lifespan in main.py), or by hand:
    python -m app.services.cleanup --dry-run
    python -m app.services.cleanup
"""

import argparse
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.database import SessionLocal, engine
from app.models import AuthSession, Endpoint, Event, OtpCode, Replay, User
from app.models.endpoint import utcnow

log = logging.getLogger("hookreplay.cleanup")

BATCH = 100
OTP_RETENTION = timedelta(days=1)
UNVERIFIED_USER_TTL = timedelta(hours=24)


async def _count(db: AsyncSession, model, *conditions) -> int:
    stmt = select(func.count()).select_from(model).where(*conditions)
    return (await db.execute(stmt)).scalar_one()


async def purge_expired_endpoints(db: AsyncSession, dry_run: bool) -> dict:
    cutoff = utcnow() - timedelta(days=config.ENDPOINT_GRACE_DAYS)

    if dry_run:
        expired = select(Endpoint.id).where(Endpoint.expires_at < cutoff)
        return {
            "endpoints": await _count(db, Endpoint, Endpoint.expires_at < cutoff),
            "events": await _count(db, Event, Event.endpoint_id.in_(expired)),
        }

    endpoints = events = 0
    while True:
        ids = (
            (
                await db.execute(
                    select(Endpoint.id).where(Endpoint.expires_at < cutoff).limit(BATCH)
                )
            )
            .scalars()
            .all()
        )
        if not ids:
            break

        event_ids = select(Event.id).where(Event.endpoint_id.in_(ids))
        await db.execute(delete(Replay).where(Replay.event_id.in_(event_ids)))
        removed = await db.execute(delete(Event).where(Event.endpoint_id.in_(ids)))
        await db.execute(delete(Endpoint).where(Endpoint.id.in_(ids)))
        await db.commit()

        endpoints += len(ids)
        events += removed.rowcount or 0
    return {"endpoints": endpoints, "events": events}


async def purge_sessions(db: AsyncSession, dry_run: bool) -> int:
    now = utcnow()
    if dry_run:
        return await _count(db, AuthSession, AuthSession.expires_at < now)
    result = await db.execute(delete(AuthSession).where(AuthSession.expires_at < now))
    await db.commit()
    return result.rowcount or 0


async def purge_otps(db: AsyncSession, dry_run: bool) -> int:
    cutoff = utcnow() - OTP_RETENTION
    if dry_run:
        return await _count(db, OtpCode, OtpCode.expires_at < cutoff)
    result = await db.execute(delete(OtpCode).where(OtpCode.expires_at < cutoff))
    await db.commit()
    return result.rowcount or 0


async def purge_unverified_users(db: AsyncSession, dry_run: bool) -> int:
    cutoff = utcnow() - UNVERIFIED_USER_TTL
    stale = (User.is_verified.is_(False), User.created_at < cutoff)

    if dry_run:
        return await _count(db, User, *stale)

    ids = select(User.id).where(*stale)
    # children first: SQLite doesn't enforce ON DELETE CASCADE
    await db.execute(delete(OtpCode).where(OtpCode.user_id.in_(ids)))
    await db.execute(delete(AuthSession).where(AuthSession.user_id.in_(ids)))
    result = await db.execute(delete(User).where(*stale))
    await db.commit()
    return result.rowcount or 0


async def cleanup_once(dry_run: bool = False) -> dict:
    async with SessionLocal() as db:
        expired = await purge_expired_endpoints(db, dry_run)
        summary = {
            "endpoints": expired["endpoints"],
            "events": expired["events"],
            "sessions": await purge_sessions(db, dry_run),
            "otps": await purge_otps(db, dry_run),
            "unverified_users": await purge_unverified_users(db, dry_run),
        }

    if any(summary.values()):
        log.info("cleanup %s: %s", "would remove" if dry_run else "removed", summary)
    return summary


async def cleanup_loop() -> None:
    """Background task: wait a little after startup, then run every interval."""
    await asyncio.sleep(10)
    while True:
        try:
            await cleanup_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Cleanup run failed")
        await asyncio.sleep(config.CLEANUP_INTERVAL_MINUTES * 60)


async def _main() -> None:
    parser = argparse.ArgumentParser(description="HookReplay retention cleanup")
    parser.add_argument("--dry-run", action="store_true", help="count, don't delete")
    args = parser.parse_args()
    try:
        summary = await cleanup_once(dry_run=args.dry_run)
        verb = "Would remove" if args.dry_run else "Removed"
        print(f"{verb}: {summary}")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(_main())
