"""역추천 파이프라인 (스코프 v2 §5, D4~D6 [C]).

Step 1  후보 풀: 다른 언어권 관심 상위 (관심 관광지 API 미확인 → 현재는 방향 2가 뼈대. D1 실사 후 결정)
Step 2  방문자수 검증: SKT 외국인 ↑ / KT 내국인 ↓ — ⚠️ 시군구 단위라 랜드마크는 소속 구 지표 상속
Step 3  큐레이션 보강: 유저 언어권에 얇게 소개된 곳 가산 (lang_mapping.thinness_score)
Step 4  필터: 부산만 / auto는 소멸위험 구 쿼터(DECLINING_QUOTA) / 이미 도장 찍은 곳 제외 / 히든 제외
Step 5  표시 언어 교체: 상위 결과를 유저 언어권 등록판으로 스왑 (미등록 시 플래그)

가중치(W_*)는 D7 [C] 튜닝 대상.

▸ 2026-08-19 구조 변경: recommend()가 '후보 수집'과 '점수 매기기'를 함께 하던 것을
  두 함수로 분리했다. 검색 라우터(지현)가 카테고리 칩으로 자체 수집한 후보에
  이 점수 로직을 재사용할 수 있게 하기 위함. /api/recommendations 동작은 그대로다.
    collect_candidates()  = Step 1
    score_and_rank()      = Step 2~5 + D8   ← 외부에서 재사용하는 함수
    recommend()           = 위 둘을 잇는 얇은 래퍼 (기존 시그니처 유지)
"""
import logging
import math
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.config import DECLINING_SIGUNGU_CODES, LDONG_TO_SIGUNGU, get_settings
from app.models import District, Landmark, Stamp
from app.services import lang_mapping, tourapi_client, translator

logger = logging.getLogger(__name__)
settings = get_settings()

# --- 가중치 (D7 [C] 튜닝) ---
W_FOREIGN = 1.0    # 구 단위 외국인 방문 지수
W_DOMESTIC = 0.8   # 구 단위 내국인 방문 지수 (낮을수록 가산)
W_THIN = 1.2       # 언어권 커버리지 얇음 (방향 2)
W_DECLINING = 0.6  # 소멸위험 구 보너스 (nearby용)

# auto 결과 중 소멸위험 구 최소 보장 비율 (팀 회의 조정 대상 — 1.0이면 기존 하드 필터와 동일)
# 하드 필터의 문제: 소멸위험 구에 외국어 등록 장소가 없으면 언어별 차별화 재료가 사라짐
DECLINING_QUOTA = 0.6

# TourAPI 장애 시 폴백: 프로세스 내 마지막 성공 응답 (한도 초과/일시 장애 대비)
_last_good_raw: dict[str, list] = {}


@dataclass
class Candidate:
    contentid: str
    title: str
    image: str
    sigungu_code: int | None
    lat: float | None
    lng: float | None
    score: float = 0.0
    congestion: float | None = None  # 집중률 % (D8 [B], 실사 확정 필드 cnctrRate)
    reasons: list[str] = field(default_factory=list)
    ko_title: str | None = None          # 언어 스왑 전 국문 제목 (혼잡률 이름 매칭용)
    localized: bool | None = None        # 유저 언어권 등록판으로 교체됐는지 (None=판별 불가)

    def to_dict(self) -> dict:
        return {
            "contentid": self.contentid, "title": self.title, "image": self.image,
            "sigunguCode": self.sigungu_code, "lat": self.lat, "lng": self.lng,
            "score": round(self.score, 3), "congestion": self.congestion,
            "reasons": self.reasons,
            "availableInYourLanguage": self.localized,
        }


def _to_candidate(item: dict) -> Candidate | None:
    cid = str(item.get("contentid", ""))
    if not cid:
        return None
    try:
        lat, lng = float(item.get("mapy") or 0) or None, float(item.get("mapx") or 0) or None
    except ValueError:
        lat = lng = None
    try:
        sigungu = int(item.get("sigungucode")) if item.get("sigungucode") else None
    except ValueError:
        sigungu = None
    return Candidate(cid, item.get("title", ""), item.get("firstimage", "") or item.get("firstimage2", ""),
                     sigungu, lat, lng)


