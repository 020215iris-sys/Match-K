"""pytest 전역 설정 — 앱 모듈 import 전에 환경변수 주입 (get_settings가 lru_cache라 순서 중요)."""
import os

os.environ["DATABASE_URL"] = "sqlite://"  # in-memory
os.environ["DEMO_MODE"] = "true"
os.environ["TOURAPI_KEY"] = "test-key"
