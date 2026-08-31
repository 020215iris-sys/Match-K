"""히든 미션 API — 발견 현황 조회 전용 (2026-08 개편: GPS 근접 → 구별 비율 트리거).

⚠️ 히든 발동 조건·팝업 대상 지정은 이제 이 파일이 아니라 stamps.py `district_status`가 담당한다.
   그 구의 도장 비율이 임계값(HIDDEN_STAMP_THRESHOLD)을 넘으면 hiddenReady=true가 되고,
   같은 응답의 hiddenTargetContentId로 팝업에 띄울 장소까지 지정된다.
   (기존 방식 — 부산 전체 비율로 통합 잠금 해제 후 GPS 근접 감지로 조우 — 는 폐기.
    프론트도 useHiddenEncounter가 더 이상 위치를 읽지 않는다.)
⚠️ 위치정보보호법: 이 파일은 애초에 좌표를 다루지 않는다(히든 좌표 배포 API 자체를 제거).
⚠️ 총 개수 비공개: 사용자에겐 '발견한 수'만 보여주고 전체 히든 수는 알려주지 않는다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Stamp
from app.models.user import User

router = APIRouter(prefix="/api/hidden", tags=["hidden"])


@router.get("/status")
def hidden_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """지금까지 발견한 히든 도장 개수만 반환한다 (전체 히든 개수는 비공개).

    잠금/해제 개념은 이제 구 단위(stamps.py district_status)라 여기엔 없다 —
    이 엔드포인트는 프로필 등에서 "히든 N곳 발견" 배지를 보여줄 때 쓴다.
    """
    discovered = (db.query(func.count(Stamp.id))
                  .filter(Stamp.user_id == user.id, Stamp.is_hidden.is_(True)).scalar() or 0)
    return {"discovered": discovered}
