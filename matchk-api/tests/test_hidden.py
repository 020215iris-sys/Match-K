"""히든 미션 테스트 — 별도 컬렉션 + 잠금 조건 + 진행률 분리."""
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.main import app
from app.models import Country, District, Landmark, Region, Stamp

client = TestClient(app)


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # 다른 테스트 모듈과 in-memory DB를 공유할 수 있어 get-or-create로 충돌 방지
    kr = db.query(Country).filter_by(code="KR").first() or Country(code="KR", name_ko="한국")
    db.add(kr); db.flush()
    busan = db.query(Region).filter_by(tour_area_code=6).first() \
        or Region(country_id=kr.id, tour_area_code=6, name_ko="부산광역시")
    db.add(busan); db.flush()
    # 일반 구(도장판) + 소멸위험 구(히든)
    nam = District(region_id=busan.id, sigungu_code=4, name_ko="남구", name_en="Nam-gu", is_declining=False)
    dong = District(region_id=busan.id, sigungu_code=5, name_ko="동구", name_en="Dong-gu", is_declining=True)
    db.add_all([nam, dong]); db.flush()
    # 일반 도장판 랜드마크 4개 (남구)
    for i in range(4):
        db.add(Landmark(contentid=f"normal-{i}", district_id=nam.id, mapx=129.06, mapy=35.14, is_hidden=False))
    # 히든 랜드마크 2개 (동구)
    db.add(Landmark(contentid="hidden-0", district_id=dong.id, mapx=129.04, mapy=35.13, is_hidden=True))
    db.add(Landmark(contentid="hidden-1", district_id=dong.id, mapx=129.05, mapy=35.12, is_hidden=True))
    db.commit(); db.close()


def _token() -> str:
    return client.post("/auth/guest?lang=en").json()["token"]


def _headers(tok=None):
    return {"Authorization": f"Bearer {tok or _token()}"}


def test_progress_excludes_hidden():
    # 남구(4)는 일반 4건 노출 / 동구(5)는 히든뿐이라 진행률에서 사라짐 (in-memory DB 공유 대비 구별 검증)
    h = _headers()
    nam = client.get("/api/stamps/progress?district=4", headers=h).json()
    assert nam["districts"][0]["total"] == 4
    dong = client.get("/api/stamps/progress?district=5", headers=h).json()
    assert dong["districts"] == []  # 히든만 있는 구는 도장판에서 제외


def test_hidden_locked_by_default():
    h = _headers()
    s = client.get("/api/hidden/status", headers=h).json()
    assert s["unlocked"] is False        # 도장 0개 → 잠김
    assert s["discovered"] == 0
    assert "total" not in s              # 총 개수 비공개
    # 잠금 상태에선 히든 좌표도 안 줌
    assert client.get("/api/hidden/landmarks", headers=h).json()["items"] == []


def test_hidden_unlocks_and_collects():
    tok = _token(); h = _headers(tok)
    # 일반 도장판 4개 다 찍어 잠금 해제 (map 100%, stamp 100% > 임계값)
    for i in range(4):
        assert client.post("/api/stamps", headers=h, json={"contentid": f"normal-{i}"}).status_code == 201
    s = client.get("/api/hidden/status", headers=h).json()
    assert s["unlocked"] is True
    # 해제되면 히든 좌표 제공
    items = client.get("/api/hidden/landmarks", headers=h).json()["items"]
    assert len(items) == 2
    # 히든 도장 수집 → is_hidden 컬렉션에 쌓이고 discovered 증가
    r = client.post("/api/stamps", headers=h, json={"contentid": "hidden-0"})
    assert r.status_code == 201 and r.json()["isHidden"] is True
    s2 = client.get("/api/hidden/status", headers=h).json()
    assert s2["discovered"] == 1
    # 히든 도장은 일반 진행률(이 유저)을 바꾸지 않음 — 남구 4개만 반영, 히든 제외
    nam = client.get("/api/stamps/progress?district=4", headers=_headers(tok)).json()
    assert nam["districts"][0]["stamped"] == 4
