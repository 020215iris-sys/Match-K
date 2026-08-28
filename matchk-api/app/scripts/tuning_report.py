"""역추천 가중치 튜닝 리포트 (D7 [C]) — DB 미변경, 화면 출력만.

가중치 조합을 여러 개 돌려 8/19 인수인계 §12의 지표 3종을 한 번에 비교한다.
  (a) 세 언어권 상위5의 겹침        — 언어권 차별화. 낮을수록 좋음(0이 이상적)
  (b) 상위10 중 소멸위험 구 비율    — 컨셉 반영. auto는 DECLINING_QUOTA와 일치해야 정상
  (c) 상위10의 thin_in_your_language 개수 — 핵심 타깃 적중률. 높을수록 좋음

기준선 (2026-08-26 demo_snapshot, 현재값 · auto 상위5):
  겹침 7 / 고유 8 (15슬롯). S-train과 범일 이중섭거리가 세 언어 전부에 등장.
  소멸위험 비율은 세 언어 모두 3/5 = 60%로 DECLINING_QUOTA와 일치.

⚠️ DB는 읽기만 한다. 아무것도 쓰지 않는다.
⚠️ 번역 폴백(Papago)과 혼잡률(D8)은 점수에 영향이 없어서 꺼둔다.
   조합 × 모드 × 언어만큼 유료 API를 부르지 않기 위함.
⚠️ 후보 수집은 모드별로 한 번만 하고 재사용하되, Candidate는 score가 누적 대입되는
   객체라 조합마다 candidates_from_raw(raw)로 새로 만들어야 한다(안 그러면 점수가 쌓인다).
⚠️ nearby는 쿼터를 안 쓴다(rec_type != "auto"). (b)는 auto에서만 의미가 있다.

실행: python -m app.scripts.tuning_report
"""
import asyncio

from app.core.config import DECLINING_SIGUNGU_CODES
from app.core.database import SessionLocal
from app.services import recommender

LANGS = ("en", "ja", "zh")
MODES = ("auto", "nearby")
BUSAN_CENTER = (35.1796, 129.0756)
TOP_A = 5    # 지표 (a) 기준
TOP_BC = 10  # 지표 (b)(c) 기준

# (라벨, W_FOREIGN, W_DOMESTIC, W_THIN, W_DECLINING, DECLINING_QUOTA)
WEIGHT_SETS = (
    ("현재값(기준선)",      1.0, 0.8, 1.2, 0.6, 0.6),
    ("THIN 강화",           1.0, 0.8, 2.0, 0.6, 0.6),
    ("THIN 강화+구 완화",   0.6, 0.5, 2.0, 0.6, 0.6),
    ("THIN 최대+쿼터 완화", 0.6, 0.5, 2.4, 0.6, 0.5),
    ("DOMESTIC 제거",       1.0, 0.0, 1.6, 0.6, 0.6),
)


async def _noop_translate(text, target_lang):
    return None


async def _noop_concentration(sigungu_code, rows=100):
    return []


async def main() -> None:
    db = SessionLocal()
    recommender.translator.translate = _noop_translate
    recommender.tourapi_client.concentration_forecast = _noop_concentration
    orig = (recommender.W_FOREIGN, recommender.W_DOMESTIC, recommender.W_THIN,
            recommender.W_DECLINING, recommender.DECLINING_QUOTA)
    try:
        pools = {}
        for mode in MODES:
            kw = {"lat": BUSAN_CENTER[0], "lng": BUSAN_CENTER[1]} if mode == "nearby" else {}
            raw, _ = await recommender.collect_candidates(mode, **kw)
            pools[mode] = raw
            print(f"후보 풀 {mode}: {len(raw)}건")
        print("※ 실행 중 'visitor_stats 없음' 경고가 뜨면 W_FOREIGN/W_DOMESTIC이")
        print("  전 구 동일값이 되어 순위에 기여하지 않는 상태입니다.\n")

        for label, wf, wd, wt, wdec, quota in WEIGHT_SETS:
            recommender.W_FOREIGN = wf
            recommender.W_DOMESTIC = wd
            recommender.W_THIN = wt
            recommender.W_DECLINING = wdec
            recommender.DECLINING_QUOTA = quota
            print(f"┌─ {label}   F{wf} D{wd} T{wt} DEC{wdec} Q{quota}")

            for mode in MODES:
                raw = pools[mode]
                tops = {}
                for lang in LANGS:
                    tops[lang] = await recommender.score_and_rank(
                        db, raw, recommender.candidates_from_raw(raw), lang,
                        rec_type=mode, limit=TOP_BC)

                slots = [it["contentid"] for lang in LANGS for it in tops[lang][:TOP_A]]
                unique = len(set(slots))
                quota_note = "" if mode == "auto" else "  (nearby는 쿼터 미적용)"
                print(f"│ [{mode}] (a) 겹침 {len(slots) - unique}"
                      f"  고유 {unique}/{len(slots)}{quota_note}")

                for lang in LANGS:
                    items = tops[lang]
                    n = len(items)
                    if n == 0:
                        print(f"│   {lang}: 결과 0건")
                        continue
                    n_dec = sum(1 for it in items
                                if it["sigunguCode"] in DECLINING_SIGUNGU_CODES)
                    n_thin = sum(1 for it in items
                                 if "thin_in_your_language" in it["reasons"])
                    head = items[0]
                    print(f"│   {lang}: (b) 소멸위험 {n_dec}/{n} ({n_dec / n:.0%})"
                          f"  (c) thin {n_thin}/{n}"
                          f"  | 1위 {head['title'][:22]} ({head['score']})")
            print("└" + "─" * 64 + "\n")
    finally:
        (recommender.W_FOREIGN, recommender.W_DOMESTIC, recommender.W_THIN,
         recommender.W_DECLINING, recommender.DECLINING_QUOTA) = orig
        db.close()


if __name__ == "__main__":
    asyncio.run(main())