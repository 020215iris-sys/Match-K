"""랜드마크 API 프록시 (D3 [B]).

응답 = DB 참조(좌표/구) + TourAPI 실시간 콘텐츠 조인. 콘텐츠는 DB에 저장하지 않는다 (계획서 §4).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user_optional
from app.models import District, Landmark, Stamp
from app.models.user import User
from app.services import lang_mapping, tourapi_client, translator

router = APIRouter(prefix="/api/landmarks", tags=["landmarks"])

# ✅ 연관 관광지 응답 필드 확정 (3차 실사, 601건 검증):
#    tAtsNm(기준 관광지), rlteTatsNm(연관 관광지), rlteSignguNm(구명),
#    rlteRank(연관 순위), rlteCtgryLclsNm/Mcls/Scls(카테고리)
BASE_NAME_KEYS = ("tAtsNm",)
RLTE_NAME_KEYS = ("rlteTatsNm",)
RLTE_REGION_KEYS = ("rlteSignguNm", "rlteRegnNm")


def _first(row: dict, keys: tuple) -> str | None:
    for k in keys:
        v = row.get(k)
        if v:
            return str(v)
    return None


def _normalize_related(rows: list[dict], base_title: str | None) -> list[dict]:
    """시군구 단위 연관 목록에서 기준 관광지명으로 필터 → 프론트용 형태로 정규화.
    기준명 매칭 실패 시(필드명 상이 등) 구 전체 연관 목록으로 폴백."""
    mine = [r for r in rows if base_title and _first(r, BASE_NAME_KEYS) == base_title]
    use = mine if mine else rows

    def _rank(r: dict) -> int:
        try:
            return int(r.get("rlteRank") or 999)
        except (TypeError, ValueError):
            return 999

    use = sorted(use, key=_rank)  # 연관 순위대로 (실사 확정 필드)
    out, seen = [], set()
    for r in use:
        name = _first(r, RLTE_NAME_KEYS)
        if not name or name in seen or name == base_title:
            continue
        seen.add(name)
        subtitle = " · ".join(x for x in (_first(r, RLTE_REGION_KEYS), r.get("rlteCtgrySclsNm")) if x)
        out.append({"title": name, "addr1": subtitle, "raw": r})
    return out[:20]


@router.get("")
async def list_landmarks(district: int | None = Query(None, description="TourAPI sigunguCode"),
                         type: int | None = Query(None, description="contentTypeId (12=관광지)"),
                         lang: str = "en", db: Session = Depends(get_db)):
    """시/구별 랜드마크 리스트 — 콘텐츠는 실시간 호출. type=12면 도장 대상만."""
    items = await tourapi_client.list_by_area(lang, sigungu_code=district, content_type_id=type)
    return {"items": items, "count": len(items)}


@router.get("/nearby")
async def nearby_landmarks(lat: float, lng: float, radius: int = 3000, lang: str = "en"):
    items = await tourapi_client.location_based(lang, lat, lng, radius_m=radius)
    return {"items": items, "count": len(items)}


@router.get("/{contentid}/related")
async def related_landmarks(contentid: str, db: Session = Depends(get_db)):
    """스케줄러용 연관 관광지 (D5 [C]).

    TarRlteTarService1은 시군구 단위 목록이라(실사 확인) 기준 관광지의 구를 찾아
    그 구의 연관 목록을 받은 뒤 기준 관광지명으로 필터한다.
    """
    title, sigungu = None, None
    detail = await tourapi_client.detail_common("ko", contentid)
    if detail:
        title = detail.get("title")
        try:
            sigungu = int(detail.get("sigungucode") or 0) or None
        except (TypeError, ValueError):
            sigungu = None
    if sigungu is None:
        ref = db.query(Landmark).filter(Landmark.contentid == contentid).first()
        if ref:
            d = db.get(District, ref.district_id)
            sigungu = d.sigungu_code if d else None
    if sigungu is None:
        return {"items": [], "count": 0}
    try:
        rows = await tourapi_client.related_tourism_list(sigungu)
    except tourapi_client.TourApiError:
        rows = []  # 미승인/장애 시 빈 리스트 (프론트에서 안내)
    items = _normalize_related(rows, title)
    return {"items": items, "count": len(items)}


@router.get("/{contentid}")
async def landmark_detail(contentid: str, lang: str = "en", db: Session = Depends(get_db),
                          user: User | None = Depends(get_current_user_optional)):
    detail = await tourapi_client.detail_common(lang, contentid)
    localized = detail is not None or lang == "ko"
    if detail is None and lang != "ko":
        # contentid는 국문 서비스 기준이라 다국어 서비스에 직접 조회가 실패할 수 있음 →
        # 국문 상세의 좌표/명칭으로 유저 언어 등록부에서 대응 장소를 찾아 그쪽 상세를 시도
        detail = await tourapi_client.detail_common("ko", contentid)
        if detail is not None:
            try:
                registry = await lang_mapping.build_lang_registry(lang)
                matched = lang_mapping.match_place(detail, registry)
            except Exception:
                matched = None
            if matched is not None and matched.get("contentid"):
                localized_detail = await tourapi_client.detail_common(
                    lang, str(matched["contentid"]))
                if localized_detail is not None:
                    detail = localized_detail
                    localized = True
    if detail is None:
        raise HTTPException(404, "landmark_not_found")

    # 번역 폴백: 외국어판이 없어 국문을 그대로 쓰는 경우(localized=False) → 주요 필드 자동번역.
    # 컨셉 보호: '히든이라 정보가 없음'이라는 판단(localized)은 유지하고, 표시만 번역으로 채움.
    translated = False
    if not localized and lang != "ko":
        detail, translated = await translator.translate_fields(
            detail, ("title", "overview", "addr1"), lang)

    ref = db.query(Landmark).filter(Landmark.contentid == contentid).first()
    stamped = False
    if user and ref:
        stamped = db.query(Stamp).filter(Stamp.user_id == user.id, Stamp.landmark_id == ref.id).first() is not None
    district_name = None
    if ref:
        d = db.get(District, ref.district_id)
        district_name = d.name_en if d else None
    return {"detail": detail, "stamped": stamped, "district": district_name,
            "landmarkId": ref.id if ref else None,
            "availableInYourLanguage": localized,
            "translated": translated,  # true면 앱에서 '자동 번역됨' 라벨 표시
            # 도장 거리검증용 좌표 (앱이 단말기 내에서 계산 — 위치 서버전송 회피)
            "stampLat": ref.mapy if ref else None,
            "stampLng": ref.mapx if ref else None}