async def _district_visit_index(db: Session) -> dict[int, dict[str, float]]:
    """구별 {foreign, domestic} 정규화 지수. 방문자수 API 미승인/장애 시 균등 폴백."""
    try:
        rows = await tourapi_client.visitor_stats()
    except Exception:
        rows = []
    if not rows:
        # 폴백: 데이터 없으면 모든 구 0.5 (소멸위험 보너스만 작동)
        # ⚠️ 이때 W_FOREIGN·W_DOMESTIC이 전 구 동일 상수(1.0*0.5 + 0.8*0.5 = 0.9)가 되어
        #    순위에 전혀 기여하지 못한다. 즉 역추천이 W_THIN + W_DECLINING 두 항목만으로 도는 상태.
        #    DataLabService 미승인/장애 시 조용히 이렇게 되므로 로그로 드러낸다.
        #    (D7 가중치 튜닝 전에 이 경고가 안 뜨는지 반드시 확인할 것)
        logger.warning("visitor_stats 없음 → 방문자 지수 균등 폴백. "
                       "W_FOREIGN/W_DOMESTIC이 순위에 기여하지 않는 상태입니다.")
        codes = [d.sigungu_code for d in db.query(District).all()] or list(range(1, 17))
        return {c: {"foreign": 0.5, "domestic": 0.5} for c in codes}
    # ✅ 4차 실사 확정 파싱: signguCode=법정동(부산 26xxx만 채택 → TourAPI 코드로 변환),
    #    touDivCd 1=현지인/2=외지인(→내국인 합산), 3=외국인
    agg: dict[int, dict[str, float]] = {}
    for r in rows:
        try:
            ldong = int(r.get("signguCode") or 0)
            num = float(r.get("touNum") or 0)
        except (TypeError, ValueError):
            continue
        code = LDONG_TO_SIGUNGU.get(ldong)
        if code is None:
            continue  # 부산 외 지역
        d = agg.setdefault(code, {"foreign": 0.0, "domestic": 0.0})
        if str(r.get("touDivCd", "")) == "3":
            d["foreign"] += num
        else:
            d["domestic"] += num
    for key in ("foreign", "domestic"):
        mx = max((v[key] for v in agg.values()), default=0) or 1.0
        for v in agg.values():
            v[key] = v[key] / mx
    return agg


def apply_declining_quota(scored: list["Candidate"], limit: int) -> list["Candidate"]:
    """소멸위험 구 최소 DECLINING_QUOTA 비율 보장 + 나머지 전체 점수순 (scored는 점수 내림차순 전제).

    기존 하드 필터(전부 소멸위험 구)는 그 구에 외국어 등록 장소가 없으면
    언어별 차별화 재료가 사라지는 부작용 → 쿼터로 완화. 1.0이면 기존 동작과 동일.
    """
    declining = [c for c in scored if c.sigungu_code in DECLINING_SIGUNGU_CODES]
    others = [c for c in scored if c.sigungu_code not in DECLINING_SIGUNGU_CODES]
    n_declining = min(len(declining), math.ceil(limit * DECLINING_QUOTA))
    top = declining[:n_declining] + others[: limit - n_declining]
    if len(top) < limit:  # 타 구 후보 부족 시 소멸위험 구로 마저 채움
        top += declining[n_declining : n_declining + (limit - len(top))]
    top.sort(key=lambda c: c.score, reverse=True)
    return top


def _stamped_contentids(db: Session, user_id: int | None) -> set[str]:
    if not user_id:
        return set()
    q = (db.query(Landmark.contentid).join(Stamp, Stamp.landmark_id == Landmark.id)
         .filter(Stamp.user_id == user_id))
    return {row[0] for row in q.all()}


