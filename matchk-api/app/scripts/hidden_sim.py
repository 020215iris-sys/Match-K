"""히든 기준 시뮬레이션 + 커버리지 진단 (DB 미변경).

두 가지를 한 번에 본다.
  [진단] 외국어 등록부가 상한(500)에 잘렸는지 / 언어별 매칭이 몇 건인지
  [시뮬] 비율 조합별로 구마다 히든/일반이 몇 건이 되는지

8/4 §7 문제 1 대응. 해결 대상이 두 개다.
  (a) 소멸위험 3개 구가 통째로 히든 → 업적지도 구 목록에서 그 구가 사라짐
  (b) 나머지 13개 구는 히든이 0개 → 히든 미션이 3구 전용 기능

DB는 읽기만 한다. mark_hidden 실행 전에 비율을 정하는 용도.
실행: python -m app.scripts.hidden_sim
"""
import asyncio
import math

from app.core.database import SessionLocal
from app.models import District, Landmark
from app.services import lang_mapping, tourapi_client

# 시뮬레이션할 (소멸위험 구 비율, 일반 구 비율) 조합
RATIO_SETS = (
    (1.0, 0.0),   # 현재 동작 — 3구 전량 히든, 나머지 0
    (0.4, 0.2),   # 제안안
    (0.3, 0.15),
    (0.5, 0.25),
)
MIN_NORMAL = 3   # 구별로 일반 도장을 최소 몇 곳 남길지


def n_hidden_for(total: int, n_cand: int, ratio: float) -> int:
    """구 하나의 히든 개수 = min(후보수, 전체×비율, 전체−최소일반). 음수 방지."""
    return min(n_cand, math.floor(total * ratio), max(total - MIN_NORMAL, 0))


async def main() -> None:
    db = SessionLocal()
    try:
        districts = db.query(District).all()
        if not districts:
            print("구가 시드되지 않음 — seed_landmarks 먼저 실행")
            return

        # ── [진단 1] 외국어 등록부 크기 ───────────────────────────────
        # 500이면 max_pages 상한에 잘린 것 → 미등록 오판 가능. 500 미만이면 정상 수집.
        print("── 외국어 등록부 진단 ──")
        for lang in lang_mapping.FOREIGN_LANGS:
            try:
                reg = await lang_mapping.build_lang_registry(lang)
                flag = "  ⚠️ 상한(500)에 걸림 — 잘렸을 수 있음" if len(reg) >= 500 else ""
                print(f"  {lang}: {len(reg)}건{flag}")
            except Exception as e:
                print(f"  {lang}: 실패 {type(e).__name__} — 서비스 미승인 가능성")
        print()

        # 국문 후보 (mark_hidden과 동일한 수집 방식)
        raw = []
        for page in (1, 2, 3):
            batch = await tourapi_client.list_by_area("ko", page=page, content_type_id=12,
                                                      use_long_cache=True)
            raw.extend(batch)
            if len(batch) < 100:
                break
        coverage = await lang_mapping.coverage_by_contentid(raw)
        has_image = {
            str(i.get("contentid")): bool(i.get("firstimage") or i.get("firstimage2"))
            for i in raw
        }

        # ── [진단 2] 커버리지 분포 ────────────────────────────────────
        hits = {n: 0 for n in range(4)}
        per_lang = {l: 0 for l in lang_mapping.FOREIGN_LANGS}
        for cov in coverage.values():
            n = sum(1 for l in lang_mapping.FOREIGN_LANGS if cov.get(l))
            hits[n] += 1
            for l in lang_mapping.FOREIGN_LANGS:
                if cov.get(l):
                    per_lang[l] += 1
        print("── 커버리지 진단 ──")
        print(f"  국문 후보 {len(raw)}건 / 판정 {len(coverage)}건")
        print("  언어별 매칭: " + " / ".join(f"{l}={n}" for l, n in per_lang.items()))
        print(f"  등록 언어 수: 0개={hits[0]} 1개={hits[1]} 2개={hits[2]} 3개={hits[3]}")
        print(f"  비대칭 등록(역추천 핵심 타깃) = {hits[1] + hits[2]}건")
        print("  ※ 참고 — 2026-07-24 팀 리포트: en=51 ja=46 zh=46 / 0개=101 1개=3 2개=13 3개=38")
        print()

        # ── 구별 후보 집계 ───────────────────────────────────────────
        stats = []
        for d in sorted(districts, key=lambda x: x.sigungu_code):
            lms = db.query(Landmark).filter(Landmark.district_id == d.id).all()
            n_cand = n_no_img = 0
            for lm in lms:
                cid = str(lm.contentid)
                cov = coverage.get(cid)
                no_foreign = cov is None or not any(cov.get(l) for l in lang_mapping.FOREIGN_LANGS)
                if no_foreign:
                    n_cand += 1
                    if not has_image.get(cid, False):
                        n_no_img += 1
            stats.append((d.sigungu_code, len(lms), n_cand, n_no_img, d.is_declining))

        # ── 비율 조합별 시뮬 ─────────────────────────────────────────
        for r_dec, r_nor in RATIO_SETS:
            print(f"┌─ 소멸위험 {r_dec:.0%} / 일반 {r_nor:.0%} (구별 일반 최소 {MIN_NORMAL}곳)")
            total_h = n_with_hidden = 0
            for code, total, n_cand, n_no_img, is_dec in stats:
                n = n_hidden_for(total, n_cand, r_dec if is_dec else r_nor)
                total_h += n
                if n > 0:
                    n_with_hidden += 1
                mark = "★" if is_dec else " "
                warn = "  ⚠️일반0" if total - n == 0 else ""
                print(f"│ {mark}구{code:>2}: 전체{total:>3} 후보{n_cand:>3} "
                      f"(이미지없음{n_no_img:>3}) → 히든{n:>2} 일반{total - n:>3}{warn}")
            print(f"└─ 합계 히든 {total_h}건 / 히든이 있는 구 {n_with_hidden}개\n")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())