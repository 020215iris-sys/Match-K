"""역추천 API (D5 [B]).

- lang은 쿼리 파라미터 우선 (JWT에 박지 않음 — 게스트/언어변경 대응)
- type=auto: 인트로 팝업용, 소멸위험 구 강필터
- type=nearby: 홈 카드용, GPS 기반 (없으면 부산 중심 폴백)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models.user import User
from app.services import recommender
from app.services.tourapi_client import TourApiError

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])

BUSAN_CENTER = (35.1796, 129.0756)


@router.get("")
async def recommendations(
    type: str = Query("auto", pattern="^(auto|nearby)$"),
    lang: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    limit: int = Query(10, le=20),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    effective_lang = lang or (user.lang if user else "en")
    if type == "nearby" and (lat is None or lng is None):
        lat, lng = BUSAN_CENTER  # GPS 없으면 부산 중심 폴백 (D6 [A])
    try:
        items = await recommender.recommend(
            db, effective_lang, rec_type=type, lat=lat, lng=lng,
            user_id=user.id if user else None, limit=limit,
        )
    except TourApiError:
        # TourAPI 장애 + 폴백 소진 → 500 대신 명시적 503 (프론트 ErrorNotice가 표시)
        raise HTTPException(503, "tourapi_unavailable")
    return {"items": items, "lang": effective_lang, "type": type}
