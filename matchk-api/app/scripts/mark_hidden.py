"""히든 장소 지정 (신규) — 소멸위험 구 + 외국어 미등록 랜드마크를 is_hidden=True로.

기준 (팀 회의로 조정 가능):
- 소멸위험 구(DECLINING_SIGUNGU_CODES)에 속하고
- 3개 외국어(en/ja/zh) 모두에 미등록인 곳 = '숨은 곳' = 히든 미션 대상

이렇게 지정된 장소는 일반 도장판에서 빠지고, 히든 미션으로만 수집 가능해진다.
seed_landmarks 실행 후 1회 실행. 커버리지는 lang_mapping이 실시간 호출로 판정.

실행: python -m app.scripts.mark_hidden
"""
import asyncio

from app.core.config import DECLINING_SIGUNGU_CODES
from app.core.database import SessionLocal
from app.models import District, Landmark
from app.services import lang_mapping, tourapi_client


async def main() -> None:
    db = SessionLocal()
    try:
        # 소멸위험 구의 district.id 집합
        declining_ids = {
            d.id for d in db.query(District)
            .filter(District.sigungu_code.in_(DECLINING_SIGUNGU_CODES)).all()
        }
        if not declining_ids:
            print("소멸위험 구가 시드되지 않음 — seed_landmarks 먼저 실행")
            return

        # 국문 후보 전체를 외국어 등록부와 대조 (coverage)
        raw = []
        for page in (1, 2, 3):
            batch = await tourapi_client.list_by_area("ko", page=page, content_type_id=12,
                                                      use_long_cache=True)
            raw.extend(batch)
            if len(batch) < 100:
                break
        coverage = await lang_mapping.coverage_by_contentid(raw)

        marked = 0
        for lm in db.query(Landmark).filter(Landmark.district_id.in_(declining_ids)).all():
            cov = coverage.get(str(lm.contentid))
            # 외국어 커버리지 정보가 없거나(=국문 전용) 3개 언어 모두 미등록이면 히든
            no_foreign = cov is None or not any(cov.get(l) for l in lang_mapping.FOREIGN_LANGS)
            lm.is_hidden = bool(no_foreign)
            if lm.is_hidden:
                marked += 1
        db.commit()
        print(f"히든 지정 완료: {marked}건 (소멸위험 구의 외국어 미등록 장소)")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
