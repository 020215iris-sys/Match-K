"""역추천 실데이터 스냅샷 (D7 [C] DoD) — 파이프라인 완주 확인용.

3개 언어권(ja/zh/en) × 2모드(auto/nearby)로 recommend()를 직접 실행해서
결과를 docs/api-samples/RECO_SNAPSHOT.md 로 저장한다.

전제: seed_landmarks 실행 완료 (도장 제외 필터가 DB를 참조)
사용법: python -m app.scripts.demo_snapshot
호출량: 첫 실행 기준 30~60콜 (언어별 등록 리스트 수집 포함, 이후 24h 캐시)
"""
import asyncio
from datetime import date
from pathlib import Path

from app.core.database import Base, SessionLocal, engine
from app.services.recommender import recommend

OUT = Path("docs/api-samples/RECO_SNAPSHOT.md")
BUSAN_CENTER = (35.1796, 129.0756)
LANG_LABEL = {"ja": "일본어권", "zh": "중국어권", "en": "영어권"}


async def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    lines = [
        "# 역추천 실데이터 스냅샷 (D7 [C] DoD)\n",
        f"실행일: {date.today().isoformat()}  |  전체를 Claude/팀 노션에 붙여넣기\n",
    ]
    try:
        for lang in ("ja", "zh", "en"):
            for mode in ("auto", "nearby"):
                kwargs = {"lat": BUSAN_CENTER[0], "lng": BUSAN_CENTER[1]} if mode == "nearby" else {}
                try:
                    items = await recommend(db, lang, rec_type=mode, limit=5, **kwargs)
                except Exception as e:
                    lines.append(f"## {LANG_LABEL[lang]} · {mode} — ❌ {type(e).__name__}: {str(e)[:120]}\n")
                    print(lines[-1])
                    continue
                lines.append(f"## {LANG_LABEL[lang]} · {mode} (상위 {len(items)}건)\n")
                lines.append("| # | 랜드마크 | 구 | 점수 | 혼잡% | 사유 |")
                lines.append("|---|---|---|---|---|---|")
                for i, it in enumerate(items, 1):
                    lines.append(
                        f"| {i} | {it['title']} | {it['sigunguCode']} | {it['score']} "
                        f"| {it['congestion'] if it['congestion'] is not None else '-'} "
                        f"| {', '.join(it['reasons']) or '-'} |")
                lines.append("")
                print(f"{LANG_LABEL[lang]} {mode}: {len(items)}건")
        lines.append("> 확인 포인트: (1) 언어권마다 순위가 다른가  (2) auto가 동/서/영도구 위주인가")
        lines.append("> (3) hidden_district / thin_in_your_language 사유가 붙는가  (4) 혼잡%가 붙는 곳이 있는가")
    finally:
        db.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[완료] {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
