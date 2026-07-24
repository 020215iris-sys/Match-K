# matchk-app

Mātch K 프론트 (React Native / Expo). 담당: A.

## 실행

```bash
npm install
npx expo install --fix     # SDK에 맞는 버전 정합
copy .env.example .env      # API URL, Kakao JS 키
npx expo start
```

- Google 로그인·SecureStore는 **Expo Go에서 제약** 있음 → `npx expo run:android` 또는 EAS dev build로 검증 (계획서 §3)
- 백엔드가 꺼져 있어도 앱은 뜨고, 각 화면은 빈 상태로 폴백

## 화면 ↔ 지시서 매핑

| 파일 | 화면 | 티켓 |
|---|---|---|
| `src/screens/HomeScreen.tsx` | 홈 (검색 인라인 결과 포함 §6-6) | D3·D6·D7 [A] |
| `src/components/IntroPopup.tsx` | 인트로 팝업 (역추천 auto) | D5 [A] |
| `src/screens/AchievementMapScreen.tsx` | 업적지도 (Kakao WebView) | D4·D6 [A] |
| `src/screens/LandmarkDetailScreen.tsx` | 상세 + 도장 찍기 | D8 [A] |
| `src/screens/SchedulerScreen.tsx` | 스케줄러 | D7 [A] |
| `src/screens/ProfileScreen.tsx` | 프로필/언어/로그아웃 | D8 [A] |
| `src/i18n/` | 4개 언어팩 (ko/en/ja/zh) | D2 [A] |

## 팀이 채워야 할 TODO

1. `.env`: `EXPO_PUBLIC_KAKAO_JS_KEY` + 카카오 콘솔 웹 도메인 등록 → `EXPO_PUBLIC_KAKAO_BASE_URL`에 동일 도메인
2. **`assets/busanDistricts.geojson.json`** — D가 D3에 준비 (16개 구·군, feature `properties.sigunguCode` 필수). 배치 전엔 지도가 폴리곤 없이 동작
3. D의 아이콘 전달 후 `CircleButton`의 임시 이모지 교체 (D3 [D])
4. Google OAuth 연결 (`expo-auth-session`) — 백엔드 `/auth/google/url` 흐름 사용 (D2 [A])
5. 도장 획득 애니메이션/진동 (D7 [D] 스펙 확정 후)
6. 다국어 문구는 `src/i18n/locales/*.json` — E의 D7 CSV 검수 후 여기 반영
7. 시연 빌드: `.env`에 `EXPO_PUBLIC_DEMO_STAMP=true` + 백엔드 `DEMO_MODE=true` (부산 외 시연)
