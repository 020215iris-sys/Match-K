"""랜드마크 참조 테이블.

⚠️ 심사 정책 (계획서 §4): 이 테이블은 도장 무결성·GPS 판정용 '참조 키'만 저장한다.
이름/이미지/설명 등 관광 콘텐츠 필드를 추가하지 말 것 — 콘텐츠는 전량 TourAPI 실시간 호출.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Landmark(Base):
    __tablename__ = "landmarks"

    id: Mapped[int] = mapped_column(primary_key=True)
    contentid: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # TourAPI 국문 기준
    district_id: Mapped[int] = mapped_column(ForeignKey("districts.id"), index=True)
    mapx: Mapped[float] = mapped_column(Float)  # 경도 (TourAPI mapx = longitude)
    mapy: Mapped[float] = mapped_column(Float)  # 위도 (TourAPI mapy = latitude)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # 히든 장소 = 소멸위험 구 + 외국어 미등록. 일반 도장판에서 제외되고 히든 미션 대상이 됨.
    # (mark_hidden 스크립트가 lang_mapping 커버리지로 지정 — 팀 회의로 기준 조정 가능)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    district = relationship("District")
