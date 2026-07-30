# matchk-api

Mātch K 백엔드 (FastAPI). 담당: 새봄(역추천)·현표(도장/히든)·지현(상세/검색/번역)·정현(인증).

## 실행 (Docker 불필요 — 개발은 SQLite)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1        # mac/linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # TOURAPI_KEY 등 입력 (실 키 커밋 금지)
python -m app.scripts.seed_landmarks   # 랜드마크 시드 (TourAPI 키 필요)
python -m app.scripts.mark_hidden      # 히든 장소 지정 (소멸위험 구 + 외국어 미등록)
uvicorn app.main:app --reload --host 0.0.0.0   # http://localhost:8000/docs
```

- `--host 0.0.0.0` = 폰에서 붙을 수 있게 (기본값은 폰이 못 붙음)
- 콘텐츠는 DB에 저장하지 않음(실시간 호출) — `app/models/landmark.py` 심사 정책 주석 참조
- 모델(스키마) 바뀌면 DB 재생성: `del matchk.db` 후 seed + mark_hidden 다시

## 테스트

```bash
pytest
```

## Railway 배포

- Railway가 리포의 `Dockerfile`을 자동 인식 → 개발자가 Docker 직접 쓸 일 없음
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- 환경변수: `.env.example`의 키들을 Railway 대시보드에 등록
- PostgreSQL 플러그인 추가 후 `DATABASE_URL`이 자동 주입됨

## 구조

| 경로 | 역할 | 담당 |
|---|---|---|
| `app/core/` | 설정, DB, JWT, TTL 캐시, 소멸위험 구 코드 | 공용 |
| `app/models/` | users, landmarks(참조만), stamps(is_hidden 포함) | 공용 |
| `app/routers/recommendations.py` | 역추천 API | 새봄 |
| `app/routers/stamps.py`, `hidden.py` | 도장·히든 미션 | 현표 |
| `app/routers/landmarks.py`, `search.py` | 상세·검색 | 지현 |
| `app/routers/auth.py`, `users.py` | 인증·프로필·회원탈퇴 | 정현 |
| `app/services/recommender.py` | 역추천 4단계 파이프라인 | 새봄 |
| `app/services/lang_mapping.py` | 언어 간 contentid 매핑 | 새봄 |
| `app/services/translator.py` | Papago 번역 폴백 (공용 유틸) | 지현 |
| `app/services/tourapi_client.py` | TourAPI 클라이언트 | 공용 |

## 남은 TODO

1. `.env` `TOURAPI_KEY` + **운영계정 승인 신청** (심사가 호출이력 검증 — 전원)
2. `PAPAGO_CLIENT_ID/SECRET` 발급 → 번역 작동 (지현)
3. Google OAuth 클라이언트 발급 → `.env` (정현)
4. 히든 발동 비율(`HIDDEN_MAP_THRESHOLD`/`STAMP_THRESHOLD`)·가중치 튜닝 (새봄, 회의)
