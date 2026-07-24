"""랜드마크 참조 로더 (D2 [C]) — 일 1회 갱신용 동기화 스크립트.

⚠️ '파일데이터'가 아니라 TourAPI OpenAPI 실시간 호출로 참조 키만 수집한다 (심사 정책, 계획서 §4).
   저장 필드: contentid, 좌표, 구 코드뿐. 콘텐츠(이름/이미지/설명)는 저장하지 않는다.

실행: python -m app.scripts.seed_landmarks
"""
import asyncio

from app.core.database import Base, SessionLocal, engine
from app.models import Country, District, Landmark, Region
from app.services import tourapi_client

# 부산 16개 구·군 (15구 + 기장군).
# ✅ 실사 검증 완료 (2026-07-13): areaCode2 실응답과 1~16 전체 일치 (D2 DoD 충족)
BUSAN_DISTRICTS = [
    (1, "강서구", "Gangseo-gu", False),
    (2, "금정구", "Geumjeong-gu", False),
    (3, "기장군", "Gijang-gun", False),
    (4, "남구", "Nam-gu", False),
    (5, "동구", "Dong-gu", True),      # 발길 끊긴 구
    (6, "동래구", "Dongnae-gu", False),
    (7, "부산진구", "Busanjin-gu", False),
    (8, "북구", "Buk-gu", False),
    (9, "사상구", "Sasang-gu", False),
    (10, "사하구", "Saha-gu", False),
    (11, "서구", "Seo-gu", True),      # 발길 끊긴 구
    (12, "수영구", "Suyeong-gu", False),
    (13, "연제구", "Yeonje-gu", False),
    (14, "영도구", "Yeongdo-gu", True),  # 발길 끊긴 구
    (15, "중구", "Jung-gu", False),
    (16, "해운대구", "Haeundae-gu", False),
]


def seed_geo(db) -> dict[int, int]:
    """국가>광역>구 트리 시드. 반환: sigungu_code → district.id"""
    kr = db.query(Country).filter_by(code="KR").first()
    if kr is None:
        kr = Country(code="KR", name_ko="한국")
        db.add(kr)
        db.flush()
    busan = db.query(Region).filter_by(tour_area_code=6).first()
    if busan is None:
        busan = Region(country_id=kr.id, tour_area_code=6, name_ko="부산광역시")
        db.add(busan)
        db.flush()
    mapping = {}
    for code, name_ko, name_en, declining in BUSAN_DISTRICTS:
        d = db.query(District).filter_by(region_id=busan.id, sigungu_code=code).first()
        if d is None:
            d = District(region_id=busan.id, sigungu_code=code, name_ko=name_ko,
                         name_en=name_en, is_declining=declining)
            db.add(d)
            db.flush()
        mapping[code] = d.id
    db.commit()
    return mapping


async def sync_landmarks(db, district_ids: dict[int, int]) -> int:
    """국문 관광정보 API 페이징 → 참조 upsert. 최소 500건 목표 (D2 DoD)."""
    count = 0
    for page in range(1, 11):  # 최대 1000건
        # 도장 대상은 관광지 타입(contentTypeId=12)만 — 음식점 등 제외 (팀 회의로 확장 가능)
        items = await tourapi_client.list_by_area("ko", page=page, content_type_id=12)
        if not items:
            break
        for item in items:
            cid = str(item.get("contentid", ""))
            try:
                sigungu = int(item.get("sigungucode", 0))
                mapx, mapy = float(item["mapx"]), float(item["mapy"])
            except (KeyError, TypeError, ValueError):
                continue
            if not cid or sigungu not in district_ids or not mapx or not mapy:
                continue
            lm = db.query(Landmark).filter_by(contentid=cid).first()
            if lm is None:
                lm = Landmark(contentid=cid, district_id=district_ids[sigungu], mapx=mapx, mapy=mapy)
                db.add(lm)
            else:
                lm.district_id, lm.mapx, lm.mapy, lm.is_active = district_ids[sigungu], mapx, mapy, True
            count += 1
        db.commit()
        if len(items) < 100:
            break
    return count


async def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        district_ids = seed_geo(db)
        print(f"districts seeded: {len(district_ids)}")
        n = await sync_landmarks(db, district_ids)
        print(f"landmarks synced: {n} (목표 500+, D2 DoD)")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
