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
# ja/zh는 TourAPI 공식 다국어(areaCode2) 값 — 2026-09-04 추가 (지현 제공, 업적지도 세부보기 다국어 대응)
BUSAN_DISTRICTS = [
    (1, "강서구", "Gangseo-gu", "江西区", "江西区", False),
    (2, "금정구", "Geumjeong-gu", "金井区", "金井区", False),
    (3, "기장군", "Gijang-gun", "機張郡", "机张郡", False),
    (4, "남구", "Nam-gu", "南区", "南区", False),
    (5, "동구", "Dong-gu", "東区", "东区", True),      # 발길 끊긴 구
    (6, "동래구", "Dongnae-gu", "東莱区", "东莱区", False),
    (7, "부산진구", "Busanjin-gu", "釜山鎮区", "釜山镇区", False),
    (8, "북구", "Buk-gu", "北区", "北区", False),
    (9, "사상구", "Sasang-gu", "沙上区", "沙上区", False),
    (10, "사하구", "Saha-gu", "沙下区", "沙下区", False),
    (11, "서구", "Seo-gu", "西区", "西区", True),      # 발길 끊긴 구
    (12, "수영구", "Suyeong-gu", "水営区", "水营区", False),
    (13, "연제구", "Yeonje-gu", "蓮堤区", "莲堤区", False),
    (14, "영도구", "Yeongdo-gu", "影島区", "影岛区", True),  # 발길 끊긴 구
    (15, "중구", "Jung-gu", "中区", "中区", False),
    (16, "해운대구", "Haeundae-gu", "海雲台区", "海云台区", False),
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
    for code, name_ko, name_en, name_ja, name_zh, declining in BUSAN_DISTRICTS:
        d = db.query(District).filter_by(region_id=busan.id, sigungu_code=code).first()
        if d is None:
            d = District(region_id=busan.id, sigungu_code=code, name_ko=name_ko,
                         name_en=name_en, name_ja=name_ja, name_zh=name_zh, is_declining=declining)
            db.add(d)
            db.flush()
        mapping[code] = d.id
    db.commit()
    return mapping


# 알려진 TourAPI 원본 데이터 오류 — 재시드(일 1회) 때마다 아래 sync_landmarks()가
# 기존 행의 is_active를 무조건 True로 되돌리므로, DB에서 is_active=False로 꺼두는 것만으론
# 다음 시드 실행 시 조용히 되살아난다. 여기서 아예 upsert 대상에서 제외해 재발을 막는다.
#
#   - contentid 2907087 (반송공원, 부산 해운대구): TourAPI가 mapx=117.9925662504,
#     mapy=19.6944274800(대만 근해)로 반환. addr1은 "부산광역시 해운대구 반송순환로
#     100-53"으로 정상이라 주소는 맞는데 좌표만 잘못됨.
#   - 2026-09-05 재조회에서도 동일하게 잘못된 값 확인 — 우리 파싱/저장 버그가 아니라
#     TourAPI 원본 자체의 오류.
#   - 좌표 기반 거리 계산(홈 역추천·근처 검색)이 무너지므로 제외.
#   - 좌표를 임의로 보정하지 않은 이유: 공공데이터 원본을 우리가 지어내면 데이터 출처의
#     신뢰성이 깨진다. TourAPI가 자체적으로 정정하면 이 목록에서 빼면 됨.
_KNOWN_BAD_CONTENTIDS = {"2907087"}


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
            if cid in _KNOWN_BAD_CONTENTIDS:
                continue  # 위 주석 참고 — is_active 재활성화 방지
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
