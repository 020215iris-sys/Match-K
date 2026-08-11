"""AI(LLM) 검색어 추천 (D6 [C] 후속, search.py TODO(지현)).

일반 여행 추천 버전 (2026-08-07 팀 결정): 소멸위험 구 컨셉 전용이 아니라,
"OO월에 가기 좋은 부산 여행지"(날짜 기반) / "국밥집 추천"(음식점) /
"대형카페 추천"(카페) 같은 카테고리별 검색 문구를 Claude가 생성한다.
- 근거를 실제 데이터로 주는 이유: LLM이 완전 자유생성하면 존재하지 않는 가게 이름을
  지어낼 수 있어서, 관광지·음식점·카페 각각 실제 TourAPI 데이터 몇 개를 참고자료로 줌.
- 키 없거나(ANTHROPIC_API_KEY 미설정) 호출 실패 시 고정 샘플로 폴백
  (translator.py와 동일한 그레이스풀 디그레이드 패턴).
- 결과는 5분 캐시 (같은 언어권 반복 호출 절약).

카테고리 3개는 예시일 뿐, 나중에 바뀔 수 있음 — _CATEGORY_HINT만 고치면 됨.
"""
import asyncio
import json
import random
from datetime import date

from app.core.cache import cache_get, cache_set, short_cache
from app.core.config import get_settings
from app.services import tourapi_client

settings = get_settings()

# TourAPI contentTypeId: 12=관광지, 39=음식점 (카페는 별도 타입 없이 39 안에 섞여있어서 키워드로 따로 뽑음)
_ATTRACTION_TYPE = 12
_RESTAURANT_TYPE = 39

FALLBACK_SAMPLES = {
    "ko": ["8월에 가기 좋은 부산 여행지", "부산 국밥집 추천", "부산 시원한 대형카페"],
    "en": ["Great Busan trips for August", "Best gukbap spots in Busan", "Big cool cafes in Busan"],
    "ja": ["8月におすすめの釜山旅行地", "釜山のグクパブおすすめ店", "釜山の涼しい大型カフェ"],
    "zh": ["8月适合去的釜山旅行地", "釜山推荐猪肉汤饭店", "釜山凉爽大型咖啡厅"],
}

_LANG_NAME = {"ko": "Korean", "en": "English", "ja": "Japanese", "zh": "Simplified Chinese"}

_SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["suggestions"],
    "additionalProperties": False,
}


async def _category_samples() -> dict[str, list[str]]:
    """카테고리별 실제 장소 이름 몇 개 — LLM 프롬프트의 실데이터 근거.
    관광지/음식점은 지역 목록 조회, 카페는 타입 구분이 없어 키워드 검색으로 대체."""
    samples: dict[str, list[str]] = {"attraction": [], "restaurant": [], "cafe": []}
    try:
        items = await tourapi_client.list_by_area("ko", content_type_id=_ATTRACTION_TYPE, rows=10)
        samples["attraction"] = [i["title"] for i in items if i.get("title")]
    except tourapi_client.TourApiError:
        pass
    try:
        items = await tourapi_client.list_by_area("ko", content_type_id=_RESTAURANT_TYPE, rows=10)
        samples["restaurant"] = [i["title"] for i in items if i.get("title")]
    except tourapi_client.TourApiError:
        pass
    try:
        items = await tourapi_client.search_by_keyword("ko", "카페")
        samples["cafe"] = [i["title"] for i in items if i.get("title")]
    except tourapi_client.TourApiError:
        pass
    for key in samples:
        random.shuffle(samples[key])
        samples[key] = samples[key][:5]
    return samples


def _call_claude_sync(lang: str, month: int, samples: dict[str, list[str]]) -> list[str] | None:
    """동기 SDK 호출 — asyncio.to_thread로 감싸서 이벤트루프 안 막음."""
    try:
        import anthropic
    except ImportError:
        return None  # requirements.txt에 anthropic 미설치 환경 대비
    if not settings.ANTHROPIC_API_KEY:
        return None

    lang_name = _LANG_NAME.get(lang, "English")

    def _fmt(key: str) -> str:
        return ", ".join(samples.get(key) or []) or "(no sample data)"

    prompt = (
        "You write search-suggestion chips for a Busan (South Korea) tourism app's "
        "search screen (shown before the user types anything). Write exactly 3 short "
        f"suggestions in {lang_name}, one per category below, each under 8 words, "
        "no numbering, no quotes:\n"
        f"1. A seasonal travel-spot suggestion for the current month (month {month} of the year) "
        f"in Busan. Real attraction names in Busan for reference: {_fmt('attraction')}.\n"
        f"2. A restaurant-category suggestion (e.g. a popular local food style). "
        f"Real restaurant names in Busan for reference: {_fmt('restaurant')}.\n"
        f"3. A cafe-category suggestion (e.g. a large/scenic cafe). "
        f"Real cafe names in Busan for reference: {_fmt('cafe')}.\n"
        "Suggestions should read like natural search queries a tourist would type "
        "(style like 'Great Busan trips for August', 'Best gukbap spots in Busan'), "
        "not full sentences, and not necessarily the literal reference names."
    )

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=300,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": _SUGGEST_SCHEMA},
            },
            messages=[{"role": "user", "content": prompt}],
        )
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        items = [s.strip() for s in data.get("suggestions", []) if s and s.strip()]
        return items[:3] or None
    except Exception:
        return None  # API 장애/refusal/파싱 실패 등 — 호출부가 폴백


async def get_suggestions(lang: str) -> list[str]:
    key = f"suggest:{lang}"
    cached = cache_get(short_cache, key)
    if cached is not None:
        return cached

    samples = await _category_samples()
    month = date.today().month
    items = await asyncio.to_thread(_call_claude_sync, lang, month, samples)
    result = items if items else FALLBACK_SAMPLES.get(lang, FALLBACK_SAMPLES["en"])

    cache_set(short_cache, key, result)
    return result
