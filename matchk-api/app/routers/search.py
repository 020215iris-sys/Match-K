"""검색 API (D6 [B]) — 실시간 TourAPI 키워드 검색, 결과 없으면 근처 추천 병행."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services import category_dictionary, recommender, search_suggest, tourapi_client

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
    category_hints: list[str] = []
    if not items:
        flat, flng = (lat, lng) if lat is not None and lng is not None else BUSAN_CENTER
        fallback = await tourapi_client.location_based(lang, flat, flng)
        # 문장 검색 0건 → 카테고리 칩 제안 (2026-08-23, "카테고리 칩 + 역추천" 제안).
        # 0건일 때만 계산 — 이름 검색이 성공하는 대부분의 요청은 이 비용이 아예 안 듦.
        category_hints = category_dictionary.extract_categories(q, lang)
    return {"items": items, "count": len(items), "fallbackNearby": fallback,
            "categoryHints": category_hints}


@router.get("/category")
async def search_by_category(category: str, lang: str = "en", db: Session = Depends(get_db)):
    """카테고리 칩 탭 시 결과 — TourAPI 실시간 검색 + 역추천 점수 재사용 (새봄의
    recommender.score_and_rank, 2026-08-19 분리) 그대로 씀. apply_quota=True로
    소멸위험 구를 항상 우선 노출 (공모전 취지 반영 — 검색에도 컨셉이 묻어나게)."""
    cat = category_dictionary.CATEGORIES.get(category)
    if cat is None:
        raise HTTPException(404, "unknown_category")
    keyword = cat["keyword"].get(lang, cat["keyword"]["en"])
    # 카테고리에 따라 키워드가 문자열 하나(기존)이거나 리스트(여러 개 합치기, 신규)일 수 있음 —
    # 리스트면 각각 검색해서 결과를 contentid 기준으로 중복 없이 합침 (2026-08-25, 사찰부터 적용).
    keywords = keyword if isinstance(keyword, list) else [keyword]
    raw: list[dict] = []
    seen_ids: set[str] = set()
    for kw in keywords:
        items = await tourapi_client.search_by_keyword(lang, kw, rows=30)
        for item in items:
            cid = item.get("contentid")
            if cid and cid not in seen_ids:
                seen_ids.add(cid)
                raw.append(item)
    candidates = recommender.candidates_from_raw(raw)
    items = await recommender.score_and_rank(
        db, raw, candidates, user_lang=lang, rec_type="search",
        apply_quota=True, limit=20,
        preview_foreign=False,   # 검색은 유저가 고른 언어 그대로 (ko면 스왑·번역 안 돌게)
    )
    return {"items": items, "count": len(items), "category": category}


@router.get("/suggest")
def suggest(lang: str = "en", db: Session = Depends(get_db)):
    """AI(LLM) 추천 검색어/키워드 (D6 [C] 후속, 2026-08-23 DB 캐싱 개편).

    Claude 호출은 배치 스크립트가 미리 해두고, 여기선 DB에서 읽기만 함
    (요청 경로에 Claude 호출 없음 — search_suggest.py 참고).
    """
    items = search_suggest.get_suggestions(lang, db)
    return {"items": items}
