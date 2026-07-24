# matchk-api

Mātch K 백엔드 (FastAPI). 담당: B (+ C의 서비스 레이어).

## 실행

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows / macOS는 source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # TOURAPI_KEY 등 채우기
uvicorn app.main:app --reload  # http://localhost:8000/docs
```

## 시드 (D2 [C])

```bash
python -m app.scripts.seed_landmarks
```

- 부산 16개 구·군 + 랜드마크 참조 500건+ 수집 (TourAPI 실시간 호출)
- ⚠️ 콘텐츠는 저장하지 않음 — `app/models/landmark.py`의 심사 정책 주석 참조

## 마이그레이션 (D2 [B])

개발 중에는 `main.py`의 `create_all`이 테이블을 만들어줌. 스키마 변경 시:

```bash
alembic revision --autogenerate -m "설명"
alembic upgrade head
```

## 테스트

```bash
pytest
```

## Railway 배포 (D1 [B])

- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- 환경변수: `.env.example`의 키들을 Railway 대시보드에 등록 (실 키 커밋 금지 — 부록 C)
- PostgreSQL 플러그인 추가 후 `DATABASE_URL` 교체

## 구조

| 경로 | 역할 | 지시서 티켓 |
|---|---|---|
| `app/core/` | 설정, DB, JWT, 차등 TTL 캐시 | D1~D2 [B] |
| `app/models/` | users, landmarks(참조만), stamps, 트리(country→region→district) | D2 [B] |
| `app/routers/` | auth, landmarks, stamps, recommendations, search, users | D3~D7 [B] |
| `app/services/tourapi_client.py` | TourAPI 클라이언트 (언어권별 서비스 스위칭) | D3 [C] |
| `app/services/recommender.py` | 역추천 4단계 파이프라인 v1+v2 | D4·D6 [C] |
| `app/services/lang_mapping.py` | 언어 간 contentid 크로스 매핑 | D6 [C] |
| `app/scripts/seed_landmarks.py` | 참조 시드/일 1회 동기화 | D2 [C] |

## 팀이 채워야 할 TODO

1. `.env`에 `TOURAPI_KEY` (개발계정 키) — **운영계정 승인도 D1에 신청**
2. `tourapi_client.py`의 서비스/오퍼레이션 명칭을 API 문서와 대조 (`SERVICE_BY_LANG`, `RELATED_SERVICE`, `DATALAB_SERVICE`)
3. `recommender.py`의 `_district_visit_index` — 방문자수 API 실제 응답 필드로 파싱 조정
4. 시군구 코드 검증 (seed 스크립트 주석 참조, D2 DoD)
5. Google Cloud Console에서 OAuth 클라이언트 발급 → `.env`
