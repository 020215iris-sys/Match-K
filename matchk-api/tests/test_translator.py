"""번역 유틸 테스트 — 키 미설정 시 graceful 폴백(원문 유지) 보장."""
import asyncio

from app.services import translator


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