def _hidden_contentids(db: Session) -> set[str]:
    """히든으로 지정된 장소의 contentid (추천 결과에서 제외할 대상).

    ▸ 신규. 히든은 '근처를 지나가다 우연히 조우'하는 컨셉이고 총 개수도 비공개인데
      (hidden.py 상단 정책), 추천 목록에 뜨면 그 서사가 깨진다. 게다가 히든 후보는
      외국어 미등록 + (소멸위험 구면) hidden_district 보너스라 오히려 상위에 잘 올라온다.
    """
    return {row[0] for row in db.query(Landmark.contentid)
            .filter(Landmark.is_hidden.is_(True)).all()}


# ══════════════════════════════════════════════════════════════════════
# [1/3] 후보 수집 — Step 1
#   "어떤 장소들을 후보로 볼 것인가"만 담당. 점수는 매기지 않는다.
# ══════════════════════════════════════════════════════════════════════

def candidates_from_raw(raw: list[dict]) -> list[Candidate]:
    """TourAPI 원본 item 리스트 → Candidate 객체 리스트 (contentid 없는 항목은 버림).

    ▸ 신규 공개 헬퍼. 기존에는 recommend() 안에 한 줄로 박혀 있던 변환이다.
      검색 라우터처럼 후보를 자체 수집하는 쪽에서 점수 파이프라인에 넣기 전에 쓴다.
    """
    return [c for c in (_to_candidate(i) for i in raw) if c]


async def collect_candidates(
    rec_type: str = "auto",
    lat: float | None = None,
    lng: float | None = None,
) -> tuple[list[dict], list[Candidate]]:
    """Step 1: 역추천용 기본 후보 풀을 TourAPI에서 수집.

    ▸ 기존 recommend()의 Step 1 블록을 그대로 옮긴 것. 로직 변경 없음.

    후보 풀은 관광지 타입(12)만 — 음식점/숙박이 랜드마크 추천에 섞이는 문제 방지.
    TourAPI 장애/한도 초과 시: 프로세스 내 마지막 성공 응답으로 폴백 (발표 중 500 방지).

    Returns:
        (raw, candidates)
        - raw:        TourAPI 국문 원본 item 리스트.
                      ★ Step 3 언어권 커버리지 비교에 원본 dict가 그대로 필요해서 같이 돌려준다.
        - candidates: raw를 Candidate 객체로 변환한 것.

    Raises:
        tourapi_client.TourApiError: 콜드 스타트 + API 장애로 폴백조차 없을 때 (라우터에서 503).
    """
    fallback_key = "nearby" if rec_type == "nearby" else "auto"
    try:
        if rec_type == "nearby" and lat is not None and lng is not None:
            raw = await tourapi_client.location_based("ko", lat, lng, rows=50, content_type_id=12)
        else:
            raw = []
            for page in (1, 2, 3):  # 관광지 타입 후보 최대 300건 (long cache라 콜 부담 적음)
                batch = await tourapi_client.list_by_area("ko", page=page, content_type_id=12,
                                                          use_long_cache=True)
                raw.extend(batch)
                if len(batch) < 100:
                    break
        if raw:
            _last_good_raw[fallback_key] = raw
    except Exception:
        raw = _last_good_raw.get(fallback_key) or _last_good_raw.get("auto") or []
        if not raw:
            # 폴백조차 없으면(콜드 스타트 + API 장애) 명시적 에러 → 라우터에서 503 처리
            raise tourapi_client.TourApiError("tourapi_unavailable_no_fallback")

    return raw, candidates_from_raw(raw)


# ══════════════════════════════════════════════════════════════════════
# [2/3] 점수 매기기 · 정렬 · 언어 스왑 — Step 2~5 + D8
#   후보를 "어디서 가져왔는지"와 무관하게 동작 → 검색 라우터에서도 재사용 가능.
# ══════════════════════════════════════════════════════════════════════

