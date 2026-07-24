from fastapi import APIRouter

from app.core.cache import cache_stats

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    return {"status": "ok", "service": "matchk-api"}


@router.get("/health/cache")
def cache_health():
    """D8 [C] 캐시 히트율 확인용 (목표 70%+)."""
    return cache_stats()
