# Mātch K 팀 개발환경 세팅 가이드

> 전원 D1에 완료 목표. 순서대로 따라 하면 됨.

---

## 1. 공통 준비물

| 도구 | 버전 | 용도 | 확인 명령 |
|---|---|---|---|
| Git | 최신 | 버전 관리 | `git --version` |
| Node.js | **20 LTS** | Expo 앱 (18 미만이면 빌드 실패) | `node --version` |
| Python | **3.10** | 백엔드 (CI·Docker 모두 3.10 고정) | `python --version` |

> Docker는 **불필요** — 이 프로젝트는 로컬 SQLite로 그냥 돌아감. (Docker/PostgreSQL은 배포 때만)

## 2. Git 세팅 (monorepo — 리포 1개)

1. 각자 1회: `git config --global user.name "이름"` / `git config --global user.email "이메일"`
2. 리포 클론: `git clone https://github.com/020215iris-sys/Match-K.git`
3. `matchk-api`(백엔드) + `matchk-app`(앱)이 한 리포 안에 있음

**규칙**

- main 직접 push 금지 → feature 브랜치 → PR → CI 초록불 + 리뷰 1명 → 머지
- 커밋 컨벤션: `feat:` `fix:` `chore:` `docs:` `refactor:` + 한글 한 줄
- PR 제목: `[담당자] 화면/기능 요약`
- 라인엔딩은 `.gitattributes`가 LF로 강제 (Windows CRLF 섞임 방지) — 건드리지 말 것

## 3. 백엔드 실행 (venv + uvicorn — Docker 불필요)

> 이 프로젝트는 개발 시 로컬 SQLite를 써서 **Docker/PostgreSQL 설치가 필요 없음.**
> (Docker·PostgreSQL은 나중에 Railway 배포할 때만 사용)

```powershell
cd matchk-api
python -m venv .venv
.venv\Scripts\Activate.ps1        # mac/linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # TOURAPI_KEY 입력 (실 키 커밋 절대 금지)
python -m app.scripts.seed_landmarks   # 랜드마크 시드 (TourAPI 키 필요)
python -m app.scripts.mark_hidden      # 히든 장소 지정
uvicorn app.main:app --reload --host 0.0.0.0   # http://localhost:8000/docs
```

- 확인: http://localhost:8000/docs (API 문서) / http://localhost:8000/health
- 코드 수정은 `--reload`로 즉시 반영됨
- `--host 0.0.0.0` = 폰에서 붙을 수 있게 (기본값 127.0.0.1은 폰이 못 붙음)

## 4. 프론트 — Expo

Expo는 실기기/시뮬레이터와 직접 통신해야 해서 Docker에 넣지 않는다 (호스트에서 실행).

```bash
cd matchk-app
npm install
npx expo install --fix   # SDK 버전 정합 (최초 1회)
copy .env.example .env    # EXPO_PUBLIC_API_URL 등
npx expo start
```

- **실기기 테스트 시** `.env`의 `EXPO_PUBLIC_API_URL`을 `http://<내 PC LAN IP>:8000`으로 (localhost는 기기에서 안 잡힘)
- Google 로그인/SecureStore는 Expo Go 제약 → `npx expo run:android` 또는 EAS dev build

## 4-1. ⚠️ 자주 걸리는 환경 함정 (실제 겪은 것들 — 먼저 읽기)

세팅 중 여기서 대부분 막힘. 순서대로 확인:

