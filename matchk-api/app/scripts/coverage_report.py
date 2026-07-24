"""언어 간 커버리지 진단 (D6 [C] DoD '매핑 성공률 로그').

세 언어권 결과가 동일한 원인 판별:
  (a) 좌표 매칭 실패 → 매칭 수가 0에 가까움
  (b) 데이터 현실(비대칭 등록 희소) → 매칭은 되는데 비대칭 장소가 적음/특정 구에 없음

사용법: python -m app.scripts.coverage_report  (호출 30~40콜, 24h 캐시)
"""
import asyncio
from collections import Counter
from datetime import date
from pathlib import Path

from app.services import lang_mapping, tourapi_client

OUT = Path("docs/api-samples/COVERAGE_REPORT.md")


async def main() -> None:
    raw = []
    for page in (1, 2, 3):
        batch = await tourapi_client.list_by_area("ko", page=page, content_type_id=12, use_long_cache=True)
        raw.extend(batch)
        if len(batch) < 100:
            break
    coverage = await lang_mapping.coverage_by_contentid(raw)
    by_id = {str(i.get("contentid")): i for i in raw}

    total = len(coverage)
    hit_counts = Counter()
    asym = []  # (title, 구코드, 등록된 언어들)
    for cid, cov in coverage.items():
        hits = [l for l, v in cov.items() if v]
        hit_counts[len(hits)] += 1
        if 1 <= len(hits) <= 2:
            item = by_id.get(cid, {})
            asym.append((item.get("title", "?"), item.get("sigungucode", "?"), ",".join(hits)))

    lang_hits = {l: sum(1 for c in coverage.values() if c.get(l)) for l in ("en", "ja", "zh")}
    lines = [
        "# 언어 간 커버리지 진단 (전체를 Claude에게 붙여넣기)\n",
        f"실행일: {date.today().isoformat()}\n",
        f"- 국문 관광지 후보: {total}건",
        f"- 언어별 매칭 성공: en={lang_hits['en']} / ja={lang_hits['ja']} / zh={lang_hits['zh']}",
        f"- 등록 언어 수 분포: 0개={hit_counts[0]} / 1개={hit_counts[1]} / 2개={hit_counts[2]} / 3개={hit_counts[3]}",
        f"\n## 비대칭 등록 장소 (역추천 핵심 타깃, {len(asym)}건 중 상위 25)\n",
        "| 장소 | 구코드 | 등록된 언어권 |", "|---|---|---|",
    ]
    for title, sgg, langs in asym[:25]:
        lines.append(f"| {title} | {sgg} | {langs} |")
    if lang_hits["en"] + lang_hits["ja"] + lang_hits["zh"] == 0:
        lines.append("\n> ⚠️ 매칭 0건 = 좌표 매칭 실패 (원인 a) — Claude가 매칭 로직을 수정해야 함")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"[완료] {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
