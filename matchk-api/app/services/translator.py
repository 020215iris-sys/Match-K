"""번역 유틸 (공용) — 국문 콘텐츠를 사용자 언어로 채우는 폴백.

설계 (지현 [검색·번역] 담당 공용 모듈):
- 외국어 관광정보가 '있으면' 그걸 우선 사용(lang_mapping). 여기 번역기는 '없을 때'만 호출.
- 키가 아직 없으면 graceful 폴백: None 반환 → 호출부가 국문 원문 유지 + '미번역' 표시.
- 실호출은 24h 캐시 (심사 트래픽 보호, 요금 절감). 키는 서버 환경변수에만 존재 (앱 노출 금지).
- 월별 과금 상한 (2026-09-02 추가, Papago 청구 폭탄 후속조치): NCP 요금표 확인 결과
  Text Translation API는 100만 글자당 20,000원 계단식 과금. translation_usage 테이블에
  이번 달(KST 기준) 누적 글자수를 기록해두고, 상한(PAPAGO_MONTHLY_CHAR_CAP) 초과 시
  Papago 호출 자체를 건너뛴다 — 키 없을 때와 동일하게 원문 유지로 graceful 폴백.
  이 카운터는 DB 저장이라 서버 재시작/재배포해도 리셋 안 됨 (in-memory인 24h 캐시와
  다른 점 — 그 캐시가 24h TTL이 아니라 '재시작 때마다 사라지는' 게 실제 과금 원인이었음).

프로바이더는 교체 가능하게 분리 — 현재 Papago 스텁. 키 발급 후 _papago_translate만 채우면 됨.
"""
import hashlib
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.core.cache import cache_get, cache_set, long_cache
from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.translation_usage import TranslationUsage

settings = get_settings()
_KST = ZoneInfo("Asia/Seoul")  # 배포 서버 시간대와 무관하게 한국 기준 '이번 달'로 고정

# Papago NMT (ko -> en/ja/zh). 언어 코드 매핑 (Papago는 zh-CN 사용).
_PAPAGO_TARGET = {"en": "en", "ja": "ja", "zh": "zh-CN"}
_PAPAGO_URL = "https://papago.apigw.ntruss.com/nmt/v1/translation"


def _cache_key(text: str, target: str) -> str:
    h = hashlib.sha1(f"{target}:{text}".encode("utf-8")).hexdigest()[:16]
    return f"tr:{target}:{h}"


def _reserve_usage(char_len: int) -> bool:
    """이번 달 누적 글자수 + char_len이 상한을 넘는지 확인. 안 넘으면 카운터에 반영하고
    True, 넘으면(또는 확인 자체가 실패하면) False — 호출부가 안전하게 이번 호출을 스킵함."""
    cap = settings.PAPAGO_MONTHLY_CHAR_CAP
    month = datetime.now(_KST).strftime("%Y-%m")
    db = SessionLocal()
    try:
        row = db.query(TranslationUsage).filter(TranslationUsage.month == month).first()
        used = row.char_count if row else 0
        if used + char_len > cap:
            return False  # 이번 달 상한 초과 → 과금 폭탄 방지, 호출 스킵
        if row:
            row.char_count = used + char_len
        else:
            row = TranslationUsage(month=month, char_count=char_len)
            db.add(row)
        db.commit()
        return True
    except Exception:
        db.rollback()
        return False  # 확인 자체가 실패해도 안전하게 스킵(원문 유지) — 과금 쪽으로 열어두지 않음
    finally:
        db.close()


async def _papago_translate(text: str, target: str) -> str | None:
    """실제 Papago 호출. 키 미설정/월 상한 초과 시 None (graceful)."""
    cid = getattr(settings, "PAPAGO_CLIENT_ID", "")
    secret = getattr(settings, "PAPAGO_CLIENT_SECRET", "")
    if not cid or not secret:
        return None  # 키 없음 → 번역 스킵 (호출부가 원문 유지)
    if not _reserve_usage(len(text)):
        return None  # 이번 달 상한 초과 → 번역 스킵 (원문 유지, NCP 과금 폭탄 방지)
    headers = {
        "X-NCP-APIGW-API-KEY-ID": cid,
        "X-NCP-APIGW-API-KEY": secret,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {"source": "ko", "target": target, "text": text}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(_PAPAGO_URL, headers=headers, data=data)
            resp.raise_for_status()
            return resp.json()["message"]["result"]["translatedText"]
    except Exception:
        return None  # 장애 시에도 원문 유지 (앱은 안 죽음)


async def translate(text: str | None, target_lang: str) -> str | None:
    """국문 text를 target_lang(en/ja/zh)으로. 실패/무키/한국어면 None.

    반환 None의 의미 = '번역 못 함, 원문 그대로 써라' (호출부에서 판단).
    """
    if not text or target_lang not in _PAPAGO_TARGET:
        return None
    key = _cache_key(text, target_lang)
    cached = cache_get(long_cache, key)
    if cached is not None:
        return cached or None  # 빈 문자열 캐시는 '번역 불가'로 취급
    result = await _papago_translate(text, _PAPAGO_TARGET[target_lang])
    cache_set(long_cache, key, result or "")
    return result


async def translate_fields(fields: dict[str, str], keys: tuple[str, ...],
                           target_lang: str) -> tuple[dict[str, str], bool]:
    """dict의 지정 키들을 번역해 새 dict 반환. (결과, 하나라도 번역됐는지)."""
    out = dict(fields)
    did = False
    for k in keys:
        if fields.get(k):
            tr = await translate(fields[k], target_lang)
            if tr:
                out[k] = tr
                did = True
    return out, did
