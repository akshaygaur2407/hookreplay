from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import COOKIE_NAME
from app.database import get_db
from app.models import AuthSession, User
from app.models.endpoint import utcnow
from app.services.security import hash_token


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Not authenticated")

    session = (
        await db.execute(
            select(AuthSession).where(
                AuthSession.token_hash == hash_token(token),
                AuthSession.expires_at > utcnow(),
            )
        )
    ).scalar_one_or_none()
    if session is None:
        raise HTTPException(401, "Session expired")

    user = await db.get(User, session.user_id)
    if user is None or not user.is_verified:
        raise HTTPException(401, "Not authenticated")
    return user