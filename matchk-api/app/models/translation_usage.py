"""Papago 번역 월별 사용량 카운터 — NCP 과금 폭탄 방지용 코드 레벨 상한 (2026-09-02).

NCP 요금표 확인 결과 Papago Text Translation API는 100만 글자 단위로 20,000원씩
계단식 과금(1글자만 써도 100만자 구간 전체 요금 발생). translator.py가 실제로
Papago를 호출하기 전에 이번 달(KST 기준) 누적 글자수를 이 테이블에서 확인하고,
설정된 상한(config.PAPAGO_MONTHLY_CHAR_CAP)을 넘으면 호출 자체를 건너뛴다.

DB에 저장하므로 서버 재시작/재배포해도 카운터가 리셋되지 않는다 — in-memory인
cache.py의 24h 캐시(app/core/cache.py)와 다른 점. 그 캐시는 "같은 문장 재요청"을
막아주고, 이 카운터는 "이번 달 총 얼마나 썼는지"를 막아준다.
"""
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TranslationUsage(Base):
    __tablename__ = "translation_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7), unique=True)  # "2026-09" (KST 기준)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
