# Mātch K — 모노 워크스페이스

> 한국관광공사 2026 관광데이터 활용 공모전 출품작
> 부산 인바운드 외국인 대상: 업적(도장) 시스템 + 언어권별 역추천

| 폴더 | 내용 | 담당 |
|---|---|---|
| `matchk-api/` | FastAPI 백엔드 (각 폴더 README 참조) | B, C |
| `matchk-app/` | Expo RN 앱 | A |

> GitHub에는 지시서대로 리포 2개(`matchk-app`, `matchk-api`)로 분리 push 권장 —
> 이 폴더는 로컬 작업용 워크스페이스.

## 빠른 시작 (백엔드 → 앱 순서)

```bash
# 1) 백엔드
cd matchk-api
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # TOURAPI_KEY 입력
uvicorn app.main:app --reload   # http://localhost:8000/docs

# 2) 시드 (D2) — TourAPI 키 필요
python -m app.scripts.seed_landmarks

# 3) 앱
cd ../matchk-app
npm install && npx expo install --fix
copy .env.example .env
npx expo start
```

## 이 스캐폴딩이 커버한 지시서 티켓

- **D1**: 백/프론트 스캐폴딩, .env.example, 폴더 구조 ✅ (Railway/GitHub/Notion 계정 작업은 팀 수행)
- **D2**: DB 스키마(참조 정책+unique 제약), districts 16개 시드, 인증 흐름(Google+게스트), i18n 4개 언어, 참조 로더 ✅
- **D3**: 랜드마크 프록시 3종, TourAPI 클라이언트(TTL 차등), 홈 UI ✅
- **D4**: 도장 API(haversine+시연 모드), 업적지도 WebView 뼈대, 역추천 v1 ✅
- **D5**: 역추천 엔드포인트(lang 파라미터+소멸위험 구 필터), 인트로 팝업, 연관 관광지 ✅
- **D6**: 검색 API+화면(디바운싱), 색칠 로직, v2 언어 매핑+커버리지 스코어 ✅
- **D7~D8**: 스케줄러/상세/프로필 화면, 프로필 API, 캐시 히트율 측정 ✅ (뼈대 수준)

## 사람이 해야 하는 것 (코드로 대체 불가)

1. **TourAPI 키 발급 + 운영계정 신청** (D1 [C]) → `matchk-api/.env`
2. **다국어 API 5종 + 데이터랩 API 승인 신청** — 승인 후 `tourapi_client.py` 상수 3개 검증
3. **Kakao JS 키 + 웹 도메인 등록** → `matchk-app/.env`
4. **Google Cloud OAuth 클라이언트** (D2 [B]) → `matchk-api/.env`
5. **부산 구·군 GeoJSON 16개** (D3 [D]) → `matchk-app/assets/busanDistricts.geojson.json`
6. Railway 배포, GitHub 리포 2개 생성, Figma 시안 (D1)

## 시연 모드 (부산 외 지역 발표 대비)

- 백엔드 `.env`: `DEMO_MODE=true`
- 앱 `.env`: `EXPO_PUBLIC_DEMO_STAMP=true`
- → GPS 반경 검증 없이 도장 시연 가능. 심사 질문 시 투명하게 설명 (계획서 리스크 표)

> 팀원 온보딩: **TEAM_SETUP.md** 참조 (Docker/Git/환경변수). GitHub 리포 생성 후 `setup_git.bat <조직명>` 실행.
