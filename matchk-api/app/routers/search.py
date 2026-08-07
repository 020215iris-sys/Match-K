"""검색 API (D6 [B]) — 실시간 TourAPI 키워드 검색, 결과 없으면 근처 추천 병행."""
from fastapi import APIRouter

from app.services import search_suggest, tourapi_client

router = APIRouter(prefix="/api/search", tags=["search"])

BUSAN_CENTER = (35.1796, 129.0756)


@router.get("")
async def search(q: str, lang: str = "en", lat: float | None = None, lng: float | None = None):
    items = await tourapi_client.search_by_keyword(lang, q)
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
