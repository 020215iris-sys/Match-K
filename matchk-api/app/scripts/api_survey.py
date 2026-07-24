"""TourAPI 실사 자동화 스크립트 (D1 [C] + D2 검증).

역할: 승인받은 API들을 실제로 호출해서
  1) 어떤 서비스명/오퍼레이션명이 살아있는지 자동 탐색 (후보를 순서대로 시도)
  2) 성공 응답 샘플을 docs/api-samples/*.json 으로 저장 (D1 DoD)
  3) 부산 시군구 코드 1~16 실데이터 대조 (D2 DoD)
  4) 사람이 읽을 요약을 docs/api-samples/SURVEY_REPORT.md 로 생성
     → 이 파일 내용을 Claude에게 붙여넣으면 코드 상수/파싱을 확정해줌

사용법 (matchk-api 폴더에서, .env에 TOURAPI_KEY 설정 후):
    python -m app.scripts.api_survey

호출량: 총 20~30콜 (일 한도 1,000건 대비 안전)
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import unquote

import httpx

from app.core.config import get_settings

settings = get_settings()
OUT_DIR = Path("docs/api-samples")
BASE = "https://apis.data.go.kr/B551011"
BUSAN = 6

# ---------- 탐색 후보 (위에서부터 시도, 성공하면 멈춤) ----------
# 형식: (별칭, 서비스명, 오퍼레이션, 추가파라미터)
LAST_MONTH = (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y%m")
YESTERDAY = (date.today() - timedelta(days=2)).strftime("%Y%m%d")

CANDIDATES: dict[str, list[tuple[str, str, dict]]] = {
    "1_국문_관광정보": [
        ("KorService2", "areaBasedList2", {"areaCode": BUSAN, "numOfRows": 3}),
        ("KorService1", "areaBasedList1", {"areaCode": BUSAN, "numOfRows": 3}),
    ],
    "6_지역별_방문자수": [
        ("DataLabService", "locgoRegnVisitrDDList", {"startYmd": YESTERDAY, "endYmd": YESTERDAY, "numOfRows": 5}),
        ("DataLabService1", "locgoRegnVisitrDDList1", {"startYmd": YESTERDAY, "endYmd": YESTERDAY, "numOfRows": 5}),
        ("LocgoHubTarService", "areaBasedList", {"startYmd": YESTERDAY, "endYmd": YESTERDAY, "numOfRows": 5}),
    ],
    "7_연관_관광지": [
        ("TarRlteTarService1", "areaBasedList1", {"baseYm": LAST_MONTH, "areaCd": BUSAN, "numOfRows": 3}),
        ("TarRlteTarService", "areaBasedList", {"baseYm": LAST_MONTH, "areaCd": BUSAN, "numOfRows": 3}),
    ],
    "8_집중률_예측": [
        ("TatsCnctrRateService1", "tatsCnctrRatedList1", {"numOfRows": 3}),
        ("CnctrRateService", "areaBasedList", {"numOfRows": 3}),
    ],
}
# 다국어(2~5번)는 국문에서 성공한 버전 suffix를 따라감
MULTILANG = {"2_영문": "EngService", "3_일문": "JpnService", "4_중문간체": "ChsService", "5_중문번체": "ChtService"}


def get_key() -> str:
    key = settings.TOURAPI_KEY
    if not key:
        raise SystemExit("[!] .env에 TOURAPI_KEY가 없습니다.")
    if "%" in key:  # Encoding 키를 넣은 경우 자동 복원
        key = unquote(key)
        print("[i] 인코딩된 키 감지 → Decoding 키로 변환해서 사용")
    return key


def call(key: str, service: str, op: str, params: dict) -> tuple[bool, str, dict | list | None]:
    """반환: (성공여부, 진단메시지, items)"""
    q = {"serviceKey": key, "MobileOS": "ETC", "MobileApp": "MatchK", "_type": "json", **params}
    try:
        r = httpx.get(f"{BASE}/{service}/{op}", params=q, timeout=12)
    except Exception as e:
        return False, f"연결 실패: {type(e).__name__}", None
    if r.status_code != 200:
        return False, f"HTTP {r.status_code}: {r.text[:120]}", None
    text = r.text
    try:
        body = r.json()["response"]["body"]
        items = body.get("items") or {}
        rows = items.get("item", []) if isinstance(items, dict) else []
        if isinstance(rows, dict):
            rows = [rows]
        return True, f"OK ({body.get('totalCount', '?')}건)", rows
    except Exception:
        # XML 에러 응답 → 원인 코드 추출 (인증/등록/파라미터 구분에 중요)
        m = re.search(r"<returnAuthMsg>([^<]+)</returnAuthMsg>|<resultMsg>([^<]+)</resultMsg>", text)
        msg = (m.group(1) or m.group(2)) if m else text[:120]
        return False, f"API 에러: {msg}", None


def probe(key: str, name: str, cands: list, report: list) -> tuple[str, str] | None:
    for service, op, params in cands:
        ok, msg, rows = call(key, service, op, params)
        line = f"| {name} | `{service}/{op}` | {'✅' if ok else '❌'} {msg} |"
        report.append(line)
        print(line)
        if ok:
            (OUT_DIR / f"{name}.json").write_text(
                json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
            if rows:
                report.append(f"|  | 응답 필드 | `{', '.join(list(rows[0].keys())[:14])}` |")
            return service, op
    return None


def verify_sigungu(key: str, kor_service: str, report: list) -> None:
    """부산 시군구 코드 실데이터 대조 (D2 DoD) — seed 스크립트의 추정 매핑 검증."""
    suffix = "2" if kor_service.endswith("2") else "1"
    ok, msg, rows = call(key, kor_service, f"areaCode{suffix}", {"areaCode": BUSAN, "numOfRows": 30})
    report.append(f"\n## 부산 시군구 코드 (areaCode{suffix}) — {msg}\n")
    if ok and rows:
        for r in rows:
            report.append(f"- {r.get('code')} = {r.get('name')}")
        (OUT_DIR / "0_부산_시군구코드.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    key = get_key()
    report: list[str] = [
        "# TourAPI 실사 리포트 (이 파일 전체를 Claude에게 붙여넣기)\n",
        f"실행일: {date.today().isoformat()}\n",
        "| API | 시도 | 결과 |", "|---|---|---|",
    ]

    kor = probe(key, "1_국문_관광정보", CANDIDATES["1_국문_관광정보"], report)
    if kor:
        suffix = "2" if kor[0].endswith("2") else "1"
        for name, svc_base in MULTILANG.items():
            probe(key, name, [(f"{svc_base}{suffix}", kor[1], {"areaCode": BUSAN, "numOfRows": 3})], report)
        verify_sigungu(key, kor[0], report)

    for name in ("6_지역별_방문자수", "7_연관_관광지", "8_집중률_예측"):
        probe(key, name, CANDIDATES[name], report)

    report.append("\n> ❌인 항목은 공공데이터포털 마이페이지 > 해당 API > 상세기능(Swagger)에서")
    report.append("> 실제 엔드포인트 URL을 복사해서 리포트와 함께 전달해주세요.")
    (OUT_DIR / "SURVEY_REPORT.md").write_text("\n".join(report), encoding="utf-8")
    print(f"\n[완료] {OUT_DIR}/SURVEY_REPORT.md 를 Claude에게 붙여넣으세요.")


if __name__ == "__main__":
    main()
