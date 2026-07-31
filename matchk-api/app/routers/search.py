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


@router.get("/suggest")
async def suggest(lang: str = "en"):
    """AI(LLM) 추천 검색어/키워드 (스텁 — 2026-07-31 개편).

    TODO(지현): LLM으로 언어권·소멸위험 구 맥락 기반 추천어 2~3개 생성.
    지금은 고정 예시를 반환해 프론트 검색 화면이 동작하도록만 함.
    """
    samples = {
        "ko": ["영도 흰여울문화마을", "가족 여행 좋은 곳", "부산 로컬 카페"],
        "en": ["Yeongdo seaside village", "Family-friendly Busan", "Local sunset spot"],
        "ja": ["影島の海辺の村", "家族向け釜山", "地元の夕日スポット"],
        "zh": ["影岛海边村落", "适合家庭的釜山", "当地日落景点"],
    }
    return {"items": samples.get(lang, samples["en"])}
