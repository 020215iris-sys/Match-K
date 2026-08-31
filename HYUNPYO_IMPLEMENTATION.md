# 현표 담당 구현 내용 — 업적·도장·히든미션

브랜치: `hyunpyo/hidden-district-refactor` · 작성: 현표 (Claude와 함께 작업)
최종 커밋 기준: `602bc39` (2026-08-31)

담당 영역(HANDOFF.md 기준): `stamps.py`, `hidden.py`, 업적지도 이미지 기반
3페이지, 구별 도장 리스트/상태, 히든 팝업(구 비율 트리거), 도장 애니메이션.

---

## 1. 무엇을 바꿨나 — 한 줄 요약

**히든 미션 발동 방식을 "GPS 근처 감지"에서 "구별 도장 비율 달성"으로
바꾸고, 업적지도를 사각 그리드 placeholder에서 실제 부산 지형 실루엣의
색칠형 폴리곤 지도로 새로 만들었다.**

---

## 2. 백엔드

### 2-1. `app/routers/stamps.py` — `district_status` 엔드포인트

기존엔 그 구의 도장 상태(`stampedContentIds`, `hiddenReady`)만 내려주고,
"어떤 히든 장소를 팝업에 띄울지"는 TODO로 남아있었다. 여기에 선정 로직을
추가했다:

```python
hidden_target = (db.query(Landmark.contentid)
                  .filter(Landmark.district_id == district.id, Landmark.is_active,
                          Landmark.is_hidden.is_(True),
                          ~Landmark.contentid.in_(hidden_stamped))
                  .order_by(Landmark.id)
                  .first())
```

- **선정 기준**: 그 구의 히든 장소 중 아직 안 찍은 것을 `id` 순으로 하나
  고른다. 랜덤이 아니라 결정적(deterministic)으로 골라서, 같은 유저가
  새로고침해도 팝업 대상이 안 바뀐다.
- **응답에 `hiddenTargetContentId` 필드 추가** (nullable) — `hiddenReady`일
  때만 값이 있고, 그 구의 히든을 전부 모았으면 `null`.

### 2-2. `app/routers/hidden.py` — 전면 재작성

기존 방식(폐기):
- 부산 전체 통합 지도색칠비율(`HIDDEN_MAP_THRESHOLD`) + 전체 도장비율
  (`HIDDEN_STAMP_THRESHOLD`) 둘 다 넘으면 "잠금 해제"
- 잠금 해제되면 `/api/hidden/landmarks`가 히든 장소 좌표 목록을 내려주고,
  프론트가 GPS로 15초마다 근접 판정

새 방식:
- 발동 조건은 이제 전적으로 `stamps.py`의 `district_status`가 담당 (구별
  비율, 좌표 자체가 필요 없어짐)
- `hidden.py`는 `/api/hidden/status` 하나만 남기고 "지금까지 발견한 히든
  개수"만 반환 (총 개수는 비공개 원칙 유지)
- 좌표를 배포하는 엔드포인트(`/api/hidden/landmarks`) 자체를 삭제 — 애초에
  위치 데이터를 다루지 않게 되어 위치정보보호법 관련 리스크도 줄어듦

### 2-3. `app/core/config.py`

`HIDDEN_MAP_THRESHOLD`는 값은 그대로 두고 "2026-08 개편으로 미사용"이라는
안내 주석만 추가 (공용 파일이라 값 자체는 안 건드림 — 팀 회의로 구별 임계값
재정의 예정).

### 2-4. `app/scripts/seed_progress_demo.py` (신규)

업적지도 색칠(`fillOpacity`) 그라데이션 검증용. 해운대구(일반 관광지
16개라 10%씩 가장 촘촘하게 끊김) 기준으로 0~100% 진행률에 해당하는 게스트
계정 11개를 만들고 로그인 토큰을 출력한다. 실제로 돌려서 API 응답까지
검증 완료 (60% 계정 → `progress: 0.625` 확인).

