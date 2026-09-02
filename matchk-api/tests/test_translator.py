"""번역 유틸 테스트 — 키 미설정 시 graceful 폴백(원문 유지) 보장."""
import asyncio

import pytest

from app.core.cache import long_cache
from app.services import translator


@pytest.fixture(autouse=True)
def _no_real_papago_call(monkeypatch):
    """로컬 .env엔 실제 Papago 키가 들어있어서, 패치 없이 그냥 돌리면 이 테스트들이
    진짜 API를 호출해 과금이 발생한다(2026-09-02 발견). 테스트 중엔 키를 강제로 비워
    '키 없음' graceful 경로를 타게 하고, 이전 실행에서 남은 실제 번역 결과 캐시도 지운다
    (안 지우면 캐시 히트로 실제 번역문이 그대로 반환돼 키를 비워도 테스트가 깨짐)."""
    monkeypatch.setattr(translator.settings, "PAPAGO_CLIENT_ID", "")
    monkeypatch.setattr(translator.settings, "PAPAGO_CLIENT_SECRET", "")
    long_cache.clear()
    yield


def test_translate_no_key_returns_none():
    # PAPAGO 키 미설정(테스트 환경) → None = '번역 못 함, 원문 써라'
    result = asyncio.run(translator.translate("동백섬", "en"))
    assert result is None


def test_translate_korean_target_none():
    # 한국어는 번역 대상 아님
    assert asyncio.run(translator.translate("동백섬", "ko")) is None


def test_translate_empty_none():
    assert asyncio.run(translator.translate("", "en")) is None
    assert asyncio.run(translator.translate(None, "en")) is None


def test_translate_fields_keeps_original_without_key():
    fields = {"title": "깡깡이 마을", "overview": "설명", "addr1": "부산"}
    out, did = asyncio.run(translator.translate_fields(fields, ("title", "overview"), "en"))
    assert did is False           # 키 없으니 번역 안 됨
    assert out["title"] == "깡깡이 마을"  # 원문 유지
