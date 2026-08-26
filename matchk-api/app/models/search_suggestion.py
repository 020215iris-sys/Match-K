"""AI 추천 검색어 캐시 테이블 (D6 [C] 후속, search_suggest.py의 DB 캐싱 개편).

⚠️ 2026-08-24 개편: "언어당 1행" → "언어+월 조합당 1행"으로 변경. 8·9·10월치를 한꺼번에
미리 만들어서 저장해두면, get_suggestions()가 "오늘이 몇 월인지" 보고 그 달 행만 골라
읽는 방식으로 자동 전환된다 (스케줄러 없이도 9월 1일이 되면 자동으로 9월 행을 읽기 시작함).
배치 스크립트(generate_search_suggestions.py)가 미리 채워두고, 사용자 요청 시엔 여기서
읽기만 한다(Claude 호출 없음). 자세한 배경은 search_suggest.py 상단 주석 참고.
"""
from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SearchSuggestionCache(Base):
    __tablename__ = "search_suggestion_cache"
    __table_args__ = (UniqueConstraint("lang", "month", name="uq_search_suggestion_cache_lang_month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    lang: Mapped[str] = mapped_column(String(8))  # "ko"/"en"/"ja"/"zh"
    month: Mapped[int] = mapped_column(Integer)  # 이 문구가 어느 달용인지 (1~12)
    items: Mapped[list] = mapped_column(JSON)  # [{"display": ..., "keyword": ...}, ...] 3개
    generated_at: Mapped[datetime] = mapped_column(DateTime)  # 마지막 생성 시각 (참고용)