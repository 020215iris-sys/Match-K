"""AI 추천 검색어 캐시 테이블 (D6 [C] 후속, search_suggest.py의 DB 캐싱 개편).

언어당 1행 — 배치 스크립트(generate_search_suggestions.py)가 한 달에 한 번 정도
Claude를 호출해서 이 테이블을 덮어쓰고, 사용자 요청 시엔 여기서 읽기만 한다
(Claude 호출 없음). 자세한 배경은 search_suggest.py 상단 주석 참고.
"""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SearchSuggestionCache(Base):
    __tablename__ = "search_suggestion_cache"

    id: Mapped[int] = mapped_column(primary_key=True)
    lang: Mapped[str] = mapped_column(String(8), unique=True)  # "ko"/"en"/"ja"/"zh", 언어당 1행
    month: Mapped[int] = mapped_column(Integer)  # 생성 시점 기준 월 (1~12) — 계절 문구 유효기간 체크용
    items: Mapped[list] = mapped_column(JSON)  # [{"display": ..., "keyword": ...}, ...] 3개
    generated_at: Mapped[datetime] = mapped_column(DateTime)  # 마지막 생성 시각 (참고용)