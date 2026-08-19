"""검색 API (D6 [B]) — 실시간 TourAPI 키워드 검색, 결과 없으면 근처 추천 병행."""
from fastapi import APIRouter

from app.services import search_suggest, tourapi_client

router = APIRouter(prefix="/api/search", tags=["search"])

BUSAN_CENTER = (35.1796, 129.0756)

# 상세검색 순위 (지현): 1=관광명소·문화, 2=음식점(상호명 매칭), 3=그 외(주소 매칭 등)
_ATTRACTION_TYPES = {"12", "14"}  # 관광지, 문화시설
_RESTAURANT_TYPE = "39"          # 음식점


def _rank_tier(item: dict, keyword: str) -> int:
    """순위표 1~3을 매김 — 숫자가 작을수록 먼저 나옴."""
    type_id = str(item.get("contenttypeid") or "")
    title = item.get("title") or ""
    if type_id in _ATTRACTION_TYPES:
        return 1
    if type_id == _RESTAURANT_TYPE and keyword in title:
        return 2
    return 3


def _rank_results(items: list[dict], keyword: str) -> list[dict]:
    """관광명소·문화 → 음식점(상호명 매칭) → 그 외(주소 매칭 등) 순으로 재정렬.
    sorted()는 안정 정렬이라, 같은 순위표 안에서는 TourAPI가 준 원래 순서(관련도) 유지됨."""
    return sorted(items, key=lambda i: _rank_tier(i, keyword))


@router.get("")
async def search(q: str, lang: str = "en", lat: float | None = None, lng: float | None = None):
    items = await tourapi_client.search_by_keyword(lang, q)
    items = _rank_results(items, q)
    fallback = []
    if not items:
        flat, flng = (lat, lng) if lat is not None and lng is not None else BUSAN_CENTER
        fallback = await tourapi_client.location_based(lang, flat, flng)
    return {"items": items, "count": len(items), "fallbackNearby": fallback}


@router.get("/suggest")
async def suggest(lang: str = "en"):
    """AI(LLM) 추천 검색어/키워드 (D6 [C] 후속, 2026-07-31 개편).

    소멸위험 구(동/서/영도) 실제 관광지를 근거로 Claude가 언어권별 추천 검색어 2~3개 생성.
    키 없거나 호출 실패 시 고정 샘플로 폴백 (search_suggest.py 참고).
    """
    items = await search_suggest.get_suggestions(lang)
    return {"items": items}
