"""인증 테스트 — 게스트 로그인 + 구글 모바일 엔드포인트 오류 경로.
실제 구글 호출은 하지 않고, 잘못된 토큰이 401로 거부되는지 확인."""
from fastapi.testclient import TestClient

from app.core.database import Base, engine
from app.main import app

client = TestClient(app)


def setup_module():
    Base.metadata.create_all(bind=engine)


def test_guest_login_works():
    r = client.post("/auth/guest?lang=ja")
    assert r.status_code == 200
    assert r.json()["token"]


def test_google_mobile_requires_access_token():
    # 필수 필드(accessToken) 누락은 네트워크 없이 검증됨 (422)
    r = client.post("/auth/google/mobile", json={})
    assert r.status_code == 422

# 참고: 잘못된 액세스 토큰 → 401 동작은 실제 구글 호출이 필요해 단위 테스트에서는 생략.
#       실환경/CI(네트워크 가능)에서 dev build로 확인.
