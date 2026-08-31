# hyunpyo/hidden-district-refactor 브랜치 적용 & 실행 가이드

작성: 현표 (Claude와 함께 작업) · 2026-08-31

이 문서는 `hyunpyo/hidden-district-refactor` 브랜치를 받아서 로컬에서 실행하는
전체 과정을 정리한 것이다. 팀원 아무나 이 브랜치를 테스트해보고 싶을 때
TEAM_SETUP.md의 공통 세팅에 이어서 참고하면 된다.

## 1. 브랜치 받기

원격에 이미 올라가 있다면:

```bash
git fetch origin
git checkout hyunpyo/hidden-district-refactor
```

(개발 중 원격 push 전에는 git bundle로 주고받았음 — `git fetch <bundle경로>
hyunpyo/hidden-district-refactor:hyunpyo/hidden-district-refactor` 형태.
지금은 필요 없을 가능성이 높지만, 혹시 브랜치가 origin에 없으면 현표에게
문의.)

## 2. 백엔드 세팅

TEAM_SETUP.md 공통 세팅(venv, `pip install -r requirements.txt`, `.env`의
`TOURAPI_KEY`)이 이미 되어 있다는 전제.

### 2-1. Windows 전용 — `tzdata` 추가 설치 필수

```powershell
pip install tzdata
```

`search_suggest.py`가 `ZoneInfo("Asia/Seoul")`을 쓰는데, macOS/Linux는 OS에
시간대 데이터가 내장돼 있지만 **Windows Python엔 없어서** 이거 없으면 서버가
`WatchFiles` 자동 리로드 때마다 죽는다(`ZoneInfoNotFoundError`). 안 죽어도
소리 없이 재시작 루프에 빠져서 "구 버튼 눌러도 무한 로딩" 증상으로 나타난다.
이 프로젝트를 아예 처음 세팅하는 사람은 `requirements.txt`에 반영되기 전까지
수동으로 설치해야 한다.

### 2-2. DB 재시드 (모델이 바뀌었으면)

```powershell
del matchk.db
python -m app.scripts.seed_landmarks
python -m app.scripts.mark_hidden
```

`seed_landmarks`는 TourAPI 실호출이라 시간이 좀 걸리고, 에러 로그(429 등)가
있는지 꼭 확인. 정상이면 `mark_hidden` 실행 시 구별로 "전체 N 후보 M → 히든 K
일반 L" 요약이 출력된다.

### 2-3. 서버 실행

```powershell
uvicorn app.main:app --reload --host 0.0.0.0
```

`--host 0.0.0.0` 빠뜨리면 폰에서 접속 자체가 안 된다. `http://localhost:8000/docs`
열려서 Swagger 뜨면 정상.

## 3. 프론트 세팅

### 3-1. 패키지 설치

```powershell
cd matchk-app
npm install
```

이 브랜치에서 `react-native-svg`가 새로 추가됐다(업적지도를 SVG 폴리곤으로
그림). **Expo Go에 이미 네이티브 코드가 내장돼 있어서 커스텀 dev build 없이도
바로 된다** — `@react-native-google-signin/google-signin`이랑 다르게 걱정
안 해도 됨.

### 3-2. `.env` 확인

```
EXPO_PUBLIC_API_URL=http://<PC의 LAN IP>:8000
EXPO_PUBLIC_DEMO_STAMP=true
```

- `EXPO_PUBLIC_API_URL`의 IP는 **PC가 재부팅되거나 네트워크가 바뀌면 달라질 수
  있다.** `ipconfig`로 IPv4 주소 확인해서 안 맞으면 고치고 서버 재시작
  (`.env`는 시작할 때만 읽음).
- `EXPO_PUBLIC_DEMO_STAMP=true`로 해두면 구 상세 화면 들어갈 때 GPS 없이
  그 구 관광지가 즉시 전부 도장 찍힌다. 부산 밖(서울 등)에서 테스트할 때 필수.
  **주의**: 들어간 구는 진짜로 다 찍히니, 진행률 낮은 상태를 보고 싶으면
  아직 안 들어간 구를 골라야 한다.

### 3-3. 실행

```powershell
npx expo start -c
```

`-c`로 캐시 지우고 시작하는 걸 권장 (새 패키지 추가된 직후라 특히).
"Log in with Expo account" 물어보면 방향키로 `Proceed anonymously` 선택 후
Enter.

## 4. 자주 겪은 문제 & 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| `npm install` 시 ENOENT | `matchk-app` 폴더가 아니라 프로젝트 최상위에서 실행함 | `cd matchk-app` 먼저 |
| QR 찍어도 "request timed out" | Windows 방화벽이 8081(Metro) 포트 막음 | 관리자 PowerShell에서 `netsh advfirewall firewall add rule name="expo-metro" dir=in action=allow protocol=TCP localport=8081` |
| `//api/...` 404 (슬래시 두 개) | `.env`의 `EXPO_PUBLIC_API_URL` 끝에 `/`가 붙어있음 | 끝 슬래시 제거 후 서버 재시작 |
| 구를 눌러도 무한 로딩 / 리스트 화면이 빔 | 백엔드가 죽어있음 (대개 tzdata) | 백엔드 터미널 로그 확인 → 위 2-1 참고 |
| `RNGoogleSignin could not be found` | 정현님이 넣은 네이티브 구글로그인 모듈이 Expo Go에서 import 시점에 크래시 (2026-08-24) | 정현님이 이후 동적 import로 재수정함(`fd7169d`, `0a714cf`) — 최신 main 기준이면 안 남 |
| `Tried to register two views with the same name RNSVG...` | Expo Go 핫리로드로 네이티브 SVG 모듈이 중복 등록됨(react-native-svg 새로 추가된 직후 흔함) | `r` 리로드로는 안 고쳐짐. **폰에서 Expo Go 앱 완전 종료 → PC에서 서버 완전 종료(Ctrl+C) → `npx expo start -c` 재시작 → 폰에서 새로 QR 스캔** |
| 업적지도 색이 다 비슷해 보임 | 원래 전체 구가 같은 파란색 계열이었음(구버전) | 최신 커밋부터 구마다 고유색 배정됨 — `matchk-app/docs/achievement-map.md` 참고 |

## 5. 확인 체크리스트

- [ ] `cd matchk-api && pytest` → 전부 통과 (`test_translator.py` 2개는 로컬에
      실 Papago 키가 있으면 실패할 수 있는데 정상 — CI에는 키가 없어서 통과함)
- [ ] `cd matchk-app && npm run typecheck` → 에러 0
- [ ] 앱 켜서 업적지도 → 구 탭 → 관광지 도장 찍힘 확인
- [ ] 구 도장 비율 임계값(30%) 넘기면 히든 배너 뜨는지 확인 → 탭 → 팝업 →
      수집 → 리스트 최상단 고정 확인
- [ ] 업적지도 맨 아래 개발용 색칠 미리보기 칩으로 그라데이션 확인 (`__DEV__`
      빌드에서만 보임)