async def score_and_rank(
    db: Session,
    raw: list[dict],
    candidates: list[Candidate],
    user_lang: str,
    rec_type: str = "auto",
    user_id: int | None = None,
    limit: int = 10,
    apply_quota: bool | None = None,
) -> list[dict]:
    """후보에 점수를 매기고 정렬·언어 스왑·혼잡 태그까지 붙여 응답 dict 리스트로 반환.

    ▸ 기존 recommend()의 Step 2~5 + D8 블록을 옮긴 것. 점수 계산식은 변경 없음.

    Args:
        raw: 후보의 TourAPI **국문** 원본 item 리스트.
             ★ Step 3(lang_mapping.coverage_by_contentid)이 Candidate가 아니라 원본 dict를
               요구해서 별도 인자로 받는다. 빈 리스트를 주면 커버리지 가산(W_THIN, 가중치 1.2로
               가장 큼)이 통째로 빠져 "네 언어권엔 얇게 소개된 곳"이라는 차별화가 사라진다.
        candidates: 점수를 매길 대상. candidates_from_raw(raw)로 만들면 된다.
        user_lang: 정규화 전 원본 언어 코드(예: "ja-JP"). 내부에서 normalize 한다.
        rec_type: "auto"면 소멸위험 구 쿼터가 걸린다 (apply_quota=None일 때).
        apply_quota: 소멸위험 구 쿼터 적용 여부.
             None(기본) → 기존 동작 유지: rec_type == "auto" 일 때만 적용.
             True/False → 호출부에서 명시적으로 강제.
             ★ 신규 인자. 검색처럼 rec_type 이름을 자유롭게 쓰고 싶은 쪽을 위한 명시 스위치.
    """
    lang = tourapi_client.normalize_lang(user_lang)
    if lang == "ko":
        lang = "en"  # 역추천은 외국인 대상 기능. 한국인 유저는 영어권 결과로 미리보기

    # Step 2: 구 단위 방문자 지수 상속
    visit_idx = await _district_visit_index(db)

    # Step 3: 언어권 커버리지 (방향 2) — 실패 시 빈 dict로 진행
    try:
        coverage = await lang_mapping.coverage_by_contentid(raw) if raw else {}
    except Exception:
        coverage = {}

    stamped = _stamped_contentids(db, user_id)
    hidden = _hidden_contentids(db)   # ▸ 추가: 히든은 조우로만 발견 (아래 제외 조건에서 사용)

    scored: list[Candidate] = []
    for c in candidates:
        # ▸ 변경점: 기존 stamped 제외에 hidden 제외를 추가
        if c.contentid in stamped or c.contentid in hidden:
            continue  # 이미 찍은 곳 + 히든 장소 제외
        idx = visit_idx.get(c.sigungu_code or -1, {"foreign": 0.5, "domestic": 0.5})
        c.score += W_FOREIGN * idx["foreign"]
        c.score += W_DOMESTIC * (1.0 - idx["domestic"])
        if idx["foreign"] > 0.6 and idx["domestic"] < 0.4:
            c.reasons.append("visited_by_foreigners_not_locals")
        cov = coverage.get(c.contentid)
        if cov is not None:
            thin = lang_mapping.thinness_score(cov, lang)
            c.score += W_THIN * thin
            if thin >= 0.5:
                c.reasons.append("thin_in_your_language")  # 타 언어권엔 알려진 곳 (핵심 타깃)
            elif thin > 0:
                c.reasons.append("undiscovered")  # 아무 언어권에도 없는 숨은 곳
        if c.sigungu_code in DECLINING_SIGUNGU_CODES:
            c.score += W_DECLINING
            c.reasons.append("hidden_district")
        scored.append(c)

    # Step 4: auto(인트로 팝업)는 소멸위험 구 쿼터 (공모전 취지 최전방 — D5 [B])
    # ▸ 변경점 1: 동점 타이브레이커 추가.
    #   점수 4항목 중 3개(FOREIGN/DOMESTIC/DECLINING)가 구 단위라 같은 구 안에서는
    #   thinness(사실상 3등급)만으로 순위가 갈린다 → 대량 동점 → TourAPI 응답 순서가 곧 순위였다.
    #   (2026-07-13 RECO_SNAPSHOT에서 상위 5건이 전부 점수 1.8 동점으로 나온 원인)
    #   보여줄 이미지가 있는 곳을 앞에 두고(UX), 그래도 같으면 contentid로 확정한다.
    #   ※ 점수에 더하지 않고 정렬 키로만 쓴다 — 가중치 튜닝을 오염시키지 않기 위함.
    # ▸ 변경점 2: 쿼터 판정을 use_quota로 뽑아 apply_quota로 덮어쓸 수 있게 함.
    #   apply_quota가 None이면 기존과 100% 동일하게 rec_type == "auto"로 판정.
    has_image = {
        str(i.get("contentid")): bool(i.get("firstimage") or i.get("firstimage2"))
        for i in raw
    }
    scored.sort(key=lambda c: (-c.score,
                               not has_image.get(c.contentid, bool(c.image)),
                               c.contentid))
    use_quota = (rec_type == "auto") if apply_quota is None else apply_quota
    top = apply_declining_quota(scored, limit) if use_quota else scored[:limit]

    # Step 5: 표시 언어 교체 — 유저 언어권 등록판이 있으면 제목/이미지 스왑 (핵심 UX)
    # 등록부는 24h 캐시 재사용이라 추가 API 콜 없음. 미등록이면 플래그만 (컨셉: "네 언어권엔 미소개")
    if lang in lang_mapping.FOREIGN_LANGS:
        try:
            registry = await lang_mapping.build_lang_registry(lang)
        except Exception:
            registry = []
        for c in top:
            c.ko_title = c.title
            if not registry or c.lat is None or c.lng is None:
                continue  # 판별 불가 → localized는 None 유지
            matched = lang_mapping.match_place(
                {"mapy": c.lat, "mapx": c.lng, "title": c.title}, registry)
            if matched is not None:
                c.title = matched.get("title") or c.title
                c.image = (matched.get("firstimage") or matched.get("firstimage2")
                           or c.image)
                c.localized = True
            else:
                c.localized = False
                # 외국어판 없음 → 제목만 번역 폴백 (키 없으면 국문 유지 + 🔍 뱃지)
                tr = await translator.translate(c.title, lang)
                if tr:
                    c.title = tr

    # D8 [B]: 혼잡 예상 태그 — 관광지 집중률(cnctrRate)을 이름 매칭으로 부가 (실패 시 생략)
    try:
        rate_by_name: dict[str, float] = {}
        for sgg in {c.sigungu_code for c in top if c.sigungu_code}:
            for row in await tourapi_client.concentration_forecast(sgg):
                name, rate = row.get("tAtsNm"), row.get("cnctrRate")
                try:
                    if name and rate is not None:
                        rate_by_name[str(name)] = float(rate)
                except (TypeError, ValueError):
                    continue
        for c in top:
            # 집중률 API는 국문 명칭 기준 → 언어 스왑 전 국문 제목으로 매칭
            rate = rate_by_name.get(c.ko_title or c.title)
            if rate is not None:
                c.congestion = rate
                if rate >= 60:
                    c.reasons.append("crowded_expected")
    except Exception:
        pass

    return [c.to_dict() for c in top]


# ══════════════════════════════════════════════════════════════════════
# [3/3] 공개 엔트리포인트 — 기존과 시그니처·동작 동일
#   /api/recommendations 라우터는 이 함수만 계속 호출하면 된다. 라우터 수정 불필요.
# ══════════════════════════════════════════════════════════════════════

async def recommend(db: Session, user_lang: str, rec_type: str = "auto",
                    lat: float | None = None, lng: float | None = None,
                    user_id: int | None = None, limit: int = 10) -> list[dict]:
    """역추천 전체 파이프라인 = 후보 수집(Step 1) + 점수 매기기(Step 2~5).

    ▸ 변경점: 본문이 두 함수 호출로 축소됐을 뿐, 입출력 계약은 이전과 같다.
    """
    raw, candidates = await collect_candidates(rec_type, lat, lng)
    return await score_and_rank(
        db, raw, candidates, user_lang,
        rec_type=rec_type, user_id=user_id, limit=limit,
    )