"""TourAPI 3차(최종) 실사 — 법정동 코드 가설 검증.

2차 단서: detailCommon2의 lDongRegnCd/lDongSignguCd → 빅데이터 계열은
법정동 코드(부산=26, 해운대구=26350) 사용 추정. 이걸로 재시도해서 응답 필드까지 확정.

사용법: python -m app.scripts.api_survey3
호출량: 6~10콜
"""
import json
from datetime import date, timedelta
from pathlib import Path

from app.scripts.api_survey import OUT_DIR, call, get_key

REPORT = Path(OUT_DIR) / "SURVEY_REPORT3.md"
LDONG_BUSAN = 26
LDONG_HAEUNDAE = 26350
LDONG_JUNG = 26110


def days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).strftime("%Y%m%d")


def month_ago(n: int) -> str:
    d = date.today().replace(day=1)
    for _ in range(n):
        d = (d - timedelta(days=1)).replace(day=1)
    return d.strftime("%Y%m")


def log(report: list, name: str, service: str, op: str, params: dict, ok: bool, msg: str, rows) -> bool:
    p_str = ", ".join(f"{k}={v}" for k, v in params.items() if k != "numOfRows")
    line = f"| {name} | `{op}` ({p_str}) | {'✅' if ok else '❌'} {msg} |"
    report.append(line)
    print(line)
    if ok and rows:
        report.append(f"|  | 응답 필드 | `{', '.join(list(rows[0].keys())[:18])}` |")
        report.append(f"|  | 첫 행 | `{json.dumps(rows[0], ensure_ascii=False)[:350]}` |")
        (Path(OUT_DIR) / f"{name}.json").write_text(
            json.dumps(rows[:15], ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    return False


def main() -> None:
    Path(OUT_DIR).mkdir(parents=True, exist_ok=True)
    key = get_key()
    report: list[str] = [
        "# TourAPI 3차 실사 리포트 (전체를 Claude에게 붙여넣기)\n",
        f"실행일: {date.today().isoformat()}\n",
        "| 항목 | 시도 (파라미터) | 결과 |", "|---|---|---|",
    ]

    # A. 방문자수 — 법정동 코드 + 기간 조합
    for params in (
        {"startYmd": days_ago(12), "endYmd": days_ago(8), "areaCd": LDONG_BUSAN, "numOfRows": 30},
        {"startYmd": days_ago(12), "endYmd": days_ago(8), "areaCd": LDONG_BUSAN, "signguCd": LDONG_HAEUNDAE, "numOfRows": 30},
        {"startYmd": days_ago(40), "endYmd": days_ago(35), "areaCd": LDONG_BUSAN, "numOfRows": 30},
    ):
        ok, msg, rows = call(key, "DataLabService", "locgoRegnVisitrDDList", params)
        if log(report, "A_방문자수", "DataLabService", "locgoRegnVisitrDDList", params, ok, msg, rows):
            break

    # B. 연관 관광지 — 법정동 코드 + 기준연월 조합
    for params in (
        {"baseYm": month_ago(1), "areaCd": LDONG_BUSAN, "signguCd": LDONG_HAEUNDAE, "numOfRows": 30},
        {"baseYm": month_ago(2), "areaCd": LDONG_BUSAN, "signguCd": LDONG_HAEUNDAE, "numOfRows": 30},
        {"baseYm": month_ago(2), "areaCd": LDONG_BUSAN, "signguCd": LDONG_JUNG, "numOfRows": 30},
    ):
        ok, msg, rows = call(key, "TarRlteTarService1", "areaBasedList1", params)
        if log(report, "B_연관관광지", "TarRlteTarService1", "areaBasedList1", params, ok, msg, rows):
            break

    # C. 집중률 — 필수 areaCd 채워서
    for params in (
        {"areaCd": LDONG_BUSAN, "numOfRows": 10},
        {"areaCd": LDONG_BUSAN, "signguCd": LDONG_HAEUNDAE, "numOfRows": 10},
    ):
        ok, msg, rows = call(key, "TatsCnctrRateService", "tatsCnctrRatedList", params)
        if log(report, "C_집중률", "TatsCnctrRateService", "tatsCnctrRatedList", params, ok, msg, rows):
            break

    report.append("\n> 전부 ✅면 실사 끝 — 이 리포트가 마지막. ❌ 남으면 해당 API만 Swagger 확인.")
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"\n[완료] {REPORT} 를 Claude에게 붙여넣으세요.")


if __name__ == "__main__":
    main()
