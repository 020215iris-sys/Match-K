"""AI 추천 검색어 배치 생성기 (D6 [C] 후속, DB 캐싱 개편 — 2026-08-23).

⚠️ 이 스크립트가 하는 일: 언어 4개(ko/en/ja/zh)에 대해 Claude를 딱 한 번씩만 불러서
   추천 3개(display+keyword)를 만들고, search_suggestion_cache 테이블에 upsert한다.
   사용자 요청 경로(search_suggest.get_suggestions)는 이 결과를 읽기만 하고,
   Claude를 직접 부르지 않는다 — 그래서 유저가 몇 명이든 호출 횟수는 안 늘어난다.

실행: python -m app.scripts.generate_search_suggestions
      (계절 문구가 "이번 달" 기준이라, 한 달에 한 번 정도 재실행 필요 — search_suggest.py 상단 주석 참고)
"""
import asyncio
from datetime import date, datetime

from app.core.database import SessionLocal
from app.models import SearchSuggestionCache
from app.services.search_suggest import (
    FALLBACK_SAMPLES,
    _call_claude_sync,
    _category_samples,
)

_LANGS = ["ko", "en", "ja", "zh"]


async def main():
    # 실제 장소 이름 샘플(관광지/음식점/카페)은 언어랑 무관하게 항상 국문 TourAPI로 가져오는
    # 자료라서, 언어 4개마다 따로 조회할 필요 없이 딱 한 번만 가져와서 재사용한다.
    samples = await _category_samples()
    month = date.today().month

    db = SessionLocal()
    try:
        for lang in _LANGS:
            # _call_claude_sync는 원래 동기(sync) 함수 — search_suggest.py의 요청 경로에서는
            # FastAPI 이벤트루프를 막지 않으려고 asyncio.to_thread()로 감쌌었지만, 여기는
            # 요청 처리 중이 아니라 단독으로 도는 배치 스크립트라 그냥 직접 불러도 문제없다.
            items = _call_claude_sync(lang, month, samples)

            if items is None:
                # 생성 실패(API 키 없음/장애/파싱 실패 등) — DB를 건드리지 않고 넘어간다.
                # 기존에 저장된 값이 있으면 그대로 유지되고, 하나도 없으면 나중에
                # get_suggestions()가 FALLBACK_SAMPLES로 알아서 폴백한다.
                print(f"[{lang}] 생성 실패 — 건너뜀 (기존 값 유지 또는 폴백 샘플 사용됨)")
                continue

            row = db.query(SearchSuggestionCache).filter_by(lang=lang).first()
            if row is None:
                row = SearchSuggestionCache(lang=lang)
                db.add(row)
            row.month = month
            row.items = items
            row.generated_at = datetime.now()

            print(f"[{lang}] 생성 완료: {items}")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
