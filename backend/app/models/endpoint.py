from datetime import UTC, datetime, timedelta

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    # naive UTC, matches what the DB hands back
    return datetime.now(UTC).replace(tzinfo=None)


def default_expiry() -> datetime:
    return utcnow() + timedelta(hours=24)


class Endpoint(Base):
    __tablename__ = "endpoints"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    slug: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, default=default_expiry)

    events = relationship(
        "Event",
        back_populates="endpoint",
        cascade="all, delete-orphan",
    )