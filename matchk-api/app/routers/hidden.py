"""히든 미션 API (신규) — 포켓몬 고식 위치기반 조우.

컨셉: 일반 도장판과 별개. 조건(지도%+스탬프%) 충족 시 잠금 해제되고,
사용자가 소멸위험 구의 '숨은 장소' 근처를 지나가면 조우 팝업 등장.

⚠️ 위치정보보호법: 서버는 히든 장소 좌표만 내려주고, 근접 판정은 앱이 단말기 내에서 수행한다.
   사용자 GPS는 서버로 전송되지 않는다 (도장 API와 동일 원칙).
⚠️ 총 개수 비공개: 사용자에겐 '발견한 수'만 보여주고 전체 히든 수는 알려주지 않는다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import District, Landmark, Stamp
from app.models.user import User

router = APIRouter(prefix="/api/hidden", tags=["hidden"])
settings = get_settings()


def _map_and_stamp_progress(db: Session, user_id: int) -> tuple[float, float]:
    """일반 도장판 기준 (지도 색칠 비율, 스탬프 수집 비율). 히든 제외."""
    total = db.query(func.count(Landmark.id)).filter(
        Landmark.is_active, Landmark.is_hidden.is_(False)).scalar() or 0
    if total == 0:
        return 0.0, 0.0
    stamped = (db.query(func.count(Stamp.id))
               .join(Landmark, Landmark.id == Stamp.landmark_id)
               .filter(Stamp.user_id == user_id, Landmark.is_hidden.is_(False)).scalar() or 0)
    stamp_ratio = stamped / total
    # 지도 색칠 비율 = 도장이 하나라도 있는 구 / 전체 구
    total_districts = db.query(func.count(District.id)).scalar() or 0
    painted = (db.query(func.count(func.distinct(Landmark.district_id)))
               .join(Stamp, (Stamp.landmark_id == Landmark.id) & (Stamp.user_id == user_id))
               .filter(Landmark.is_hidden.is_(False)).scalar() or 0)
    map_ratio = painted / total_districts if total_districts else 0.0
    return map_ratio, stamp_ratio


@router.get("/status")
def hidden_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """히든 잠금 해제 여부 + 발견 개수(총 개수는 비공개)."""
    map_ratio, stamp_ratio = _map_and_stamp_progress(db, user.id)
    unlocked = (map_ratio >= settings.HIDDEN_MAP_THRESHOLD
                and stamp_ratio >= settings.HIDDEN_STAMP_THRESHOLD)
    discovered = (db.query(func.count(Stamp.id))
                  .filter(Stamp.user_id == user.id, Stamp.is_hidden.is_(True)).scalar() or 0)
    return {
        "unlocked": unlocked,
        "mapProgress": round(map_ratio, 3),
        "stampProgress": round(stamp_ratio, 3),
        "mapThreshold": settings.HIDDEN_MAP_THRESHOLD,
        "stampThreshold": settings.HIDDEN_STAMP_THRESHOLD,
        "discovered": discovered,  # 발견 개수만 (총 개수 비공개)
    }


@router.get("/landmarks")
def hidden_landmarks(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """근접 판정용 히든 장소 좌표 목록. 잠금 전이면 빈 목록.

    좌표만 내려주고 이름/콘텐츠는 주지 않음 — 조우(근접) 시 앱이 상세 API로 별도 조회.
    앱이 이 좌표들과 현재 위치를 단말기 내에서 비교해 조우를 판정한다.
    """
    map_ratio, stamp_ratio = _map_and_stamp_progress(db, user.id)
    if not (map_ratio >= settings.HIDDEN_MAP_THRESHOLD
            and stamp_ratio >= settings.HIDDEN_STAMP_THRESHOLD):
        return {"items": [], "unlocked": False}
    # 이미 발견(도장)한 히든은 제외
    collected = {row[0] for row in db.query(Stamp.landmark_id)
                 .filter(Stamp.user_id == user.id, Stamp.is_hidden.is_(True)).all()}
    rows = (db.query(Landmark)
            .filter(Landmark.is_active, Landmark.is_hidden.is_(True)).all())
    items = [{"contentid": lm.contentid, "lat": lm.mapy, "lng": lm.mapx}
             for lm in rows if lm.id not in collected]
    return {"items": items, "unlocked": True}
