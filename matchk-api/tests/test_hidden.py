"""히든 미션 테스트 — 구별 도장 비율 트리거 + 발견 현황 (2026-08 개편)."""
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.main import app
from app.models import Country, District, Landmark, Region

client = TestClient(app)

# 다른 테스트 모듈과 in-memory DB를 공유하므로 sigungu_code는 여기서만 쓰는 값(99)으로 격리
HIDDEN_TEST_SIGUNGU = 99


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    kr = db.query(Country).filter_by(code="KR").first() or Country(code="KR", name_ko="한국")
    db.add(kr); db.flush()
    busan = db.query(Region).filter_by(tour_area_code=6).first() \
        or Region(country_id=kr.id, tour_area_code=6, name_ko="부산광역시")
    db.add(busan); db.flush()
    gu = db.query(District).filter_by(sigungu_code=HIDDEN_TEST_SIGUNGU).first() \
        or District(region_id=busan.id, sigungu_code=HIDDEN_TEST_SIGUNGU,
                    name_ko="히든테스트구", name_en="Hidden-gu",
                    name_ja="Hidden-gu", name_zh="Hidden-gu", is_declining=True)
    db.add(gu); db.flush()
    if not db.query(Landmark).filter_by(contentid="h-normal-0").first():
        # 일반 도장판 4개 + 히든 2개 (구 하나에 몰아넣고 비율로 트리거 확인)
        for i in range(4):
            db.add(Landmark(contentid=f"h-normal-{i}", district_id=gu.id,
                             mapx=129.04, mapy=35.13, is_hidden=False))
        db.add(Landmark(contentid="h-hidden-0", district_id=gu.id, mapx=129.04, mapy=35.13, is_hidden=True))
        db.add(Landmark(contentid="h-hidden-1", district_id=gu.id, mapx=129.05, mapy=35.12, is_hidden=True))
    db.commit(); db.close()


def _token() -> str:
    return client.post("/auth/guest?lang=en").json()["token"]


def _headers(tok=None):
    return {"Authorization": f"Bearer {tok or _token()}"}


def test_hidden_not_ready_before_threshold():
    h = _headers()
    status = client.get(f"/api/stamps/district/{HIDDEN_TEST_SIGUNGU}", headers=h).json()
    assert status["hiddenReady"] is False
    assert status["hiddenTargetContentId"] is None


def test_hidden_ready_and_target_after_threshold():
    h = _headers()
    # HIDDEN_STAMP_THRESHOLD 기본값 0.30 → 일반 4개 중 2개(50%)면 충족
    client.post("/api/stamps", headers=h, json={"contentid": "h-normal-0"})
    client.post("/api/stamps", headers=h, json={"contentid": "h-normal-1"})
    status = client.get(f"/api/stamps/district/{HIDDEN_TEST_SIGUNGU}", headers=h).json()
    assert status["hiddenReady"] is True
    assert status["hiddenTargetContentId"] == "h-hidden-0"  # id 순 첫 후보 — 결정적


def test_hidden_collect_via_target_then_moves_to_next():
    h = _headers()
    client.post("/api/stamps", headers=h, json={"contentid": "h-normal-0"})
    client.post("/api/stamps", headers=h, json={"contentid": "h-normal-1"})
    status = client.get(f"/api/stamps/district/{HIDDEN_TEST_SIGUNGU}", headers=h).json()
    target = status["hiddenTargetContentId"]

    # 팝업 "수집" = 대상 contentid로 그냥 도장 API 호출 (GPS 재검증 없음 — 화면 내 팝업 자체가 트리거)
    r = client.post("/api/stamps", headers=h, json={"contentid": target})
    assert r.status_code == 201 and r.json()["isHidden"] is True

    status2 = client.get(f"/api/stamps/district/{HIDDEN_TEST_SIGUNGU}", headers=h).json()
    assert status2["hiddenTargetContentId"] not in (None, target)  # 남은 히든으로 자동 전환

    s = client.get("/api/hidden/status", headers=h).json()
    assert s["discovered"] == 1
    assert "total" not in s  # 총 개수 비공개


def test_hidden_target_null_when_all_collected():
    h = _headers()
    for cid in ("h-normal-0", "h-normal-1", "h-hidden-0", "h-hidden-1"):
        client.post("/api/stamps", headers=h, json={"contentid": cid})
    status = client.get(f"/api/stamps/district/{HIDDEN_TEST_SIGUNGU}", headers=h).json()
    assert status["hiddenReady"] is True
    assert status["hiddenTargetContentId"] is None  # 이 구의 히든을 전부 수집함
