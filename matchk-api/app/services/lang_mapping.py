"""언어 간 장소 크로스 매핑 (D6 [C] 선행 태스크).

국/영/일/중 관광정보 서비스는 같은 장소라도 contentid가 서로 다르다.
→ 좌표 근접(기본 50m) + 명칭 유사도로 국문 contentid 기준 매핑 테이블을 만든다.
결과는 24h 캐시 (일 트래픽 한도 보호). 매핑 실패 장소는 후보에서 제외.
"""
from difflib import SequenceMatcher

from app.core.cache import cache_get, cache_set, long_cache
from app.services import tourapi_client
from app.services.geo_utils import haversine_m

MATCH_RADIUS_M = 150.0  # 서비스 간 좌표 오차 감안 (진단 후 조정)
FOREIGN_LANGS = ("en", "ja", "zh")

# 관광지 contentTypeId — 국문과 외국어 서비스가 체계가 다르다 (2026-08-26 실측).
#   ko      : 12=관광지 (그 외 14 문화시설 · 15 축제 · 28 레포츠 · 32 숙박 · 38 쇼핑 · 39 음식점)
#   en/ja/zh: 76=관광지 (그 외 75 · 78 · 79 · 80 · 82 · 85)
#     └ EngService2에 76으로 조회하면 Haeundae Beach / Huinnyeoul Culture Village /
#       Haedong Yonggungsa Temple 등 관광지만 나오는 것을 확인함.
#   ⚠️ ko의 12를 외국어 서비스에 그대로 넘기면 응답이 0건이다. 실제로 그렇게 넣었다가
#      등록부가 en/ja/zh 전부 0건이 되어 커버리지가 전멸했다(비대칭 18건 → 0건).
#   ※ SURVEY_REPORT(7/13 실사)는 응답 필드명까지만 확정했고 이 타입 체계 차이는 기록이 없다.
ATTRACTION_TYPE_ID = {"ko": 12, "en": 76, "ja": 76, "zh": 76}
DEFAULT_ATTRACTION_TYPE_ID = 76

def _coords(item: dict) -> tuple[float, float] | None:
    try:
        return float(item["mapy"]), float(item["mapx"])  # (lat, lng)
    except (KeyError, TypeError, ValueError):
        return None


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()


async def build_lang_registry(lang: str, max_pages: int = 5) -> list[dict]:
    """특정 언어 서비스에 등록된 부산 **관광지(타입12)** 전체(상한 max_pages*100건).

    ▸ 2026-08-26: 관광지 타입 필터 추가. 국문 후보는 관광지만 뽑는데
      (collect_candidates·mark_hidden·hidden_sim 모두 content_type_id=12)
      외국어 등록부만 음식점·숙박까지 전부 받고 있었다. 매칭이 좌표 기반이라
      국문 관광지가 150m 안의 외국어 '음식점'과 매칭돼 "그 언어권에 등록됨"으로
      잘못 판정될 수 있었다.
    """
    key = f"lang_registry:{lang}"
    cached = cache_get(long_cache, key)
    if cached is not None:
        return cached
    ctype = ATTRACTION_TYPE_ID.get(tourapi_client.normalize_lang(lang),
                                   DEFAULT_ATTRACTION_TYPE_ID)
    items: list[dict] = []
    for page in range(1, max_pages + 1):
        batch = await tourapi_client.list_by_area(lang, page=page, content_type_id=ctype,
                                                  use_long_cache=True)
        items.extend(batch)
        if len(batch) < 100:
            break
    cache_set(long_cache, key, items)
    return items


def match_place(ko_item: dict, foreign_items: list[dict]) -> dict | None:
    """국문 장소 1건을 외국어 리스트에서 **좌표 거리 최소**로 매칭.

    ▸ 2026-08-26: 명칭 유사도 제거. 국문 제목과 외국어 제목은 표기 체계가 달라
      SequenceMatcher 유사도가 사실상 항상 0이다 (실측: '해운대해수욕장' vs
      'Haeundae Beach' = 0.000, vs '海雲台海水浴場' = 0.000).
      따라서 기존 score = 0.5 + 0.5*sim 는 언제나 0.5로 고정돼 아무 판별도 하지
      않았고, best_score 초기값 0.0 탓에 **반경 안 첫 번째 항목**이 채택되고 있었다.
      실제로 작동하는 신호는 좌표뿐이므로 가장 가까운 1건을 고른다(동점은 앞선 것).
      ※ 유사도 하한(8/19 §13 제안 ②)은 적용하지 않는다 — sim이 0이라 하한을 걸면
        모든 매칭이 사라져 커버리지가 전멸한다.
    """
    ko_pos = _coords(ko_item)
    if ko_pos is None:
        return None
    best, best_dist = None, float("inf")
    for f in foreign_items:
        f_pos = _coords(f)
        if f_pos is None:
            continue
        d = haversine_m(*ko_pos, *f_pos)
        if d > MATCH_RADIUS_M or d >= best_dist:
            continue
        best, best_dist = f, d
    return best


async def coverage_by_contentid(ko_items: list[dict]) -> dict[str, dict[str, bool]]:
    """국문 contentid → {en/ja/zh: 등록 여부}. 알고리즘 방향 2(등록 차이)의 원천 데이터."""
    registries = {}
    for lang in FOREIGN_LANGS:
        try:
            registries[lang] = await build_lang_registry(lang)
        except Exception:
            registries[lang] = []  # 미승인/장애 시 해당 언어는 비교 제외 (부록 D 폴백)
    result: dict[str, dict[str, bool]] = {}
    for ko in ko_items:
        cid = str(ko.get("contentid", ""))
        if not cid:
            continue
        result[cid] = {lang: match_place(ko, registries[lang]) is not None for lang in FOREIGN_LANGS}
    return result


def thinness_score(coverage: dict[str, bool], user_lang: str) -> float:
    """유저 언어권에 '얇게' 소개된 곳일수록 가산 (Step 3).

    ✅ 실데이터 스냅샷(2026-07-13) 반영 튜닝:
    - 진짜 타깃 = 타 언어권에 등록됐는데 내 언어권엔 없는 곳 → 큰 가산 (0.6~0.9)
    - 아무 외국어에도 없는 곳 = '서로의 역추천' 대상이 아님 → 소폭만 (0.15)
      (기존엔 이 그룹이 최고점 동점이라 세 언어권 결과가 동일해지는 문제)
    - 내 언어권에 이미 등록 → 감산
    """
    others = [l for l in FOREIGN_LANGS if l != user_lang]
    other_hits = sum(1 for l in others if coverage.get(l))
    if coverage.get(user_lang):
        return -0.5 + 0.1 * other_hits
    if other_hits >= 1:
        return 0.6 + 0.3 * (other_hits - 1)  # 1개 언어권=0.6, 2개=0.9
    return 0.15  # 미발견 그룹 — 낮은 우선순위
