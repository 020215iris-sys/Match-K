"""score_and_rank 계약 테스트 — 외부 호출은 전부 monkeypatch (네트워크·Papago 호출 없음).

이 함수는 홈 역추천(새봄)과 카테고리 검색(지현) 두 곳이 함께 쓰는 공용 함수다.
docstring에 적어둔 '조용히 하는 일' 중 실수로 깨지기 쉬운 2개를 여기서 고정한다.
  ① preview_foreign=False면 ko를 en으로 안 바꾼다 → Step 5(스왑·번역)가 아예 안 돈다
  ② 히든 제외는 국문 contentid 기준으로 동작한다
"""
import asyncio

from app.core.database import Base, SessionLocal, engine
from app.models import Country, District, Landmark, Region
from app.services import recommender

# 후보와 150m 넘게 떨어진 등록부 1건 — match_place가 반드시 실패하게 만들어
# "등록판 없음 → 번역 폴백" 경로를 확실히 태운다. (빈 등록부면 그 앞에서 continue 됨)
FAR_REGISTRY = [{"contentid": "e-1", "title": "Far Away Place",
                 "mapx": "129.90", "mapy": "35.90", "firstimage": ""}]


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # in-memory DB를 다른 테스트 모듈과 공유할 수 있어 get-or-create로 충돌 방지
    kr = db.query(Country).filter_by(code="KR").first() or Country(code="KR", name_ko="한국")
    db.add(kr); db.flush()
    busan = db.query(Region).filter_by(tour_area_code=6).first() \
        or Region(country_id=kr.id, tour_area_code=6, name_ko="부산광역시")
    db.add(busan); db.flush()
    yeongdo = db.query(District).filter_by(region_id=busan.id, sigungu_code=14).first() \
        or District(region_id=busan.id, sigungu_code=14, name_ko="영도구",
                    name_en="Yeongdo-gu", is_declining=True)
    db.add(yeongdo); db.flush()
    if not db.query(Landmark).filter_by(contentid="sr-hidden-1").first():
        db.add(Landmark(contentid="sr-hidden-1", district_id=yeongdo.id,
                        mapx=129.03, mapy=35.09, is_hidden=True))
    db.commit(); db.close()


def _raw(contentid: str, title: str) -> dict:
    return {"contentid": contentid, "title": title, "mapx": "129.03", "mapy": "35.09",
            "sigungucode": "14", "firstimage": ""}


def _patch_externals(monkeypatch, registry=None):
    """외부 호출을 전부 막고, translate 호출 인자를 모으는 리스트를 돌려준다."""
    calls: list[str] = []

    async def _visitor_stats(*args, **kwargs):
        return []                      # → 균등 폴백 (구 점수는 전 후보 동일)

    async def _coverage(raw):
        return {}                      # → thinness 가산 없음 (이 테스트의 관심사가 아님)

    async def _registry(lang, max_pages=5):
        return registry or []

    async def _translate(text, target_lang):
        calls.append(text)
        return f"TR:{text}"

    async def _concentration(sigungu_code, rows=100):
        return []

    monkeypatch.setattr(recommender.tourapi_client, "visitor_stats", _visitor_stats)
    monkeypatch.setattr(recommender.lang_mapping, "coverage_by_contentid", _coverage)
    monkeypatch.setattr(recommender.lang_mapping, "build_lang_registry", _registry)
    monkeypatch.setattr(recommender.translator, "translate", _translate)
    monkeypatch.setattr(recommender.tourapi_client, "concentration_forecast", _concentration)
    return calls


def _run(raw, **kwargs):
    db = SessionLocal()
    try:
        return asyncio.run(recommender.score_and_rank(
            db, raw, recommender.candidates_from_raw(raw), kwargs.pop("lang", "ko"),
            apply_quota=False, limit=5, **kwargs))
    finally:
        db.close()


def test_ko_stays_ko_when_preview_off(monkeypatch):
    """preview_foreign=False → Step 5 자체가 안 돈다. 제목 그대로 + Papago 0회."""
    calls = _patch_externals(monkeypatch, registry=FAR_REGISTRY)
    items = _run([_raw("sr-normal-1", "깡깡이예술마을")], preview_foreign=False)
    assert items[0]["title"] == "깡깡이예술마을"
    assert calls == []


def test_ko_previews_in_english_by_default(monkeypatch):
    """기본값은 기존 홈 역추천 동작 그대로 — ko→en 전환 + 등록판 없으면 번역 폴백."""
    calls = _patch_externals(monkeypatch, registry=FAR_REGISTRY)
    items = _run([_raw("sr-normal-1", "깡깡이예술마을")])
    assert items[0]["title"] == "TR:깡깡이예술마을"
    assert len(calls) == 1          # 후보 1건당 1회 — 20건이면 20회가 된다는 뜻


def test_hidden_excluded_by_korean_contentid(monkeypatch):
    """히든 제외는 DB의 국문 contentid와 후보 contentid가 같은 체계일 때만 작동한다."""
    _patch_externals(monkeypatch)
    items = _run([_raw("sr-hidden-1", "히든장소"), _raw("sr-normal-1", "일반장소")],
                 preview_foreign=False)
    ids = {i["contentid"] for i in items}
    assert "sr-hidden-1" not in ids
    assert "sr-normal-1" in ids