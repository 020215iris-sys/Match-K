"""검색 카테고리 사전 (D6 [C] 후속, "카테고리 칩 + 역추천" 제안 반영 — 2026-08-23).

문장 검색이 0건일 때(TourAPI는 제목 글자만 대조하니까), 죽은 화면 대신 카테고리
버튼을 보여주고 역추천 엔진(recommender.score_and_rank)으로 연결하기 위한 사전.

- keyword: 이 카테고리로 TourAPI를 실제로 검색할 때 쓸 짧은 literal 키워드 (언어별)
- triggers: 사용자 문장 안에 이 단어가 있으면 그 카테고리로 판단 (규칙기반, 무료)
- 규칙에 하나도 안 걸리면(애매한 문장/다른 언어 표현) extract_categories()가 Claude로 분류
  (web_search는 켜지 않음 — 6개 중 고르는 분류 작업이라 실시간 검색이 필요 없어서 빠르고 쌈)

카테고리 목록·트리거 단어는 예시로 시작한 것 — 팀 논의로 언제든 추가/수정 가능.
"""
import json

from app.core.config import get_settings

settings = get_settings()

CATEGORIES: dict[str, dict] = {
    "beach": {
        "emoji": "🏖",
        "keyword": {"ko": "해수욕장", "en": "beach", "ja": "海水浴場", "zh": "海水浴场"},
        "triggers": {
            "ko": ["바다", "해변", "해수욕장", "바닷가", "모래사장", "백사장", "파도", "물놀이"],
            "en": ["beach", "sea", "coast", "shore", "seaside", "sand", "ocean", "swimming", "waves"],
            "ja": ["海", "ビーチ", "海水浴場", "海辺", "砂浜", "波", "海岸"],
            "zh": ["海边", "海滩", "海水浴场", "大海", "沙滩", "海岸", "游泳"],
        },
    },
    "park": {
        "emoji": "🌳",
        "keyword": {"ko": "공원", "en": "park", "ja": "公園", "zh": "公园"},
        "triggers": {
            "ko": ["공원", "산책", "숲", "둘레길", "잔디밭", "나무", "피크닉"],
            "en": ["park", "walk", "forest", "trail", "picnic", "garden"],
            "ja": ["公園", "散歩", "森", "遊歩道", "ピクニック", "芝生"],
            "zh": ["公园", "散步", "森林", "步道", "野餐", "草坪"],
        },
    },
    "market": {
        "emoji": "🛒",
        "keyword": {"ko": "시장", "en": "market", "ja": "市場", "zh": "市场"},
        "triggers": {
            "ko": ["시장", "전통시장", "재래시장", "노점", "먹거리", "길거리음식"],
            "en": ["market", "traditional market", "street food", "vendor", "stalls"],
            "ja": ["市場", "伝統市場", "屋台", "露店", "食べ歩き"],
            "zh": ["市场", "传统市场", "小吃", "摊位", "夜市"],
        },
    },
    "cafe": {
        "emoji": "☕",
        "keyword": {"ko": "카페", "en": "cafe", "ja": "カフェ", "zh": "咖啡"},
        "triggers": {
            "ko": ["카페", "커피", "디저트", "빵집", "베이커리", "케이크", "브런치"],
            "en": ["cafe", "coffee", "dessert", "bakery", "brunch", "pastry"],
            "ja": ["カフェ", "コーヒー", "デザート", "パン屋", "ベーカリー", "ブランチ"],
            "zh": ["咖啡", "咖啡厅", "甜点", "面包店", "烘焙", "早午餐"],
        },
    },
    "viewpoint": {
        "emoji": "🌇",
        "keyword": {"ko": "전망대", "en": "observatory", "ja": "展望台", "zh": "观景台"},
        "triggers": {
            "ko": ["전망대", "야경", "전망", "뷰", "일몰", "노을", "파노라마"],
            "en": ["view", "viewpoint", "observatory", "night view", "sunset", "panorama"],
            "ja": ["展望台", "夜景", "眺め", "夕日", "パノラマ"],
            "zh": ["观景台", "夜景", "景观", "日落", "全景"],
        },
    },
    "temple": {
        "emoji": "⛩",
        "keyword": {"ko": "사찰", "en": "temple", "ja": "寺", "zh": "寺庙"},
        "triggers": {
            "ko": ["절", "사찰", "불교", "산사", "스님", "템플스테이", "명상", "신사"],
            "en": ["temple", "buddhist", "shrine", "monk", "meditation"],
            "ja": ["寺", "お寺", "仏教", "僧侶", "瞑想"],
            "zh": ["寺庙", "佛教", "寺院", "僧人", "冥想"],
        },
    },
}

_LANG_NAME = {"ko": "Korean", "en": "English", "ja": "Japanese", "zh": "Simplified Chinese"}

_CLASSIFY_SCHEMA = {
    "type": "object",
    "properties": {
        "categories": {
            "type": "array",
            "items": {"type": "string", "enum": list(CATEGORIES.keys())},
        },
    },
    "required": ["categories"],
    "additionalProperties": False,
}


def _extract_by_rules(query: str, lang: str) -> list[str]:
    """트리거 단어 매칭 — 무료, 즉시. 규칙에 걸리는 카테고리를 순서대로 최대 3개."""
    q = query.lower()
    hits = []
    for key, cat in CATEGORIES.items():
        triggers = cat["triggers"].get(lang, [])
        if any(t.lower() in q for t in triggers):
            hits.append(key)
    return hits[:3]


def _classify_with_claude(query: str, lang: str) -> list[str] | None:
    """규칙에 하나도 안 걸렸을 때만 호출되는 폴백. 분류만 하는 작업이라 web_search 없음
    (실시간 검색 불필요 → 빠르고 저렴)."""
    try:
        import anthropic
    except ImportError:
        return None
    if not settings.ANTHROPIC_API_KEY:
        return None

    lang_name = _LANG_NAME.get(lang, "English")
    category_list = ", ".join(CATEGORIES.keys())
    prompt = (
        f"A tourist searched for \"{query}\" ({lang_name}) in a Busan (South Korea) "
        f"tourism app and got zero results (it's a free-text sentence, not a place name). "
        f"Pick 1-3 categories from this fixed list that best match their intent: "
        f"{category_list}. Respond with ONLY the JSON matching the schema — no commentary."
    )
    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-opus-5",
            max_tokens=256,
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": _CLASSIFY_SCHEMA},
            },
            messages=[{"role": "user", "content": prompt}],
        )
        for block in response.content:
            if block.type != "text" or not block.text.strip():
                continue
            try:
                data = json.loads(block.text)
                cats = [c for c in data.get("categories", []) if c in CATEGORIES]
                return cats[:3] or None
            except (json.JSONDecodeError, ValueError):
                continue
        return None
    except Exception:
        return None  # API 장애/파싱 실패 등 — 호출부가 "카테고리 힌트 없음"으로 처리


def extract_categories(query: str, lang: str) -> list[str]:
    """문장 → 카테고리 키 리스트. 규칙 우선, 안 걸리면 Claude, 그마저 실패하면 빈 리스트."""
    hits = _extract_by_rules(query, lang)
    if hits:
        return hits
    ai_hits = _classify_with_claude(query, lang)
    return ai_hits or []
