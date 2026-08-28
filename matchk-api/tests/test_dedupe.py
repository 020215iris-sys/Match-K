"""_dedupe_same_place 계약 테스트 — 2026-08-26 실측 판단을 고정한다.

후보 140건 중 150m 이내 12쌍을 전수 확인한 결과, 실제 중복은 '황령산 / 황령산 전망대'
(0m, 좌표 동일) 하나뿐이었다. 나머지 11쌍은 가까워도 별개 장소다.
규칙을 넓히면(예: 공백 제거 후 공통 부분문자열 5자 기준) 23m 떨어진
'부산 영화의 전당 / 영화의전당 라이브러리 자료실'이 잘못 지워진다 — 이 둘은 별개 장소다.
"""
from app.services import recommender


def _c(cid: str, title: str, lat: float, lng: float, score: float) -> recommender.Candidate:
    return recommender.Candidate(cid, title, "", 4, lat, lng, score)


def test_dedupe_removes_same_place():
    """황령산 / 황령산 전망대 — 좌표 0m + 제목 포함관계 → 상위 1건만 남는다."""
    kept = recommender._dedupe_same_place([
        _c("1", "황령산", 35.1000, 129.1000, 2.608),
        _c("2", "황령산 전망대", 35.1000, 129.1000, 2.608),
    ])
    assert [c.contentid for c in kept] == ["1"]


def test_dedupe_keeps_close_but_different_places():
    """부산 영화의 전당 / 영화의전당 라이브러리 자료실 — 23m지만 별개 장소.
    띄어쓰기 때문에 부분 문자열 관계가 성립하지 않아 그대로 남는다(의도된 동작)."""
    kept = recommender._dedupe_same_place([
        _c("1", "부산 영화의 전당", 35.1710, 129.1290, 2.2),
        _c("2", "영화의전당 라이브러리 자료실", 35.1712, 129.1291, 2.2),
    ])
    assert len(kept) == 2


def test_dedupe_keeps_far_pairs_with_shared_name():
    """금정산 / 금정산성 동문 — 제목은 포함관계지만 2km 넘게 떨어진 별개 장소."""
    kept = recommender._dedupe_same_place([
        _c("1", "금정산", 35.2500, 129.0500, 1.5),
        _c("2", "금정산성 동문", 35.2600, 129.0700, 1.4),
    ])
    assert len(kept) == 2