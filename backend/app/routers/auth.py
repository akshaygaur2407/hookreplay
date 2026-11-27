import asyncio
import hmac
import smtplib
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import config
from app.database import get_db
from app.models import AuthSession, OtpCode, User
from app.models.endpoint import utcnow
from app.services import security
from app.services.deps import get_current_user
from app.services.email import send_otp_email

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Used so "unknown email" takes as long as "wrong password"
DUMMY_HASH = security.hash_password("dummy-password-for-timing")


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class VerifyIn(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


class OnboardingIn(BaseModel):
    account_type: Literal["personal", "company"]


def user_payload(user: User) -> dict:
    return {"id": user.id, "email": user.email, "account_type": user.account_type}


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()


async def issue_otp(db: AsyncSession, user: User) -> None:
    last = (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.user_id == user.id)
            .order_by(OtpCode.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if (
        last
        and (utcnow() - last.created_at).total_seconds() < config.OTP_RESEND_SECONDS
    ):
        raise HTTPException(429, "Please wait a minute before requesting another code")

    await db.execute(delete(OtpCode).where(OtpCode.user_id == user.id))
    code = security.generate_otp()
    db.add(
        OtpCode(
            user_id=user.id,
            code_hash=security.hash_otp(user.id, code),
            expires_at=utcnow() + timedelta(minutes=config.OTP_TTL_MINUTES),
        )
    )
    await db.flush()

    try:
        await send_otp_email(user.email, code)
    except (smtplib.SMTPException, OSError):
        raise HTTPException(
            status_code=502,
            detail="Could not send verification email",
        ) from None


@router.post("/signup")
async def signup(body: SignupIn, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if user and user.is_verified:
        raise HTTPException(
            409, "An account with this email already exists. Please log in."
        )

    password_hash = await asyncio.to_thread(security.hash_password, body.password)
    if user is None:
        user = User(
            email=body.email.lower(), password_hash=password_hash, is_verified=False
        )
        db.add(user)
    else:
        # Unverified leftover signup: let the latest attempt win
        user.password_hash = password_hash
    await db.flush()

    await issue_otp(db, user)
    await db.commit()
    return {"otp_required": True}


@router.post("/login")
async def login(body: LoginIn, db: AsyncSession = Depends(get_db)):
    user = await get_user_by_email(db, body.email)
    if user is None:
        await asyncio.to_thread(security.verify_password, DUMMY_HASH, body.password)
        raise HTTPException(401, "Invalid email or password")

    ok = await asyncio.to_thread(
        security.verify_password, user.password_hash, body.password
    )
    if not ok:
        raise HTTPException(401, "Invalid email or password")

    await issue_otp(db, user)
    await db.commit()
    return {"otp_required": True}


@router.post("/verify-otp")
async def verify_otp(
    body: VerifyIn, response: Response, db: AsyncSession = Depends(get_db)
):
    def bad_code() -> HTTPException:
        return HTTPException(400, "Invalid or expired code")

    user = await get_user_by_email(db, body.email)
    if user is None:
        raise bad_code()

    otp = (
        await db.execute(
            select(OtpCode)
            .where(OtpCode.user_id == user.id)
            .order_by(OtpCode.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if otp is None or otp.expires_at < utcnow():
        raise bad_code()
    if otp.attempts >= config.OTP_MAX_ATTEMPTS:
        raise HTTPException(429, "Too many attempts. Please request a new code.")

    if not hmac.compare_digest(otp.code_hash, security.hash_otp(user.id, body.otp)):
        otp.attempts += 1
        await db.commit()  # persist the attempt before raising
        raise bad_code()

    await db.delete(otp)
    user.is_verified = True

    token = security.new_session_token()
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=security.hash_token(token),
            expires_at=utcnow() + timedelta(days=config.SESSION_DAYS),
        )
    )
    await db.commit()

    response.set_cookie(
        key=config.COOKIE_NAME,
        value=token,
        max_age=config.SESSION_DAYS * 24 * 3600,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return user_payload(user)


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user_payload(user)


@router.post("/onboarding")
async def onboarding(
    body: OnboardingIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.account_type == "company":
        raise HTTPException(400, "Company accounts are coming soon")
    if user.account_type is None:
        user.account_type = "personal"
        await db.commit()
    return user_payload(user)


@router.post("/logout")
async def logout(
    request: Request, response: Response, db: AsyncSession = Depends(get_db)
):
    token = request.cookies.get(config.COOKIE_NAME)
    if token:
        await db.execute(
            delete(AuthSession).where(
                AuthSession.token_hash == security.hash_token(token)
            )
        )
        await db.commit()
    response.delete_cookie(config.COOKIE_NAME, path="/")
    return {"ok": True}
