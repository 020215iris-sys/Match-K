"""앱 전역 설정. 모든 인증키는 환경변수로만 주입한다 (부록 C)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "sqlite:///./matchk.db"
    TOURAPI_KEY: str = ""
    JWT_SECRET: str = "dev-secret-change-me"
    JWT_EXPIRE_MINUTES: int = 43200
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"

    # Papago 번역 (네이버클라우드) — 외국어판 없는 곳의 폴백 번역. 미설정 시 번역 스킵.
    PAPAGO_CLIENT_ID: str = ""
    PAPAGO_CLIENT_SECRET: str = ""

    # 시연 모드 (D4 [B]): true면 요청 body의 mock 좌표 허용. 발표 시 투명하게 공개.
    DEMO_MODE: bool = False
    GPS_RADIUS_M: int = 100

    # 히든 미션 발동 조건 (⚠️ 임시값 — 다음 주 팀 회의로 조정). 둘 다 충족해야 잠금 해제.
    HIDDEN_MAP_THRESHOLD: float = 0.20    # 업적지도 색칠 비율 20% 이상
    HIDDEN_STAMP_THRESHOLD: float = 0.30  # 일반 도장 수집 비율 30% 이상

    # TourAPI 지역 코드
    BUSAN_AREA_CODE: int = 6

    # 캐시 TTL 차등 (계획서 §4): 일반 5분 / 고비용 연산 24시간
    CACHE_TTL_SHORT: int = 300
    CACHE_TTL_LONG: int = 86400


@lru_cache
def get_settings() -> Settings:
    return Settings()


# 소멸위험 구 — 행정안전부 공식 지정 '인구감소지역'(전국 89곳) 중 부산 3곳.
# 근거: 동구·서구·영도구가 부산에서 유일하게 인구감소지역으로 고시됨(연 1조원 지원 대상).
#       특히 영도구는 소멸위험지수 0.256으로 전국 광역시 자치구 중 소멸위험 1위.
# → 임의 선정이 아니라 정부 고시 기준. 심사·제안서에서 이 근거 명시.
# TourAPI sigunguCode: 동구=5, 서구=11, 영도구=14 (2026-07-13 areaCode2 실호출 검증)
DECLINING_SIGUNGU_CODES = {5, 11, 14}

# 빅데이터 계열(방문자수/연관/집중률)은 TourAPI 시군구코드가 아니라 **법정동 코드** 사용
# (2차 실사 단서: detailCommon2의 lDongRegnCd/lDongSignguCd 필드) — 부산 광역 = 26
BUSAN_LDONG_AREA_CD = 26
# TourAPI sigunguCode(1~16) → 법정동 시군구코드
SIGUNGU_TO_LDONG = {
    1: 26440,   # 강서구
    2: 26410,   # 금정구
    3: 26710,   # 기장군
    4: 26290,   # 남구
    5: 26170,   # 동구
    6: 26260,   # 동래구
    7: 26230,   # 부산진구
    8: 26320,   # 북구
    9: 26530,   # 사상구
    10: 26380,  # 사하구
    11: 26140,  # 서구
    12: 26500,  # 수영구
    13: 26470,  # 연제구
    14: 26200,  # 영도구
    15: 26110,  # 중구
    16: 26350,  # 해운대구
}
LDONG_TO_SIGUNGU = {v: k for k, v in SIGUNGU_TO_LDONG.items()}
