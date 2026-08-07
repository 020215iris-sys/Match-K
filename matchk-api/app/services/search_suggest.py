"""AI(LLM) 검색어 추천 (D6 [C] 후속, search.py TODO(지현)).

소멸위험 구(동구·서구·영도구)의 실제 국문 관광지 이름 몇 개를 TourAPI에서 뽑아
Claude에게 근거로 주고, 그걸 참고해 사용자 언어로 자연스러운 검색 문구 2~3개를 생성한다.
- 근거를 실제 데이터로 주는 이유: LLM이 자유생성하면 존재하지 않는 장소를 지어내서
  탭했을 때 검색 결과가 0건이 되는 문제를 막기 위함.
- 키 없거나(ANTHROPIC_API_KEY 미설정) 호출 실패 시 고정 샘플로 폴백
  (translator.py와 동일한 그레이스풀 디그레이드 패턴).
- 결과는 5분 캐시 (같은 언어권 반복 호출 절약).

⚠️ 열린 이슈 (2026-08-07, 팀 회의에서 방향 결정 예정):
지금은 "소멸위험 구 실데이터 근거 + Claude 생성" 버전으로, 언어권별 역추천 컨셉에
딱 붙어있는 형태. 그런데 "8월에 가기 좋은 부산 여행지"(날짜 기반), "국밥집 추천",
"대형카페 추천"(카테고리 기반) 같은 일반 여행 추천으로 하는건지.
바뀌면 근거 데이터도 달라져야 함 — 계절 추천은 현재 날짜를 프롬프트에 주입,
음식점/카페 추천은 TourAPI contentTypeId(39=음식점 등)로 카테고리 필터 추가 필요.
소멸위험 구 컨셉을 유지한 채 카테고리만 넓힐지, 완전히 일반 추천으로 갈지 미정.
"""
import asyncio
import json
import random

from app.core.cache import cache_get, cache_set, short_cache
from app.core.config import DECLINING_SIGUNGU_CODES, get_settings
from app.services import tourapi_client

settings = get_settings()

FALLBACK_SAMPLES = {
    "ko": ["영도 흰여울문화마을", "가족 여행 좋은 곳", "부산 로컬 카페"],
    "en": ["Yeongdo seaside village", "Family-friendly Busan", "Local sunset spot"],
    "ja": ["影島の海辺の村", "家族向け釜山", "地元の夕日スポット"],
    "zh": ["影岛海边村落", "适合家庭的釜山", "当地日落景点"],
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


async def _declining_district_samples(limit: int = 6) -> list[str]:
    """소멸위험 구 관광지 이름 몇 개 — LLM 프롬프트의 실데이터 근거."""
    titles: list[str] = []
    for code in DECLINING_SIGUNGU_CODES:
        try:
            items = await tourapi_client.list_by_area(
                "ko", sigungu_code=code, content_type_id=12, rows=5)
        except tourapi_client.TourApiError:
            continue
        titles.extend(i["title"] for i in items if i.get("title"))
    random.shuffle(titles)
    return titles[:limit]


def _call_claude_sync(lang: str, samples: list[str]) -> list[str] | None:
    """동기 SDK 호출 — asyncio.to_thread로 감싸서 이벤트루프 안 막음."""
    try:
        import anthropic
    except ImportError:
        return None  # requirements.txt에 anthropic 미설치 환경 대비
    if not settings.ANTHROPIC_API_KEY:
        return None

    lang_name = _LANG_NAME.get(lang, "English")
    sample_text = ", ".join(samples) if samples else "(no sample data available)"
    prompt = (
        "You write search-box suggestions for a Busan (South Korea) tourism app. "
        "The app's concept is nudging foreign visitors toward under-documented local "
        "spots in Busan's officially designated population-decline districts "
        "(Dong-gu, Seo-gu, Yeongdo-gu). Here are a few real spot names from those "
        f"districts, from live tourism data: {sample_text}. "
        f"Write 2 to 3 short, natural search suggestions in {lang_name} "
        "that would make a tourist curious to explore this kind of lesser-known "
        "local spot. Under 8 words each. No numbering, no quotes."
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

    samples = await _declining_district_samples()
    items = await asyncio.to_thread(_call_claude_sync, lang, samples)
    result = items if items else FALLBACK_SAMPLES.get(lang, FALLBACK_SAMPLES["en"])

    cache_set(short_cache, key, result)
    return result
