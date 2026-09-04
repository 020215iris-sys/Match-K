"""AI 추천 검색어 배치 생성기 (D6 [C] 후속, DB 캐싱 개편 — 2026-08-23, 다월 생성 2026-08-24).

⚠️ 이 스크립트가 하는 일: TARGET_MONTHS(지금은 9·10·11·12월) × 언어 4개(ko/en/ja/zh)에 대해
   Claude를 불러서 추천 3개(display+keyword)를 만들고, search_suggestion_cache 테이블에
   upsert한다. 사용자 요청 경로(search_suggest.get_suggestions)는 "오늘이 몇 월인지" 보고
   그 달 행만 읽는다 — 그래서 9~12월치를 오늘 한 번에 다 만들어두면, 10월 1일·11월 1일·
   12월 1일이 됐을 때 아무도 아무것도 안 해도 자동으로 그 달 문구가 보이게 된다
   (스케줄러 불필요). 1차 심사자료 제출 9/21, 기능심사 10월, 시상식 11월 일정을 모두 커버.

   대신 트레이드오프: 10·11·12월 문구는 "오늘(9월) 시점"에 미리 상상해서 만드는 거라, 그때 가서
   실제 검색한 게 아님 — 그래서 계절 카테고리(1번) 키워드는 실데이터로 검증된 "전망대"로
   고정해둠(search_suggest.py의 _SEASONAL_KEYWORD 참고), 최소한 검색 결과 품질은 보장됨.

실행: python -m app.scripts.generate_search_suggestions
      (TARGET_MONTHS 범위를 벗어난 달이 오면 그때는 그 달을 리스트에 추가하고 재실행 필요)
"""
import asyncio
from datetime import datetime

from app.core.database import SessionLocal
from app.models import SearchSuggestionCache
from app.services.search_suggest import (
    FALLBACK_SAMPLES,
    _call_claude_sync,
    _category_samples,
)

_LANGS = ["ko", "en", "ja", "zh"]
TARGET_MONTHS = [9, 10, 11, 12]  # 1차 제출 9/21, 기능심사 10월, 시상식 11월 커버 + 여유 12월


async def main():
    # 실제 장소 이름 샘플(관광지/음식점/카페)은 언어·월이랑 무관하게 항상 국문 TourAPI로
    # 가져오는 자료라서, 전체 루프 밖에서 딱 한 번만 가져와서 재사용한다.
    samples = await _category_samples()

    db = SessionLocal()
    try:
        for month in TARGET_MONTHS:
            for lang in _LANGS:
                # _call_claude_sync는 원래 동기(sync) 함수 — search_suggest.py의 요청
                # 경로에서는 FastAPI 이벤트루프를 막지 않으려고 asyncio.to_thread()로
                # 감쌌었지만, 여기는 요청 처리 중이 아니라 단독으로 도는 배치 스크립트라
                # 그냥 직접 불러도 문제없다.
                items = _call_claude_sync(lang, month, samples)

                if items is None:
                    # 생성 실패(API 키 없음/장애/파싱 실패 등) — DB를 건드리지 않고 넘어간다.
                    # 기존에 저장된 값이 있으면 그대로 유지되고, 하나도 없으면 나중에
                    # get_suggestions()가 FALLBACK_SAMPLES로 알아서 폴백한다.
                    print(f"[{month}월/{lang}] 생성 실패 — 건너뜀 (기존 값 유지 또는 폴백 샘플)")
                    continue

                row = db.query(SearchSuggestionCache).filter_by(lang=lang, month=month).first()
                if row is None:
                    row = SearchSuggestionCache(lang=lang, month=month)
                    db.add(row)
                row.items = items
                row.generated_at = datetime.now()

                print(f"[{month}월/{lang}] 생성 완료: {items}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