### 2-5. `tests/test_hidden.py` — 재작성

새 동작(구별 비율 트리거)에 맞게 4개 테스트로 재작성:
1. 임계값 미달 시 `hiddenReady=false`, `hiddenTargetContentId=null`
2. 임계값 달성 시 `hiddenReady=true`, 타겟이 id순 첫 후보로 결정적으로 나옴
3. 타겟 수집 후 다음 히든으로 자동 전환, `/api/hidden/status`의
   `discovered` 카운트 증가, `total`은 응답에 없음(비공개 유지)
4. 그 구 히든을 전부 모으면 `hiddenTargetContentId=null`로 돌아옴

---

## 3. 프론트엔드

### 3-1. `src/hooks/useHiddenEncounter.ts` — 완전 재작성

기존: `expo-location`으로 15초 폴링, haversine 근접 판정, GPS 실패 처리 등
GPS 관련 로직이 대부분이었음.

새 버전: 위치를 아예 안 읽는다. 서버가 이미 계산해준 `hiddenReady` /
`targetContentId`만 받아서 팝업 열림·수집·닫힘 상태만 관리하는 순수 상태
훅으로 축소됨. `collect()`가 GPS 재검증 없이 바로 `createStamp` 호출.

### 3-2. `src/components/HiddenEncounterPopup.tsx`

등장 시 스프링 팝(pop) 애니메이션 추가 (`Animated.spring`). "GPS
재검증 후 수집" 이던 주석을 새 흐름에 맞게 수정.

### 3-3. `src/screens/DistrictLandmarksScreen.tsx`

- 히든 배너를 탭 가능하게 만들어 `HiddenEncounterPopup`과 연결
- 수집 성공 시 다음 히든 타겟을 자동 재조회 (구에 히든이 더 있으면 배너가
  이어서 뜸)
- 도장이 새로 찍히는 순간 팝 애니메이션(`StampSlot` 컴포넌트, 스프링 스케일)
- `EXPO_PUBLIC_DEMO_STAMP=true`일 때 GPS 없이 그 구 관광지를 즉시 전부
  도장 찍는 시연 모드 구현 (기존엔 플래그만 있고 실제로는 아무 동작도
  안 하는 미완성 상태였음)

> ⚠️ **참고**: 이 파일은 TEAM_SETUP.md의 최신 소유권 표 기준으로는
> 지현님 담당(`LandmarkDetailScreen`, `DistrictLandmarksScreen`)으로
>되어 있다. HANDOFF.md엔 "업적지도 이미지 기반 3페이지"가 현표 담당이라고
> 되어 있어서 작업했는데, 두 문서가 어긋난다. 머지 전에 지현님과 한 번
> 확인 필요.

### 3-4. `src/screens/AchievementMapScreen.tsx` — 가장 많이 바뀐 파일

세 단계로 진화했다.

**1단계 — 이모지 placeholder → 정적 이미지**
`assets/maps/busan-full.png`를 직접 생성(PIL)해서 이미지 기반으로 전환.
(이후 폐기)

**2단계 — 사각 타일 그리드**
16개 구를 실제 상대 위치(서→동, 북→남)에 맞춰 사각 타일로 배치, 진행률만큼
`fillOpacity`로 채워지게 함. 구끼리 흰 선으로 맞닿게 해서 지도 느낌을 냄.
영도구만 둥근 알약 모양으로 분리(섬).

**3단계 — 실제 지형 실루엣 폴리곤 (현재)**
사용자가 제공한 실제 부산 행정지도 참고 이미지를 보고, `matplotlib` +
`shapely`로 좌표를 잡고 겹침 검증하면서 16개 구를 폴리곤으로 다시 떴다
(사각형 아님). 강서구 서쪽 큰 덩어리, 기장군 북동쪽 돌출, 영도구 남쪽 좁은
목으로 이어진 섬 형태 등 실루엣을 실제 지도와 비슷하게 맞춤.