- **Node 버전**: Expo SDK 54는 **Node 18+ 필수**. 낮으면 `expo install --fix`가 `??=` 문법 에러로 죽음. `node -v`로 확인, 낮으면 nvm-windows로 20+ 설치.
- **한글 계정명 경로 버그**: Windows 사용자명이 한글이면 nvm이 설치 경로를 못 찾음 → `NVM_HOME`을 `C:\nvm`(영문)으로 옮겨 우회.
- **PowerShell venv 활성화**: `.venv\Scripts\activate`(확장자 없음)는 PowerShell에서 안 먹음 → **`.venv\Scripts\Activate.ps1`** 사용. "스크립트 실행 불가" 뜨면 먼저 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`.
- **백엔드 host**: 폰에서 붙으려면 `uvicorn app.main:app --reload --host 0.0.0.0` (기본값은 127.0.0.1이라 폰이 못 붙음).
- **Windows 방화벽 8000 차단**: 관리자 PowerShell에서 `netsh advfirewall firewall add rule name="matchk-api" dir=in action=allow protocol=TCP localport=8000`.
- **아이폰 Expo Go**: 최신 SDK만 지원 → 프로젝트도 SDK 54. 안드로이드는 QR을 **Expo Go 앱 안에서** 스캔(카메라 X), 아이폰은 기본 카메라 OK.
- **Docker 불필요**: 이 프로젝트는 로컬 SQLite로 그냥 돌아감. Docker Desktop 안 켜도 됨.

## 4-2. ⚠️ DB 재생성 (스키마 변경 시 필수)

`is_hidden` 등 모델에 컬럼이 추가돼서, 기존 `matchk.db`로는 앱이 깨짐. **최초 클론 후 + 모델 변경 후** 반드시:

```powershell
cd matchk-api
del matchk.db                              # 기존 DB 삭제 (git에 없음)
python -m app.scripts.seed_landmarks       # 랜드마크 참조 시드 (TourAPI 키 필요)
python -m app.scripts.mark_hidden          # 히든 장소 지정 (소멸위험 구 + 외국어 미등록)
```

## 5. 테스트 / 타입체크

```bash
# 백엔드 (테스트 — venv 활성화 후)
cd matchk-api && pytest

