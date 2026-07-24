from app.core.config import DECLINING_SIGUNGU_CODES
from app.services.lang_mapping import thinness_score
from app.services.recommender import Candidate, apply_declining_quota


def test_thinness_score_boosts_unregistered_lang():
    # 일본어권 유저: 일문 미등록 + 영/중 등록 → 강한 가산
    cov = {"en": True, "ja": False, "zh": True}
    assert thinness_score(cov, "ja") > 0.5


def test_thinness_score_penalizes_registered_lang():
    # 이미 자기 언어권에 소개된 곳 → 감산
    cov = {"en": True, "ja": True, "zh": False}
    assert thinness_score(cov, "ja") < 0


def test_thinness_score_zero_hit_is_low_priority():
    # 아무 외국어에도 미등록 → 소폭 가산만 (동점 1위 문제 방지, 스냅샷 튜닝)
    none_hit = thinness_score({"en": False, "ja": False, "zh": False}, "ja")
    one_hit = thinness_score({"en": True, "ja": False, "zh": False}, "ja")
    assert 0 < none_hit < 0.5
    assert one_hit > none_hit


def test_candidate_to_dict():
    c = Candidate("12345", "깡깡이 마을", "http://img", 14, 35.09, 129.03)
    c.score = 1.234567
    c.reasons.append("hidden_district")
    d = c.to_dict()
    assert d["contentid"] == "12345"
    assert d["score"] == 1.235
    assert "hidden_district" in d["reasons"]
    assert d["availableInYourLanguage"] is None  # 스왑 전 기본값


def _mk(cid: str, sigungu: int, score: float) -> Candidate:
    c = Candidate(cid, cid, "", sigungu, 35.1, 129.0)
    c.score = score
    return c


def test_declining_quota_guarantees_minimum():
    declining_code = next(iter(DECLINING_SIGUNGU_CODES))
    other_code = next(c for c in range(1, 30) if c not in DECLINING_SIGUNGU_CODES)
    # 소멸위험 구 5개(저점) + 타 구 10개(고점), limit=10, 쿼터 0.6
    scored = ([_mk(f"o{i}", other_code, 10 - i * 0.1) for i in range(10)]
              + [_mk(f"d{i}", declining_code, 1 - i * 0.1) for i in range(5)])
    scored.sort(key=lambda c: c.score, reverse=True)
    top = apply_declining_quota(scored, limit=10)
    n_declining = sum(1 for c in top if c.sigungu_code in DECLINING_SIGUNGU_CODES)
    assert len(top) == 10
    assert n_declining == 5  # 쿼터 6이지만 후보가 5개뿐 → 전부 포함 (하드필터와 달리 나머지 채움)


def test_declining_quota_fills_rest_by_score():
    declining_code = next(iter(DECLINING_SIGUNGU_CODES))
    other_code = next(c for c in range(1, 30) if c not in DECLINING_SIGUNGU_CODES)
    scored = ([_mk(f"d{i}", declining_code, 5 - i * 0.1) for i in range(10)]
              + [_mk(f"o{i}", other_code, 9 - i * 0.1) for i in range(10)])
    scored.sort(key=lambda c: c.score, reverse=True)
    top = apply_declining_quota(scored, limit=10)
    n_declining = sum(1 for c in top if c.sigungu_code in DECLINING_SIGUNGU_CODES)
    assert len(top) == 10
    assert n_declining == 6   # ceil(10 * 0.6) — 소멸위험 구 최소 보장
    assert sum(1 for c in top if c.sigungu_code == other_code) == 4  # 나머지는 고점 타 구