**색상**: 구마다 통일된 색이 아니라 HSL 색상환 16등분으로 고유색 배정,
그 안에서 도장 비율로 `fillOpacity`를 조절(옅음→진함). 소멸위험 구(동구·
서구·영도구)는 항상 금색 테두리. 자세한 규칙·팔레트 표는
`matchk-app/docs/achievement-map.md` 참고.

**인터랙션**: 구 폴리곤을 바로 탭하면 구 상세(③)로 이동. 기존 그리드
화면(②, `AchievementDistrictsScreen`)은 없애지 않고 "리스트로 보기"
링크로 격하 — 지도 대신 목록으로 보고 싶은 사람을 위한 대안 화면.

**개발용 미리보기**: `__DEV__`에서만 보이는 색칠 미리보기 칩(0~100%,
10%단위) 추가. 실기기 계정 전환 없이 폰 화면에서 바로 그라데이션 전체를
확인할 수 있음. 탭하면 전 구가 그 퍼센트로 즉시 칠해진 것처럼 보여주는
화면 오버라이드일 뿐, 실제 도장 데이터는 안 건드림. 프로덕션 빌드엔 안
들어감.

### 3-5. `src/api/endpoints.ts`

- `DistrictStampStatus`에 `hiddenTargetContentId: string | null` 추가
- `hiddenStatus()` 응답을 `{ discovered: number }`로 단순화
- `hiddenLandmarks()` 제거 (백엔드에서 해당 엔드포인트 자체가 없어짐)

### 3-6. i18n (ko/en/ja/zh)

- `hidden.encounterSub`: "근처에 있어요"(GPS 문구) → "이 구의 도장을 다
  모아서 나타난 히든 스팟이에요" (구 완료 트리거 문구로 수정)
- `map.tapBusan`: "부산을 눌러 구별로 보기" → "구를 눌러 자세히 보기"
  (탭하면 바로 구 상세로 가는 새 인터랙션에 맞춤)
- `map.viewAsList` 신규 — "리스트로 보기" 링크 텍스트

### 3-7. 신규 의존성

`react-native-svg` 추가. Expo Go에 네이티브 코드가 이미 내장돼 있어서 커스텀
dev build 없이 바로 동작 (구글로그인 네이티브 모듈과 달리 안전).

---

## 4. 검증

- 백엔드: `pytest` — 히든/도장 관련 테스트 전부 통과 (팀 전체 스위트
  31개 기준)
- 프론트: `npx tsc --noEmit` — 매 커밋마다 에러 0 확인
- `seed_progress_demo.py` 실제 실행 + 생성된 토큰으로 `GET
  /api/stamps/progress` 직접 호출해서 진행률 계산이 정확한지 확인
- shapely로 16개 구 폴리곤 간 유의미한 겹침(overlap) 없는지 좌표 확정
  전에 검증

---

## 5. 남은 일 / 팀에 공유할 것

- **히든 발동 구별 비율 수치**(`HIDDEN_STAMP_THRESHOLD`, 현재 0.30)는
  임시값 그대로 — 팀 회의로 구별 재정의 예정 (HANDOFF.md에 명시된 미정
  사항)
- **폴리곤 좌표는 실제 GIS 데이터 아님** — 참고 이미지 보고 눈대중으로
  뜬 근사치. 디자인팀 최종 지도 나오면 `LAYOUT`의 `points`만 교체하면
  됨(구조 재사용 가능)
- **`DistrictLandmarksScreen.tsx` 소유권 문서 불일치** — 위 3-3 참고,
  지현님과 확인 필요
- **`requirements.txt`에 `tzdata` 추가 필요** — Windows에서 서버가
  죽는 문제(BRANCH_SETUP_hyunpyo.md 참고), 지현님 쪽(`search_suggest.py`
  담당) 파일이라 직접 안 고치고 공유만 함
