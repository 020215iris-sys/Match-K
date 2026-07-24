"""in-memory 차등 TTL 캐시 (계획서 §4).

- short: 일반 조회 5분 (목록/상세/검색)
- long: 고비용 연산 24시간 (언어별 등록 리스트 비교, 방문자수 집계) — 일 트래픽 한도 보호
세션 메모리만 사용, 파일 저장 없음 (심사 조건). 단일 인스턴스 기준이며 필요 시 Redis로 교체.
"""
from cachetools import TTLCache

from app.core.config import get_settings

settings = get_settings()

short_cache: TTLCache = TTLCache(maxsize=4096, ttl=settings.CACHE_TTL_SHORT)
long_cache: TTLCache = TTLCache(maxsize=1024, ttl=settings.CACHE_TTL_LONG)

_hits = 0
_misses = 0


def cache_get(cache: TTLCache, key: str):
    global _hits, _misses
    val = cache.get(key)
    if val is not None:
        _hits += 1
    else:
        _misses += 1
    return val


def cache_set(cache: TTLCache, key: str, value) -> None:
    cache[key] = value


def cache_stats() -> dict:
    """D8 [C] 캐시 히트율 측정용."""
    total = _hits + _misses
    return {"hits": _hits, "misses": _misses, "hit_rate": round(_hits / total, 3) if total else 0.0}
