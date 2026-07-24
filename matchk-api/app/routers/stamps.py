"""도장(스탬프) API (D4 [B]).

- ⚠️ 위치정보보호법 준수: GPS 거리 검증은 단말기(앱)에서 수행하고, 서버로 위치를 전송하지 않는다.
  서버는 '도장 획득 사실'(contentid)만 기록 → 위치정보사업자 신고 대상에서 제외 (공모전 FAQ).
  랜드마크 좌표는 상세 API가 앱에 내려주고, 앱이 현재 위치와 비교(반경 GPS_RADIUS_M).
- unique 제약으로 중복 방지
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import District, Landmark, Stamp
from app.models.user import User

router = APIRouter(prefix="/api/stamps", tags=["stamps"])
settings = get_settings()


class StampCreate(BaseModel):
    contentid: str  # 위치는 받지 않음 — 거리 검증은 단말기에서 완료된 상태로 호출됨


@router.post("", status_code=201)
def create_stamp(body: StampCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    landmark = db.query(Landmark).filter(Landmark.contentid == body.contentid, Landmark.is_active).first()
    if landmark is None:
        raise HTTPException(404, "landmark_not_found")

    # 히든 장소 도장은 별도 컬렉션으로 표시 (일반 진행률에서 분리)
    stamp = Stamp(user_id=user.id, landmark_id=landmark.id, is_hidden=landmark.is_hidden)
    db.add(stamp)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "already_stamped")
    db.refresh(stamp)
    return {"stampId": stamp.id, "contentid": body.contentid, "isHidden": landmark.is_hidden}


@router.get("/me")
def my_stamps(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(Stamp, Landmark).join(Landmark, Stamp.landmark_id == Landmark.id)
            .filter(Stamp.user_id == user.id).all())
    return {"items": [{"contentid": lm.contentid, "stampedAt": st.created_at.isoformat()} for st, lm in rows],
            "count": len(rows)}


@router.get("/progress")
def progress(district: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """시/구별 진행률 → 업적지도 투명도 색칠 (D6 [A]). 진행률 = 방문/전체."""
    # 일반 도장판은 히든 장소 제외 (히든은 별도 컬렉션 — /hidden/status에서 집계)
    q = (db.query(District.sigungu_code, District.name_en, District.is_declining,
                  func.count(Landmark.id).label("total"),
                  func.count(Stamp.id).label("stamped"))
         .join(Landmark, (Landmark.district_id == District.id) & (Landmark.is_hidden.is_(False)))
         .outerjoin(Stamp, (Stamp.landmark_id == Landmark.id) & (Stamp.user_id == user.id))
         .group_by(District.id))
    if district is not None:
        q = q.filter(District.sigungu_code == district)
    items = [{"sigunguCode": code, "name": name, "isDeclining": declining,
              "total": total, "stamped": stamped,
              "progress": round(stamped / total, 3) if total else 0.0}
             for code, name, declining, total, stamped in q.all()]
    total_all = sum(i["total"] for i in items)
    stamped_all = sum(i["stamped"] for i in items)
    return {"districts": items, "totalLandmarks": total_all, "totalStamped": stamped_all}
