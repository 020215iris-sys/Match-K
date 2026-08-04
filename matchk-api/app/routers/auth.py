"""Google OAuth (D2 [B]) + 게스트 모드 (부록 D 폴백).

프론트 흐름: GET /auth/google/url → 브라우저 로그인 → 콜백에서 JWT 수신.
Google Cloud Console에서 클라이언트 ID/시크릿 발급 후 .env에 설정.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import create_jwt
from app.models.user import User
from app.services.tourapi_client import normalize_lang

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"


def _upsert_google_user(db: Session, info: dict) -> User:
    """구글 프로필(sub/email/name/locale)로 유저 생성 또는 조회."""
    user = db.query(User).filter(User.google_sub == info["sub"]).first()
    if user is None:
        user = User(google_sub=info["sub"], email=info.get("email"),
                    display_name=info.get("name", "Traveler"),
                    lang=normalize_lang(info.get("locale")))
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("/google/url")
def google_auth_url():
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "google_oauth_not_configured")
    params = (
        f"client_id={settings.GOOGLE_CLIENT_ID}"
        f"&redirect_uri={settings.GOOGLE_REDIRECT_URI}"
        "&response_type=code&scope=openid%20email%20profile"
    )
    return {"url": f"{GOOGLE_AUTH}?{params}"}


@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(GOOGLE_TOKEN, data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        if token_resp.status_code != 200:
            raise HTTPException(401, "google_token_exchange_failed")
        access_token = token_resp.json()["access_token"]
        info_resp = await client.get(GOOGLE_USERINFO, headers={"Authorization": f"Bearer {access_token}"})
        if info_resp.status_code != 200:
            raise HTTPException(401, "google_userinfo_failed")
        info = info_resp.json()

    user = _upsert_google_user(db, info)
    return {"token": create_jwt(user.id), "user": {"id": user.id, "name": user.display_name, "lang": user.lang}}


class GoogleMobileLogin(BaseModel):
    idToken: str


@router.post("/google/mobile")
async def google_mobile(body: GoogleMobileLogin, db: Session = Depends(get_db)):
    """앱(expo-auth-session)이 받은 id_token을 검증 후 우리 JWT 발급.

    앱은 구글과 직접 통신해 id_token을 받고, 그 토큰만 서버로 보낸다.
    서버는 구글 tokeninfo로 서명·만료를 검증하고 aud(우리 클라이언트 ID)인지 확인.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(GOOGLE_TOKENINFO, params={"id_token": body.idToken})
    if resp.status_code != 200:
        raise HTTPException(401, "invalid_google_token")
    info = resp.json()
    allowed = settings.google_allowed_aud
    if allowed and info.get("aud") not in allowed:
        raise HTTPException(401, "google_aud_mismatch")
    if not info.get("sub"):
        raise HTTPException(401, "google_no_sub")
    user = _upsert_google_user(db, info)
    return {"token": create_jwt(user.id), "user": {"id": user.id, "name": user.display_name, "lang": user.lang}}


@router.post("/guest")
def guest_login(lang: str = "en", db: Session = Depends(get_db)):
    """게스트 모드 (부록 D: OAuth 시간 부족 폴백 / 로컬 개발용)."""
    user = User(is_guest=True, display_name="Guest", lang=normalize_lang(lang))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_jwt(user.id), "user": {"id": user.id, "name": user.display_name, "lang": user.lang}}


@router.post("/logout")
def logout():
    """JWT는 stateless — 실제 로그아웃은 클라이언트 토큰 삭제 (D7 [B])."""
    return {"ok": True}
