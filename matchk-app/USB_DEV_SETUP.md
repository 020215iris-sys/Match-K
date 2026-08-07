# 📱 폰 USB 연동 — 개인 참고용 (지현)

> 와이파이가 폰·PC 같은 네트워크가 아닐 때, USB 케이블로 Expo Go 연결하는 방법.
> 팀 공용 세팅은 `TEAM_SETUP.md` 참고 — 이 파일은 USB 방식 전용 개인 메모.
> 2026-08-07 대량 삽질 끝에 안정화 완료 (원인: Windows USB 절전 설정 + Expo CLI 로그인 프롬프트).

## 0) 최초 1회만 하면 되는 설정 (이미 완료됨, 다시 안 해도 됨)

- Node.js, adb(Android SDK Platform Tools) 설치
- `matchk-app`에 `npm install` 완료
- `matchk-app/.env`에 `EXPO_PUBLIC_API_URL=http://localhost:8000`
- 폰 개발자 옵션 → USB 디버깅 켬 + "이 컴퓨터에서 항상 허용" 체크
- **⚠️ 중요 — 여기가 오늘 진짜 원인이었음**: Windows에서 USB 절전 끄기
  - 전원 관리 옵션 → 고급 설정 → USB 설정 → USB 선택적 절전 모드 → **사용 안 함**
  - 장치관리자 → 범용 직렬 버스 컨트롤러 → **USB 루트 허브** 항목 전부 → 전원 관리 탭 → "전력 절약을 위해 끌 수 있음" 체크 **해제**
  - 이거 안 하면 `adb reverse`가 몇 분마다 저절로 끊김

## 매번 반복하는 순서

### ① WSL 터미널 — 백엔드
```bash
cd /mnt/c/Match-K/matchk-api
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0
```
계속 켜둔 채로 둠.

### ② 폰 USB 연결
- 케이블 연결, 화면 잠금 풀기
- 알림창 → "USB로 이 기기 충전 중" 탭 → **"파일 전송"**으로 변경

### ③ Windows 터미널(cmd/PowerShell) — 인증 + 포트포워딩
```powershell
cd C:\Match-K\matchk-app
adb devices
```
- `device`로 안 뜨면(`unauthorized`) → `adb kill-server` → `adb start-server` → 폰 팝업 "항상 허용" + 허용

```powershell
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```
→ 안 끊기는지 확인하려면 잠시 후 `adb reverse --list`로 재확인 (USB 절전 꺼놨으면 안 끊김)

### ④ Expo 실행 — **`--go --offline`로 로그인 질문 자체를 회피**
```powershell
$env:CI=$null   # 혹시 이전에 CI=true 설정했었다면 해제
npx expo start --go --offline
```
- `Using Expo Go`가 바로 뜨고 로그인 질문 없이 조용히 로그 대기 상태로 넘어가면 성공
- (`--offline`이라 실기기 업데이트 체크 등을 생략함 — 로컬 개발엔 문제없음)

### ⑤ 폰에서 열기
- Expo Go 앱 완전히 종료했다가 재실행 (자동 열림 안 씀)
- **"Enter URL manually"** → `exp://localhost:8081` → Connect

## 끝낼 때
- 각 터미널 `Ctrl+C`
- USB 케이블 그냥 뽑기 (별도 해제 절차 없음)

## 자주 걸리는 것
- **`adb reverse`가 몇 분마다 끊김**: USB 절전 설정 확인 (0번 항목). 껐는데도 끊기면 USB 케이블/포트 자체 문제 의심.
- **"It is recommended to log in..." 질문에 Enter 안 먹힘**: 터미널 클릭해서 포커스 준 뒤 재시도. 그래도 안 되면 `--go --offline`로 아예 회피 (④번).
- **"Failed to download remote update"**: `adb reverse --list`로 포트 살아있는지 확인, 안 살아있으면 ③ 다시.
- **VSCode 재시작 후**: 터미널 전부 새로 열어야 함 (WSL 1개 + Windows cmd/PowerShell 1개).
