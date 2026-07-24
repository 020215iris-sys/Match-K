from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(128), default="Traveler")
    # 언어권 (ja/zh/en, 한국인 유저는 ko) — UI 언어이자 역추천 그룹의 기본값.
    # 역추천 API 호출 시에는 쿼리 파라미터 lang이 우선한다 (게스트/언어변경 대응, D5 [B]).
    lang: Mapped[str] = mapped_column(String(8), default="en")
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
