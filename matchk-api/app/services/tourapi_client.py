"""한국관광공사 TourAPI 클라이언트 (D3 [C]).

- 모든 관광 콘텐츠는 이 모듈을 통해 실시간 호출 (심사 조건)
- 캐시 TTL 차등: 일반 조회 short(5분) / 언어별 리스트 비교·방문자수 long(24h)
- ✅ 실사 검증 완료 (2026-07-13, 1~3차 SURVEY_REPORT):
    관광정보 5종 = {Kor,Eng,Jpn,Chs,Cht}Service2 / *2 오퍼레이션 (필드까지 확정)
    연관 관광지 = TarRlteTarService1/areaBasedList1 — 법정동 코드, rlteRank 포함 (601건 검증)
    집중률 = TatsCnctrRateService/tatsCnctrRatedList — areaCd+signguCd 필수 (570건 검증)
    방문자수 = DataLabService/locgoRegnVisitrDDList — 경로 확정, 데이터 구간은 4차 추적 중
"""
import json
from datetime import date, timedelta
from typing import Any

import httpx

from app.core.cache import cache_get, cache_set, long_cache, short_cache
from app.core.config import SIGUNGU_TO_LDONG, get_settings

settings = get_settings()

BASE_URL = "https://apis.data.go.kr/B551011"

# 언어권 3분법 (스코프 v2 §4): zh 계열은 간체로 통합, 그 외 en 폴백
SERVICE_BY_LANG = {
    "ko": "KorService2",
    "en": "EngService2",
    "ja": "JpnService2",
    "zh": "ChsService2",
    "zh-tw": "ChtService2",  # 대만/홍콩 백업 (확장 시 분리)
}
RELATED_SERVICE = "TarRlteTarService1"          # ✅ 실사 확정
DATALAB_SERVICE = "DataLabService"              # ✅ 실사 확정
CONCENTRATION_SERVICE = "TatsCnctrRateService"  # ✅ 2차 실사: 생존 확인 (필수 areaCd)
CONCENTRATION_OP = "tatsCnctrRatedList"
BUSAN_LDONG = 26  # 빅데이터 계열은 법정동 코드 사용 (부산=26)


class TourApiError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def normalize_lang(lang: str | None) -> str:
    """OS 로케일 → 언어권 (스코프 v2 §4 표)."""
    if not lang:
        return "en"
    low = lang.lower()
    if low.startswith("ko"):
        return "ko"
    if low.startswith("ja"):
        return "ja"
    if low.startswith("zh"):
        return "zh"
    return "en"


def _service(lang: str) -> str:
    return SERVICE_BY_LANG.get(normalize_lang(lang), SERVICE_BY_LANG["en"])


def _recent_window(days_back: int = 30) -> tuple[str, str]:
    """방문자수용 조회 기준일 — ✅ 4차 실사: 데이터 지연 약 1개월 (30일 전 804건, 15일 전 0건).
    단일일 조회 (전국 1일치 ≈ 800행)."""
    ymd = (date.today() - timedelta(days=days_back)).strftime("%Y%m%d")
    return ymd, ymd


def _prev_month() -> str:
    return (date.today().replace(day=1) - timedelta(days=1)).strftime("%Y%m")


async def _get(service: str, operation: str, params: dict[str, Any], use_long_cache: bool = False) -> list[dict]:
    """공통 GET. 응답 body.items.item 리스트를 반환. 캐시 적용."""
    query = {
        "serviceKey": settings.TOURAPI_KEY,
        "MobileOS": "ETC",
        "MobileApp": "MatchK",
        "_type": "json",
        **{k: v for k, v in params.items() if v is not None},
    }
    cache = long_cache if use_long_cache else short_cache
    key = f"{service}/{operation}?" + "&".join(f"{k}={v}" for k, v in sorted(query.items()) if k != "serviceKey")
    cached = cache_get(cache, key)
    if cached is not None:
        return cached

    url = f"{BASE_URL}/{service}/{operation}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=query)
    if resp.status_code != 200:
        raise TourApiError(f"HTTP {resp.status_code} from {operation}", resp.status_code)
    try:
        body = resp.json()["response"]["body"]
    except (json.JSONDecodeError, KeyError):
        # 한도 초과/인증 오류 시 XML 에러가 오는 경우 있음
        raise TourApiError(f"unexpected_response: {resp.text[:200]}")
    items = body.get("items") or {}
    result = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(result, dict):
        result = [result]
    cache_set(cache, key, result)
    return result


