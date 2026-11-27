from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.dialects.mysql import LONGBLOB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.endpoint import utcnow


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    endpoint_id: Mapped[int] = mapped_column(
        ForeignKey("endpoints.id", ondelete="CASCADE"), index=True
    )

    method: Mapped[str] = mapped_column(String(10))
    path: Mapped[str] = mapped_column(String(2048))
    query_string: Mapped[str] = mapped_column(Text, default="")

    # list of [name, value] pairs: preserves order and duplicate headers
    headers: Mapped[list] = mapped_column(JSON)

    # raw bytes exactly as received; never parsed or re-serialized
    body: Mapped[bytes] = mapped_column(
        LargeBinary().with_variant(LONGBLOB, "mysql"), default=b""
    )

    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    endpoint = relationship("Endpoint", back_populates="events")
