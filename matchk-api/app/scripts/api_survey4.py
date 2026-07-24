"""TourAPI 4차(방문자수 전용) 실사 — 마지막 미확정 하나.

3차 결론: locgoRegnVisitrDDList는 지역 필터 파라미터가 없음 (areaCode/areaCd 모두 INVALID).
남은 문제는 "왜 0건인가" — 날짜 구간을 넓게 훑어서 데이터가 존재하는 구간과 응답 필드를 찾는다.

사용법: python -m app.scripts.api_survey4
호출량: 최대 6콜
"""
import json
from datetime import date, timedelta
from pathlib import Path

from app.scripts.api_survey import OUT_DIR, call, get_key

REPORT = Path(OUT_DIR) / "SURVEY_REPORT4.md"


def days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).strftime("%Y%m%d")


def main() -> None:
    Path(OUT_DIR).mkdir(parents=True, exist_ok=True)
    key = get_key()
    report: list[str] = [
        "# TourAPI 4차 실사 리포트 — 방문자수 (전체를 Claude에게 붙여넣기)\n",
        f"실행일: {date.today().isoformat()}\n",
        "| 시도 | 결과 |", "|---|---|",
    ]

    # 0) 파라미터 전부 생략 → 필수 파라미터 에러 메시지로 스펙 채집
    ok, msg, rows = call(key, "DataLabService", "locgoRegnVisitrDDList", {})
    report.append(f"| 파라미터 없음 | {'✅' if ok else '❌'} {msg} |")
    print(report[-1])

    # 1) 날짜 구간 스캔: 단일일 기준 과거로 (7/15/30/60/120일 전)
    found = False
    for back in (7, 15, 30, 60, 120):
        ymd = days_ago(back)
        ok, msg, rows = call(key, "DataLabService", "locgoRegnVisitrDDList",
                             {"startYmd": ymd, "endYmd": ymd, "numOfRows": 30})
        line = f"| {back}일 전 ({ymd}) | {'✅' if ok else '❌'} {msg} |"
        report.append(line)
        print(line)
        if ok and rows:
            report.append(f"|  응답 필드 | `{', '.join(list(rows[0].keys())[:18])}` |")
            report.append(f"|  첫 행 | `{json.dumps(rows[0], ensure_ascii=False)[:350]}` |")
            (Path(OUT_DIR) / "A_방문자수_확정.json").write_text(
                json.dumps(rows[:30], ensure_ascii=False, indent=2), encoding="utf-8")
            found = True
            break

    if not found:
        report.append("\n> 전 구간 0건 — 공공데이터포털 마이페이지 > 지역별 방문자수_GW > 상세기능에서")
        report.append("> Swagger의 요청 예시 URL과 필수 파라미터 표를 캡처/복사해서 전달해주세요.")
        report.append("> (안 되더라도 역추천은 폴백으로 동작 — 개발 진행에 지장 없음)")
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"\n[완료] {REPORT} 를 Claude에게 붙여넣으세요.")


if __name__ == "__main__":
    main()
