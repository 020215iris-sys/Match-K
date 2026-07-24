"""도장 API 통합 테스트 (D4 [B] DoD) — sqlite in-memory, TourAPI 호출 없음.
환경변수 주입은 tests/conftest.py에서 (import 순서 문제 방지)."""
from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine
from app.main import app
from app.models import Country, District, Landmark, Region

client = TestClient(app)


def setup_module():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # in-memory DB를 다른 테스트 모듈과 공유할 수 있어 get-or-create로 충돌 방지
    kr = db.query(Country).filter_by(code="KR").first() or Country(code="KR", name_ko="한국")
    db.add(kr)
    db.flush()
    busan = db.query(Region).filter_by(tour_area_code=6).first() \
        or Region(country_id=kr.id, tour_area_code=6, name_ko="부산광역시")
    db.add(busan)
    db.flush()
    yeongdo = db.query(District).filter_by(region_id=busan.id, sigungu_code=14).first() \
        or District(region_id=busan.id, sigungu_code=14, name_ko="영도구", name_en="Yeongdo-gu", is_declining=True)
    db.add(yeongdo)
    db.flush()
    if not db.query(Landmark).filter_by(contentid="test-001").first():
        db.add(Landmark(contentid="test-001", district_id=yeongdo.id, mapx=129.0403, mapy=35.0911))
    db.commit()
    db.close()


def _token() -> str:
    resp = client.post("/auth/guest?lang=ja")
    assert resp.status_code == 200
    return resp.json()["token"]


def test_stamp_creates():
    # 위치는 전송하지 않음 — 거리 검증은 앱에서 끝나고 contentid만 옴
    headers = {"Authorization": f"Bearer {_token()}"}
    resp = client.post("/api/stamps", headers=headers, json={"contentid": "test-001"})
    assert resp.status_code == 201
    assert resp.json()["contentid"] == "test-001"


def test_stamp_unknown_landmark_404():
    headers = {"Authorization": f"Bearer {_token()}"}
    resp = client.post("/api/stamps", headers=headers, json={"contentid": "nope-999"})
    assert resp.status_code == 404


def test_stamp_ignores_location_fields():
    """위치 필드를 보내도 서버는 무시(저장 안 함) — pydantic extra 차단 확인."""
    headers = {"Authorization": f"Bearer {_token()}"}
    resp = client.post("/api/stamps", headers=headers,
                       json={"contentid": "test-001", "lat": 35.0911, "lng": 129.0403})
    assert resp.status_code == 201  # 여분 필드는 무시되고 정상 생성


def test_duplicate_stamp_conflict():
    headers = {"Authorization": f"Bearer {_token()}"}
    body = {"contentid": "test-001"}
    assert client.post("/api/stamps", headers=headers, json=body).status_code == 201
    assert client.post("/api/stamps", headers=headers, json=body).status_code == 409


def test_delete_account_removes_user_and_stamps():
    tok = _token()
    headers = {"Authorization": f"Bearer {tok}"}
    client.post("/api/stamps", headers=headers, json={"contentid": "test-001"})
    # 탈퇴 → 204, 이후 토큰 무효(계정 삭제됨)
    assert client.delete("/api/users/me", headers=headers).status_code == 204
    assert client.get("/api/users/me", headers=headers).status_code == 401
    # 도장도 함께 삭제됨 (재가입해도 기록 없음)


def test_progress():
    headers = {"Authorization": f"Bearer {_token()}"}
    client.post("/api/stamps", headers=headers, json={"contentid": "test-001"})
    resp = client.get("/api/stamps/progress", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalLandmarks"] >= 1
    yeongdo = next(d for d in data["districts"] if d["sigunguCode"] == 14)
    assert yeongdo["isDeclining"] is True
    assert yeongdo["progress"] == 1.0
