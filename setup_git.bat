@echo off
chcp 65001 >nul
REM ============================================================
REM  Mātch K — Git 초기 세팅 (monorepo: 리포 1개에 api+app 함께)
REM  리포: https://github.com/020215iris-sys/Match-K.git
REM  사용법: 이 폴더(Match_K)에서 setup_git.bat 실행
REM ============================================================

git config --get user.name >nul 2>&1
if errorlevel 1 (
  echo [!] 먼저 git 사용자 설정을 하세요:
  echo     git config --global user.name  "이름"
  echo     git config --global user.email "이메일"
  exit /b 1
)

if not exist .git (
  git init -b main
)
git add -A
git commit -m "chore: initial commit (Match K monorepo)" || echo (커밋할 변경 없음)
git remote remove origin 2>nul
git remote add origin https://github.com/020215iris-sys/Match-K.git

echo.
echo 원격에 이미 커밋(README 등)이 있으면 먼저 병합이 필요합니다:
echo   git pull origin main --allow-unrelated-histories
echo 그다음:
echo   git push -u origin main
echo.
echo 규칙: main 직접 push 금지 - feature 브랜치 - PR - 리뷰 1명 - 머지
echo 커밋 컨벤션: feat: fix: chore: docs: refactor:
