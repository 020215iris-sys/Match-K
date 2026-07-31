"""유저 프로필 API (D7 [B])."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Itinerary, Stamp, User
from app.services.tourapi_client import normalize_lang

router = APIRouter(prefix="/api/users", tags=["users"])


class LanguageUpdate(BaseModel):
    lang: str


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.display_name, "email": user.email,
            "lang": user.lang, "isGuest": user.is_guest}


@router.patch("/me/language")
def update_language(body: LanguageUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    user.lang = normalize_lang(body.lang)
    db.commit()
    return {"lang": user.lang}


@router.delete("/me", status_code=204)
def delete_account(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """회원탈퇴 — 계정 + 연결된 모든 데이터(도장) 영구 삭제.

    구글 플레이/앱스토어 심사 필수 요건: 로그인 있는 앱은 인앱 계정삭제 경로 제공.
    사용자 위치는 애초에 서버에 저장하지 않으므로(위치정보법 대응) 삭제 대상은 계정·도장·일정뿐.
    TODO(정현): 회원탈퇴 시 일정 데이터 '삭제 vs 익명 보존'은 회의 안건 (역추천 신호 보존 목적).
    """
    db.query(Stamp).filter(Stamp.user_id == user.id).delete(synchronize_session=False)
    for it in db.query(Itinerary).filter(Itinerary.user_id == user.id).all():
        db.delete(it)  # cascade → itinerary_items
    db.delete(user)
    db.commit()
    return None
