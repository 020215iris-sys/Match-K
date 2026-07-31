# Mātch K

> 한국관광공사 2026 관광데이터 활용 공모전 · 웹·앱 개발 부문 출품작
> 부산 인바운드 외국인을 위한 **관광 추천 + 도장(업적) 앱**

---

## 우리가 만드는 것

부산을 여행하는 외국인에게, **"당신 언어권엔 아직 안 알려진 부산의 로컬 스팟"**을 추천하고,
그곳을 직접 방문해 도장을 모으는 게임형 여행 앱.

두 가지 핵심:

- **언어권별 역추천** — 국문 관광정보는 많지만 외국어(영·일·중)는 적다는 실제 데이터 격차를 신호로, "내 언어권엔 소개 안 된 숨은 곳"을 골라 추천.
- **소멸위험 지역 재발견** — 행정안전부 지정 인구감소지역(부산 동구·서구·영도구)을 도장·히든 미션으로 방문 유도. (사용자에겐 "로컬만 아는 곳"으로 표현 — 부정적 표현은 쓰지 않음)

두 축을 잇는 얼굴이 **마스코트** — 홈·업적지도·스케줄러를 돌아다니며 추천 장소와 도전과제를 안내.

## 주요 기능

| 기능 | 설명 |
|---|---|
| 홈 추천 + 마스코트 | 역추천 결과를 카드 + 마스코트 말풍선으로 |
| 업적지도 | 이미지 기반 3페이지(전체지도→구지도→구 상세). 구 상세에서 GPS로 도장, 방문 비율만큼 색칠 |
| 히든 미션 | 구별 도장 비율 달성 시, 소멸위험 구의 숨은 장소가 팝업으로 등장 → 리스트 최상단 고정 |
| 스케줄러 | 여행 일정(일정명·기간) 만들고 장소를 일차별로 담기 (드래그앤드랍) |
| 검색·상세 | TourAPI 실시간 검색, 외국어판 없으면 자동 번역 |
| 다국어 | ko / en / ja / zh 자동 감지 + 수동 전환 |

> 각 화면의 상세 설계·흐름도·작업순서는 **[DESIGN.md](DESIGN.md)** 참고.

## 기술 스택

- **백엔드** `matchk-api` — FastAPI (Python 3.10), SQLAlchemy, SQLite(개발)→PostgreSQL(배포)
- **프론트** `matchk-app` — Expo (React Native), i18next, zustand
- **인프라** — Railway(배포), GitHub Actions(CI), Papago(번역), TourAPI(관광 데이터)

## 저장소 구조 (monorepo)

```
Match_K/
├─ matchk-api/     # 백엔드
├─ matchk-app/     # 앱
├─ .github/        # CI (test / typecheck 자동 실행)
├─ README.md       # 이 문서
├─ DESIGN.md       # 화면·흐름 상세 설계 (홈/스케줄러/업적지도)
├─ HANDOFF.md      # 프로젝트 개요·현황·개발 방향 (온보딩)
├─ TEAM_SETUP.md   # 환경 세팅·협업 규칙
└─ PRIVACY_POLICY.md
```

## 빠른 시작

```bash
# 1) 백엔드
cd matchk-api
python -m venv .venv
.venv\Scripts\Activate.ps1          # PowerShell (mac/linux는 source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env               # TOURAPI_KEY 입력
python -m app.scripts.seed_landmarks # 랜드마크 시드 (TourAPI 키 필요)
python -m app.scripts.mark_hidden    # 히든 장소 지정
uvicorn app.main:app --reload --host 0.0.0.0

# 2) 앱 (새 터미널)
cd matchk-app
npm install
copy .env.example .env               # EXPO_PUBLIC_API_URL을 내 PC LAN IP로
npx expo start                       # 폰 Expo Go로 QR 스캔
```

> 처음이면 **TEAM_SETUP.md**를 먼저 읽으세요 — Node 버전, 방화벽, IP 설정 등 자주 걸리는 함정 정리돼 있습니다.

## 역할 분담

| 담당 | 영역 |
|---|---|
| 새봄 | 역추천 엔진 (`recommender.py`, `lang_mapping.py`) |
| 현표 | 업적·도장·마스코트 (`stamps.py`, `hidden.py`, 업적지도) |
| 지현 | 상세·검색·번역 (`landmarks.py`, `search.py`, `translator.py`) |
| 다은 | 스케줄러 + 깃대장 (`SchedulerScreen`, 지도) |
| 정현 | 인증·언어 + 배포·대표 (`auth.py`, `ProfileScreen`) |

## 협업 규칙 (요약)

- main 직접 push 금지 → feature 브랜치 → PR → CI 초록불 + 리뷰 1명 → 머지
- 자기 영역 파일만 수정, 공용 파일(models·endpoints·config)은 단독 PR로 먼저
- 커밋: `feat:` `fix:` `docs:` `refactor:` + 한글 한 줄
- 매일 아침 `git pull origin main`

자세한 내용은 **TEAM_SETUP.md** 참고.

## 일정

- 개발 목표: **8월 말** / 서류 제출 마감: **9/21** / 최종 발표: **10/28**
- 앱 스토어(원스토어) 출시 필수 — 심사 기간 고려해 역산