# ---------- 관광정보 서비스 (국/영/일/중) — ✅ 실사 확정 ----------

async def list_by_area(lang: str, area_code: int | None = None, sigungu_code: int | None = None,
                       page: int = 1, rows: int = 100, content_type_id: int | None = None,
                       use_long_cache: bool = False) -> list[dict]:
    return await _get(_service(lang), "areaBasedList2", {
        "areaCode": area_code or settings.BUSAN_AREA_CODE,
        "sigunguCode": sigungu_code, "contentTypeId": content_type_id,
        "pageNo": page, "numOfRows": rows,
        "arrange": "Q",  # 수정일순+이미지
    }, use_long_cache=use_long_cache)


async def search_by_keyword(lang: str, keyword: str, area_code: int | None = None, rows: int = 20) -> list[dict]:
    # keyword는 원문 그대로 — httpx가 인코딩함 (quote() 쓰면 이중 인코딩 버그)
    return await _get(_service(lang), "searchKeyword2", {
        "keyword": keyword, "areaCode": area_code or settings.BUSAN_AREA_CODE, "numOfRows": rows,
    })


async def detail_common(lang: str, contentid: str) -> dict | None:
    items = await _get(_service(lang), "detailCommon2", {"contentId": contentid})
    return items[0] if items else None


async def location_based(lang: str, lat: float, lng: float, radius_m: int = 3000,
                         rows: int = 20, content_type_id: int | None = None) -> list[dict]:
    # ⚠️ TourAPI 파라미터: mapX=경도, mapY=위도
    return await _get(_service(lang), "locationBasedList2", {
        "mapX": lng, "mapY": lat, "radius": radius_m,
        "contentTypeId": content_type_id, "numOfRows": rows,
    })


# ---------- 빅데이터 계열 — ✅ 경로 확정, 응답 필드는 2차 실사로 최종 확인 ----------

async def related_tourism_list(sigungu_code: int, base_ym: str | None = None,
                               rows: int = 100) -> list[dict]:
    """관광지별 연관 관광지 (스케줄러, D5 [C]).

    입력은 TourAPI 시군구코드(1~16) — 내부에서 법정동 코드로 변환해 호출.
    (2차 실사: TourAPI 코드로는 0건 → 법정동 코드 체계 추정, 3차 실사로 확정)
    """
    ldong = SIGUNGU_TO_LDONG.get(sigungu_code)
    if ldong is None:
        return []
    return await _get(RELATED_SERVICE, "areaBasedList1", {
        "baseYm": base_ym or _prev_month(),
        "areaCd": BUSAN_LDONG,
        "signguCd": ldong,
        "numOfRows": rows,
    }, use_long_cache=True)


async def visitor_stats(area_code: int | None = None, sigungu_code: int | None = None,
                        start_ymd: str | None = None, end_ymd: str | None = None) -> list[dict]:
    """지역별 방문자수 (KT 내국인 / SKT 외국인) — 시군구 단위 (계획서 리스크 표).

    ✅ 4차 실사 확정 — 응답 필드: signguCode(법정동!), signguNm, daywkDivCd/Nm,
    touDivCd/Nm(1=현지인, 2=외지인, 3=외국인), touNum, baseYmd.
    지역 필터 파라미터 없음 → 전국 데이터를 받아 호출부에서 법정동 코드로 필터.
    데이터 지연 약 1개월 → 기본 30일 전 단일일 조회.
    """
    if start_ymd is None or end_ymd is None:
        start_ymd, end_ymd = _recent_window()
    return await _get(DATALAB_SERVICE, "locgoRegnVisitrDDList", {
        "startYmd": start_ymd, "endYmd": end_ymd,
        "numOfRows": 2000,
    }, use_long_cache=True)


async def concentration_forecast(sigungu_code: int, rows: int = 100) -> list[dict]:
    """관광지 집중률 예측 (P2, D8 [B]).

    ✅ 3차 실사 확정: areaCd + signguCd(법정동) 필수, 관광지 '이름' 단위 응답.
    응답 필드: baseYmd, areaNm, signguNm, tAtsNm, cnctrRate(%)
    """
    ldong_sgg = SIGUNGU_TO_LDONG.get(sigungu_code)
    if ldong_sgg is None:
        return []
    return await _get(CONCENTRATION_SERVICE, CONCENTRATION_OP, {
        "areaCd": BUSAN_LDONG,
        "signguCd": ldong_sgg,
        "numOfRows": rows,
    }, use_long_cache=True)
