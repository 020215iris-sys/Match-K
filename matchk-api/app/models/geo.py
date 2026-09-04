"""국가 > 광역 > 지역(구·군) 트리 — 확장 1·2단계를 감안한 구조 (스코프 v2 §2)."""
from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Country(Base):
    __tablename__ = "countries"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)  # "KR"
    name_ko: Mapped[str] = mapped_column(String(64))
    regions: Mapped[list["Region"]] = relationship(back_populates="country")


class Region(Base):
    __tablename__ = "regions"
    id: Mapped[int] = mapped_column(primary_key=True)
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"))
    tour_area_code: Mapped[int] = mapped_column(Integer)  # TourAPI areaCode (부산=6)
    name_ko: Mapped[str] = mapped_column(String(64))
    country: Mapped["Country"] = relationship(back_populates="regions")
    districts: Mapped[list["District"]] = relationship(back_populates="region")


class District(Base):
    __tablename__ = "districts"
    id: Mapped[int] = mapped_column(primary_key=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"))
    sigungu_code: Mapped[int] = mapped_column(Integer, index=True)  # TourAPI sigunguCode
    name_ko: Mapped[str] = mapped_column(String(64))
    name_en: Mapped[str] = mapped_column(String(64))
    # ⚠️ 2026-09-04 추가: 업적지도 세부보기 리스트가 lang 무관하게 name_en만 내려주던
    # 문제 수정(지현 QA) — TourAPI 공식 다국어(areaCode2) 값으로 채움.
    name_ja: Mapped[str] = mapped_column(String(64))
    name_zh: Mapped[str] = mapped_column(String(64))
    is_declining: Mapped[bool] = mapped_column(Boolean, default=False)  # 발길 끊긴 구
    region: Mapped["Region"] = relationship(back_populates="districts")
