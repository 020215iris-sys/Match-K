"""TourAPI 2차 실사 — 1차에서 미확정으로 남은 것들을 좁혀서 확인.

대상:
  A. 지역별 방문자수: 데이터 지연 감안한 과거 날짜로 재시도 → 응답 필드 확정
  B. 연관 관광지: 필수 파라미터(signguCd) 채워서 재시도 → 응답 필드 확정
  C. 집중률 예측: 서비스명 후보 추가 탐색 (P2 — 실패해도 무방)
  D. 국문 상세/검색/위치기반 오퍼레이션 확인 (핵심 화면 3종이 쓰는 것)

사용법: python -m app.scripts.api_survey2
호출량: 10~15콜
"""
import json
from datetime import date, timedelta
from pathlib import Path

from app.scripts.api_survey import OUT_DIR, call, get_key

REPORT = Path(OUT_DIR) / "SURVEY_REPORT2.md"
BUSAN = 6
LAST_MONTH = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y%m")


def days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).strftime("%Y%m%d")


def log(report: list, name: str, service: str, op: str, ok: bool, msg: str, rows) -> None:
    line = f"| {name} | `{service}/{op}` | {'✅' if ok else '❌'} {msg} |"
    report.append(line)
    print(line)
    if ok and rows:
        report.append(f"|  | 응답 필드 | `{', '.join(list(rows[0].keys())[:16])}` |")
        report.append(f"|  | 첫 행 샘플 | `{json.dumps(rows[0], ensure_ascii=False)[:300]}` |")
        (Path(OUT_DIR) / f"{name}.json").write_text(
            json.dumps(rows[:10], ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    Path(OUT_DIR).mkdir(parents=True, exist_ok=True)
    key = get_key()
    report: list[str] = [
        "# TourAPI 2차 실사 리포트 (전체를 Claude에게 붙여넣기)\n",
        f"실행일: {date.today().isoformat()}\n",
        "| 항목 | 시도 | 결과 |", "|---|---|---|",
    ]

    # A. 방문자수 — 지연 감안 12~8일 전 + 부산 필터
    for params in (
        {"startYmd": days_ago(12), "endYmd": days_ago(8), "areaCode": BUSAN, "numOfRows": 20},
        {"startYmd": days_ago(20), "endYmd": days_ago(14), "numOfRows": 20},  # 필터 없이 더 과거
    ):
        ok, msg, rows = call(key, "DataLabService", "locgoRegnVisitrDDList", params)
        log(report, f"A_방문자수_{params['startYmd']}", "DataLabService", "locgoRegnVisitrDDList", ok, msg, rows)
        if ok and rows:
            break

    # B. 연관 관광지 — 필수 파라미터 전부 채워서 (해운대구=16, 실패 시 중구=15)
    for sgg in (16, 15):
        ok, msg, rows = call(key, "TarRlteTarService1", "areaBasedList1",
                             {"baseYm": LAST_MONTH, "areaCd": BUSAN, "signguCd": sgg, "numOfRows": 20})
        log(report, f"B_연관관광지_구{sgg}", "TarRlteTarService1", "areaBasedList1", ok, msg, rows)
        if ok and rows:
            break

    # C. 집중률 — 후보 추가 탐색 (P2)
    for service, op in (
        ("TatsCnctrRateService", "tatsCnctrRatedList"),
        ("CnctrRateService1", "cnctrRatedList1"),
        ("TourCnctrRateService1", "areaBasedList1"),
    ):
        ok, msg, rows = call(key, service, op, {"numOfRows": 5})
        log(report, "C_집중률", service, op, ok, msg, rows)
        if ok:
            break

    # D. 핵심 오퍼레이션 3종 (국문) — 상세/검색/위치기반
    ok, msg, rows = call(key, "KorService2", "areaBasedList2",
                         {"areaCode": BUSAN, "contentTypeId": 12, "numOfRows": 1})
    cid = str(rows[0]["contentid"]) if ok and rows else None
    log(report, "D_관광지1건", "KorService2", "areaBasedList2", ok, msg, rows)
    if cid:
        ok, msg, rows = call(key, "KorService2", "detailCommon2", {"contentId": cid})
        log(report, f"D_상세({cid})", "KorService2", "detailCommon2", ok, msg, rows)
    ok, msg, rows = call(key, "KorService2", "searchKeyword2",
                         {"keyword": "해운대", "areaCode": BUSAN, "numOfRows": 2})
    log(report, "D_키워드검색", "KorService2", "searchKeyword2", ok, msg, rows)
    ok, msg, rows = call(key, "KorService2", "locationBasedList2",
                         {"mapX": 129.1604, "mapY": 35.1587, "radius": 2000, "numOfRows": 2})
    log(report, "D_위치기반", "KorService2", "locationBasedList2", ok, msg, rows)

    report.append("\n> C(집중률)가 전부 ❌면: 공공데이터포털 마이페이지 > 관광지 집중률 API > 상세기능에서")
    report.append("> Swagger의 실제 요청 URL을 복사해 함께 전달 (P2라 없어도 개발 진행에 지장 없음)")
    REPORT.write_text("\n".join(report), encoding="utf-8")
    print(f"\n[완료] {REPORT} 를 Claude에게 붙여넣으세요.")


if __name__ == "__main__":
    main()
