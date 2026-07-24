"""번역 유틸 (공용) — 국문 콘텐츠를 사용자 언어로 채우는 폴백.

설계 (지현 [검색·번역] 담당 공용 모듈):
- 외국어 관광정보가 '있으면' 그걸 우선 사용(lang_mapping). 여기 번역기는 '없을 때'만 호출.
- 키가 아직 없으면 graceful 폴백: None 반환 → 호출부가 국문 원문 유지 + '미번역' 표시.
- 실호출은 24h 캐시 (심사 트래픽 보호, 요금 절감). 키는 서버 환경변수에만 존재 (앱 노출 금지).

프로바이더는 교체 가능하게 분리 — 현재 Papago 스텁. 키 발급 후 _papago_translate만 채우면 됨.
"""
import hashlib

import httpx

from app.core.cache import cache_get, cache_set, long_cache
from app.core.config import get_settings

settings = get_settings()

# Papago NMT (ko -> en/ja/zh). 언어 코드 매핑 (Papago는 zh-CN 사용).
_PAPAGO_TARGET = {"en": "en", "ja": "ja", "zh": "zh-CN"}
_PAPAGO_URL = "https://papago.apigw.ntruss.com/nmt/v1/translation"


def _cache_key(text: str, target: str) -> str:
    h = hashlib.sha1(f"{target}:{text}".encode("utf-8")).hexdigest()[:16]
    return f"tr:{target}:{h}"


async def _papago_translate(text: str, target: str) -> str | None:
    """실제 Papago 호출. 키 미설정 시 None (graceful)."""
    cid = getattr(settings, "PAPAGO_CLIENT_ID", "")
    secret = getattr(settings, "PAPAGO_CLIENT_SECRET", "")
    if not cid or not secret:
        return None  # 키 없음 → 번역 스킵 (호출부가 원문 유지)
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
