"""여행 일정(스케줄러) 모델 (신규 — 2026-07-31 개편).

⚠️ 심사 정책 (계획서 §4): 콘텐츠(설명·이미지)는 저장하지 않는다.
   itinerary_items는 **참조 키**(contentid·좌표·구·타입)와 표시용 최소 캐시(title)만 담고,
   상세 콘텐츠는 앱이 열 때 TourAPI 실시간 호출로 채운다. (landmark.py와 동일 원칙)

이 데이터는 나중에 역추천 보강용 신호로도 쓴다:
언어권별 실제 코스 · 같은 일차 동시등장 · 동선(sort_order) · 소멸위험 구 담김 비율.
"""
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Itinerary(Base):
    """일정 파일 하나 (예: "중국 4일"). 일정명 + 여행기간만 받아 생성."""

    __tablename__ = "itineraries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    items: Mapped[list["ItineraryItem"]] = relationship(
        back_populates="itinerary", cascade="all, delete-orphan")


class ItineraryItem(Base):
    """일정에 담긴 장소 하나 = 특정 일차의 한 항목.

    day_index: 1일차=1. sort_order: 일차 내 순서(드래그앤드랍).
    contentid는 seed에 없는 검색 결과도 담을 수 있어 **landmarks에 FK로 묶지 않는다**.
    """

    __tablename__ = "itinerary_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    itinerary_id: Mapped[int] = mapped_column(ForeignKey("itineraries.id"), index=True)
    contentid: Mapped[str] = mapped_column(String(32), index=True)
    day_index: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 참조 키 (콘텐츠 아님)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    sigungu_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contenttypeid: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # 표시용 최소 캐시 (리스트 즉시 표시용 — 상세는 실시간 호출)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    itinerary = relationship("Itinerary", back_populates="items")