# 프론트 (npm install 후)
cd matchk-app && npm run typecheck
```

## 6. 환경변수 요약

| 파일 | 키 | 발급처 | 담당 |
|---|---|---|---|
| `matchk-api/.env` | `TOURAPI_KEY` | 공공데이터포털 — **팀원 각자 발급 + 운영계정 신청** (심사가 운영계정 호출이력 검증). 일 1,000건 한도가 키 단위라 각자 키 = 한도 5배 | 전원 |
| `matchk-api/.env` | `GOOGLE_CLIENT_ID/SECRET` | Google Cloud Console | 정현 |
| `matchk-api/.env` | `PAPAGO_CLIENT_ID/SECRET` | 네이버클라우드 콘솔 (번역 — 비우면 번역 생략) | 지현 |
| `matchk-api/.env` | `JWT_SECRET` | 랜덤 64자 생성 | 정현 |
| `matchk-api/.env` | `DEMO_MODE` | 시연 빌드만 true | 정현 판단 |
| `matchk-app/.env` | `EXPO_PUBLIC_KAKAO_JS_KEY` + 도메인 등록 | 카카오 개발자 콘솔 (스케줄러 지도용) | 다은 |
| `matchk-app/.env` | `EXPO_PUBLIC_DEMO_STAMP` | 시연 빌드만 true | 정현 판단 |

## 7. CI/CD + 깃대장 운영 (머지 사고 방지)

두 리포 모두 `.github/workflows/ci.yml`이 들어 있어 **push하는 순간부터 자동 작동** (별도 설정 불필요):

| 리포 | PR/push마다 자동 실행 | 체크 이름 |
|---|---|---|
| `matchk-api` | pytest 전체 (실 키 불필요 — 테스트가 자체 주입) | `test` |
| `matchk-app` | TypeScript 타입체크 (`npm run typecheck`) | `typecheck` |

**깃대장(정현)이 최초 1회 설정할 것** — GitHub 리포 Settings → Branches → `main` 보호 규칙 추가:

1. ✅ Require a pull request before merging + Require approvals: **1**
2. ✅ Require status checks to pass → `test`(api) / `typecheck`(app) 지정

→ 이후로는 **CI 빨간불이거나 리뷰 없는 PR은 머지 버튼이 아예 비활성화**됨. 깃대장(정현)은 규칙을 사람이 아니라 GitHub이 강제하도록 만들고, 본인은 충돌 조정·리뷰 배분·주간 머지 관리 담당.

**PR 흐름 (전원)**: feature 브랜치 → push → PR 생성 → CI 초록불 확인 → 리뷰 1명 승인 → 머지 → 브랜치 삭제

## 7-1. 협업 규칙 (주 1회 머지 대비 — 충돌 최소화)

각자 작업 시간이 달라 주 1회 머지하면 그 사이 코드가 갈라짐. 아래를 지키면 충돌이 거의 안 남:

1. **자기 영역 파일만 수정** — 아래 소유권 지도 참고. 남의 영역이 필요하면 직접 고치지 말고 담당자에게 요청.
2. **공용 파일은 "먼저 올리고 알리기"** — `models/`, `endpoints.ts`, `client.ts`, `config.py`, `tourapi_client.py`, `RootNavigator`를 건드릴 땐 **작은 단독 PR로 먼저 머지**하고 팀에 공유. 기능 PR에 섞지 말 것 (충돌의 90%가 여기서 남).
3. **매일 아침 `git pull origin main`** → 자기 브랜치에 최신 main 반영. 주 1회 머지여도 매일 조금씩 좁히면 주말 머지가 수월.
4. **PR은 작게 자주** (2~3일 단위). 일주일치 몰아 올리면 충돌 지옥.
5. **리베이스보다 머지** — 초보 협업엔 머지가 안전 (리베이스는 이력 꼬임 사고 잦음).

### 소유권 지도 (누가 어느 파일·함수)

| 담당 | 백엔드 | 프론트 |
|---|---|---|
| **새봄** 역추천 | `recommender.py`, `lang_mapping.py` | (결과만 표시, 거의 안 건드림) |
| **현표** 업적·도장 | `stamps.py`, `hidden.py` | `AchievementMapScreen`, `HiddenEncounterPopup`, `useHiddenEncounter` |
| **지현** 상세·검색·번역 | `search.py`, `landmarks.py`, `translator.py` | `LandmarkDetailScreen`, `DistrictLandmarksScreen` |
| **다은** 스케줄러 | (nearby 재사용) | `SchedulerScreen`, 카카오 지도 |
| **정현** 인증·언어 | `auth.py`, `users.py` | `ProfileScreen`, `i18n/`, 로그인 |

> 같은 파일을 두 사람이 열어도 **서로 다른 함수**를 만지면 충돌 안 남. 겹치는 부분은 회의에서 "이건 누구" 하고 지정.

## 7-2. 커밋 / PR 규칙

접두어 + 한글 한 줄:

```
feat: 스케줄러 GPS 핀 지도 추가
fix: 도장 중복 시 409 처리
docs: TEAM_SETUP 환경 함정 보강
refactor: 추천 점수 계산 함수 분리
chore: papago 키 env 추가
```

PR 제목: `[담당자] 기능 요약` (예: `[다은] 스케줄러 핀 지도`)

## 8. 자주 걸리는 것

- **포트 충돌 (8000)**: 기존 uvicorn 프로세스 종료 후 다시 실행
- **폰에서 홈이 비어 있음**: 십중팔구 `.env`의 IP가 현재 PC IP와 다름 → ipconfig로 확인 후 수정, `expo start -c`
- **TourAPI 429/한도 초과**: 개발계정 일 1,000건 — 캐시가 막아주지만 언어별 비교는 하루 첫 실행만 실호출. 각자 키 발급으로 한도 분산
- **Railway 배포 (정현)**: 리포 연결하면 Dockerfile 자동 인식. 환경변수는 Railway 대시보드에 등록, Start Command에 `--port $PORT`
