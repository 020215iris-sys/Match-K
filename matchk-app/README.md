# matchk-app

Mātch K 프론트 (React Native / Expo).

## 실행

```powershell
npm install
copy .env.example .env      # EXPO_PUBLIC_API_URL을 내 PC LAN IP로 (localhost는 폰에서 안 잡힘)
npx expo start              # 폰 Expo Go로 QR 스캔
```

- Wi-Fi 바뀌면 `.env`의 IP를 새 IP로 바꾸고 `npx expo start -c` 재시작 (ipconfig로 IPv4 확인)
- Google 로그인·SecureStore는 **Expo Go에서 제약** → `npx expo run:android` 또는 EAS dev build로 검증
- 백엔드가 꺼져 있으면 화면에 에러 표시(재시도 버튼) 뜸

## 화면 ↔ 담당

| 파일 | 화면 | 담당 |
|---|---|---|
| `src/screens/HomeScreen.tsx` | 홈 (추천 카드 + 마스코트) | 새봄/공용 |
| `src/components/Mascot.tsx` | 마스코트 (역추천 얼굴) | 공용 |
| `src/components/IntroPopup.tsx` | 인트로 팝업 | 새봄 |
| `src/screens/AchievementMapScreen.tsx` | 업적지도 (이미지 지도로 교체 예정) | 현표 |
| `src/components/HiddenEncounterPopup.tsx` | 히든 조우 팝업 | 현표 |
| `src/screens/LandmarkDetailScreen.tsx` | 상세 + 도장 | 지현 |
| `src/screens/SchedulerScreen.tsx` | 스케줄러 (GPS 핀 지도로 재구성 예정) | 다은 |
| `src/screens/ProfileScreen.tsx` | 프로필/언어/로그아웃/회원탈퇴 | 정현 |
| `src/i18n/` | 4개 언어팩 (ko/en/ja/zh) | 정현 |

## 남은 TODO

1. `.env` `EXPO_PUBLIC_KAKAO_JS_KEY` + 카카오 콘솔 도메인 등록 (스케줄러 지도 — 다은)
2. 업적지도를 카카오 WebView → **이미지 기반**으로 교체 (현표)
3. 스케줄러를 **GPS 핀 지도**로 재구성 (다은)
4. Google OAuth 연결 (`expo-auth-session`, 백엔드 `/auth/google/url` 흐름 — 정현)
5. 도장·히든 조우 애니메이션/진동 + 마스코트 표정 전환 (현표)
6. 마스코트 이미지 최적화 (원본 2695px → 표시 크기로 축소, `assets/mascot/`)

## 시연 빌드

`.env`에 `EXPO_PUBLIC_DEMO_STAMP=true` + 백엔드 `DEMO_MODE=true` → GPS 검증 없이 도장 시연 (부산 외 발표 대비)
