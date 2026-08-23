"""AI(LLM) 검색어 추천 (D6 [C] 후속, search.py TODO(지현)).

일반 여행 추천 버전 (2026-08-07 팀 결정): 소멸위험 구 컨셉 전용이 아니라,
"OO월에 가기 좋은 부산 여행지"(날짜 기반) / "국밥집 추천"(음식점) /
"대형카페 추천"(카페) 같은 카테고리별 검색 문구를 Claude가 생성한다.
- 근거를 실제 데이터로 주는 이유: LLM이 완전 자유생성하면 존재하지 않는 가게 이름을
  지어낼 수 있어서, 관광지·음식점·카페 각각 실제 TourAPI 데이터 몇 개를 참고자료로 줌.
- 키 없거나(ANTHROPIC_API_KEY 미설정) 호출 실패 시 고정 샘플로 폴백
  (translator.py와 동일한 그레이스풀 디그레이드 패턴).
- 결과는 5분 캐시 (같은 언어권 반복 호출 절약).

⚠️ 웹 검색 도구 사용 (2026-08-11, 팀 논의 후 결정): 계절 추천(1번 카테고리)은 TourAPI에
"이번 달 인기" 같은 데이터가 없어서, Claude의 web_search 도구를 켜서 실제 최신 정보
(부산 현재 날씨·계절 트렌드 등)를 검색해 반영하게 함. 호출당 max_uses=3으로 검색 횟수
상한을 걸어 비용 통제. 검색 실패해도 기존처럼 고정 샘플로 폴백되니 앱은 안 죽음.

⚠️ display/keyword 분리 (2026-08-12, 재적용): "부산 국밥 추천" 같은 자연스러운 문장을
그대로 검색어로 쓰면 TourAPI 키워드 검색(제목 그대로 매칭)에서 0건이 나옴 — 실기기
테스트로 두 번째 확인. 각 추천은 화면에 "보여줄 문장"(display)과 "실제로 검색에 쓸
짧은 핵심단어"(keyword)를 분리해서 함께 생성한다. 프론트는 display를 보여주고,
탭하면 keyword로 검색한다 (SearchScreen.tsx, endpoints.ts도 같이 수정 필요).

카테고리 3개는 예시일 뿐, 나중에 바뀔 수 있음 — _CATEGORY_HINT만 고치면 됨.
"""
import json
import random

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import SearchSuggestionCache
from app.services import tourapi_client

settings = get_settings()

# TourAPI contentTypeId: 12=관광지, 39=음식점 (카페는 별도 타입 없이 39 안에 섞여있어서 키워드로 따로 뽑음)
_ATTRACTION_TYPE = 12
_RESTAURANT_TYPE = 39

FALLBACK_SAMPLES = {
    "ko": [
        {"display": "8월에 가기 좋은 부산 여행지", "keyword": "해운대"},
        {"display": "부산 국밥집 추천", "keyword": "국밥"},
        {"display": "부산 시원한 대형카페", "keyword": "카페"},
    ],
    "en": [
        {"display": "Great Busan trips for August", "keyword": "Haeundae"},
        {"display": "Best gukbap spots in Busan", "keyword": "gukbap"},
        {"display": "Big cool cafes in Busan", "keyword": "cafe"},
    ],
    "ja": [
        {"display": "8月におすすめの釜山旅行地", "keyword": "海雲台"},
        {"display": "釜山のグクパブおすすめ店", "keyword": "グクパブ"},
        {"display": "釜山の涼しい大型カフェ", "keyword": "カフェ"},
    ],
    "zh": [
        {"display": "8月适合去的釜山旅行地", "keyword": "海云台"},
        {"display": "釜山推荐猪肉汤饭店", "keyword": "猪肉汤饭"},
        {"display": "釜山凉爽大型咖啡厅", "keyword": "咖啡厅"},
    ],
}

_LANG_NAME = {"ko": "Korean", "en": "English", "ja": "Japanese", "zh": "Simplified Chinese"}

_SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "display": {"type": "string"},
                    "keyword": {"type": "string"},
                },
                "required": ["display", "keyword"],
                "additionalProperties": False,
            },
        },
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


def _call_claude_sync(lang: str, month: int, samples: dict[str, list[str]]) -> list[dict[str, str]] | None:
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
        "search screen (shown before the user types anything). Write exactly 3 suggestions "
        f"in {lang_name}, one per category below. Each suggestion needs TWO fields:\n"
        "- \"display\": a short natural search-query phrase a tourist would type "
        "(style like 'Great Busan trips for August', 'Best gukbap spots in Busan'), under 8 words, "
        "no numbering, no quotes.\n"
        "- \"keyword\": a SHORT literal word or two (1-3 words) that this app's search will use "
        "AS-IS against place-title text — it must be a term likely to appear literally inside a "
        "real place name/title (e.g. a place name, a food/venue type like '국밥' or '카페'), "
        "NOT a sentence, NOT a description, NOT the same text as display.\n"
        f"1. A seasonal travel-spot suggestion for the current month (month {month} of the year) "
        f"in Busan. You have a web_search tool — use it (a couple of searches at most) to check "
        f"the current/typical weather and what's seasonally trending in Busan right now, so the "
        f"display text is genuinely timely, not just generic. For keyword, still pick a short "
        f"literal place-name term (not a weather description). Real attraction names for reference: "
        f"{_fmt('attraction')}.\n"
        f"2. A restaurant-category suggestion (e.g. a popular local food style). "
        f"Real restaurant names in Busan for reference: {_fmt('restaurant')}.\n"
        f"3. A cafe-category suggestion (e.g. a large/scenic cafe). "
        f"Real cafe names in Busan for reference: {_fmt('cafe')}.\n"
        "After any searching, your FINAL message must be ONLY the JSON matching the schema "
        "— no commentary about what you searched."
    )

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=1024,
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": 3}],
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": _SUGGEST_SCHEMA},
            },
            messages=[{"role": "user", "content": prompt}],
        )
        # 검색 도구를 쓰면 "검색해볼게요" 같은 다른 텍스트 블록이 섞여 나올 수 있어서,
        # 텍스트 블록들을 순서대로 시도해 JSON으로 읽히는 걸 찾는다 (첫 블록만 믿지 않음).
        data = None
        for block in response.content:
            if block.type != "text" or not block.text.strip():
                continue
            try:
                data = json.loads(block.text)
                break
            except (json.JSONDecodeError, ValueError):
                continue
        if data is None:
            return None
        items = []
        for s in data.get("suggestions", []):
            display = (s.get("display") or "").strip()
            keyword = (s.get("keyword") or "").strip()
            if display and keyword:
                items.append({"display": display, "keyword": keyword})
        return items[:3] or None
    except Exception:
        return None  # API 장애/refusal/파싱 실패 등 — 호출부가 폴백


def get_suggestions(lang: str, db: Session) -> list[dict[str, str]]:
    """DB 캐시(search_suggestion_cache)에서 읽기만 함 — Claude 호출 없음 (2026-08-23 개편).

    실제 생성은 배치 스크립트(scripts/generate_search_suggestions.py)가 한 달에 한 번
    정도 미리 해두고, 여기는 그 결과를 조회만 한다. 아직 한 번도 안 돌렸거나 그 언어가
    없으면 FALLBACK_SAMPLES로 대체."""
    row = db.query(SearchSuggestionCache).filter_by(lang=lang).first()
    if row is not None:
        return row.items
    return FALLBACK_SAMPLES.get(lang, FALLBACK_SAMPLES["en"])
