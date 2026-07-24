from app.services.geo_utils import haversine_m


def test_haversine_known_distance():
    # 부산역(35.1151, 129.0403) ↔ 해운대해수욕장(35.1587, 129.1604) ≈ 11.9km
    d = haversine_m(35.1151, 129.0403, 35.1587, 129.1604)
    assert 11000 < d < 13000


def test_haversine_zero():
    assert haversine_m(35.1, 129.0, 35.1, 129.0) == 0.0


def test_haversine_within_stamp_radius():
    # 약 50m 떨어진 두 점 — 도장 반경(100m) 이내여야 함
    d = haversine_m(35.10000, 129.00000, 35.10045, 129.00000)
    assert d < 100
