"""검색 API (D6 [B]) — 실시간 TourAPI 키워드 검색, 결과 없으면 근처 추천 병행."""
from fastapi import APIRouter

from app.services import tourapi_client

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
