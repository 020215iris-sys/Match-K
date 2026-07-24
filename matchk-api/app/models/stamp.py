from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Stamp(Base):
    """랜드마크 방문 = 도장 1개. 중복 도장 방지 unique 제약 (D4 [B]).

    is_hidden: 히든 미션으로 수집한 도장 = 별도 컬렉션. 일반 업적지도 진행률에서 제외.
    """

    __tablename__ = "stamps"
    __table_args__ = (UniqueConstraint("user_id", "landmark_id", name="uq_stamp_user_landmark"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    landmark_id: Mapped[int] = mapped_column(ForeignKey("landmarks.id"), index=True)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    landmark = relationship("Landmark")
