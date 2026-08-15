"""여행 일정(스케줄러) API (신규 — 2026-07-31 개편).

일정 파일 CRUD + 장소 담기/일차 이동. 두 진입 경로(홈 검색발 / 스케줄러발) 공용.
⚠️ 참조 키만 저장 — 콘텐츠(설명·이미지)는 앱이 상세 API로 실시간 조회.
TODO(다은): 정렬 재정렬 로직 정교화, 역추천용 집계 뷰(후속).

2026-08-15 수정: add_item / move_item에 dayIndex 범위 검증 추가.
  기존엔 dayIndex가 실제 여행기간(dayCount) 범위를 넘어도 그대로 저장되어,
  프론트 화면(1~dayCount 섹션만 렌더링)에서 항목이 조용히 사라지는 문제가 있었음.
  클라이언트 방어(moveNextDay의 dayIndex >= dayCount 체크)만 있고 서버 검증이 없었던 게 원인.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Itinerary, ItineraryItem, User

router = APIRouter(prefix="/api/itineraries", tags=["itineraries"])


class ItineraryCreate(BaseModel):
    name: str
    startDate: date | None = None
    endDate: date | None = None


class ItemCreate(BaseModel):
    contentid: str
    dayIndex: int = 1
    lat: float | None = None
    lng: float | None = None
    sigunguCode: int | None = None
    contenttypeid: str | None = None
    title: str | None = None


class ItemMove(BaseModel):
    dayIndex: int | None = None
    sortOrder: int | None = None


def _day_count(it: Itinerary) -> int:
    if it.start_date and it.end_date:
        return (it.end_date - it.start_date).days + 1
    return 1


def _owned(db: Session, itinerary_id: int, user_id: int) -> Itinerary:
    it = db.get(Itinerary, itinerary_id)
    if it is None or it.user_id != user_id:
        raise HTTPException(404, "itinerary_not_found")
    return it


def _validate_day_index(day_index: int, it: Itinerary) -> None:
    """dayIndex가 1..dayCount 범위 밖이면 400.
    범위 밖 항목은 화면(1~dayCount 섹션만 렌더링)에서 사라지므로 저장 전에 막는다."""
    day_count = _day_count(it)
    if day_index < 1 or day_index > day_count:
        raise HTTPException(400, f"day_index_out_of_range: must be between 1 and {day_count}")


@router.get("")
def list_itineraries(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (db.query(Itinerary).filter(Itinerary.user_id == user.id)
            .order_by(Itinerary.created_at.desc()).all())
    return {"items": [{
        "id": it.id, "name": it.name,
        "startDate": it.start_date.isoformat() if it.start_date else None,
        "endDate": it.end_date.isoformat() if it.end_date else None,
        "dayCount": _day_count(it), "itemCount": len(it.items),
    } for it in rows]}


@router.post("", status_code=201)
def create_itinerary(body: ItineraryCreate, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    it = Itinerary(user_id=user.id, name=body.name,
                   start_date=body.startDate, end_date=body.endDate)
    db.add(it)
    db.commit()
    db.refresh(it)
    return {"id": it.id, "name": it.name, "dayCount": _day_count(it)}


@router.get("/{itinerary_id}")
def get_itinerary(itinerary_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    it = _owned(db, itinerary_id, user.id)
    items = sorted(it.items, key=lambda x: (x.day_index, x.sort_order, x.id))
    return {
        "id": it.id, "name": it.name,
        "startDate": it.start_date.isoformat() if it.start_date else None,
        "endDate": it.end_date.isoformat() if it.end_date else None,
        "dayCount": _day_count(it),
        "items": [{
            "id": x.id, "contentid": x.contentid, "dayIndex": x.day_index,
            "sortOrder": x.sort_order, "title": x.title,
            "lat": x.lat, "lng": x.lng, "sigunguCode": x.sigungu_code,
            "contenttypeid": x.contenttypeid,
        } for x in items],
    }


@router.delete("/{itinerary_id}", status_code=204)
def delete_itinerary(itinerary_id: int, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    it = _owned(db, itinerary_id, user.id)
    db.delete(it)  # cascade → items
    db.commit()
    return None


@router.post("/{itinerary_id}/items", status_code=201)
def add_item(itinerary_id: int, body: ItemCreate, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)):
    it = _owned(db, itinerary_id, user.id)
    _validate_day_index(body.dayIndex, it)
    # 같은 일차 맨 뒤로 배치
    max_order = (db.query(func.max(ItineraryItem.sort_order))
                 .filter(ItineraryItem.itinerary_id == it.id,
                         ItineraryItem.day_index == body.dayIndex).scalar())
    item = ItineraryItem(
        itinerary_id=it.id, contentid=body.contentid, day_index=body.dayIndex,
        sort_order=(max_order + 1) if max_order is not None else 0,
        lat=body.lat, lng=body.lng, sigungu_code=body.sigunguCode,
        contenttypeid=body.contenttypeid, title=body.title,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "dayIndex": item.day_index, "sortOrder": item.sort_order}


@router.patch("/{itinerary_id}/items/{item_id}")
def move_item(itinerary_id: int, item_id: int, body: ItemMove,
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """드래그앤드랍 이동 — 일차/순서 변경."""
    it = _owned(db, itinerary_id, user.id)
    item = db.get(ItineraryItem, item_id)
    if item is None or item.itinerary_id != itinerary_id:
        raise HTTPException(404, "item_not_found")
    if body.dayIndex is not None:
        _validate_day_index(body.dayIndex, it)
        item.day_index = body.dayIndex
    if body.sortOrder is not None:
        item.sort_order = body.sortOrder
    db.commit()
    return {"id": item.id, "dayIndex": item.day_index, "sortOrder": item.sort_order}


@router.delete("/{itinerary_id}/items/{item_id}", status_code=204)
def delete_item(itinerary_id: int, item_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    _owned(db, itinerary_id, user.id)
    item = db.get(ItineraryItem, item_id)
    if item is None or item.itinerary_id != itinerary_id:
        raise HTTPException(404, "item_not_found")
    db.delete(item)
    db.commit()
    return None
