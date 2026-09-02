# 지현 — 오늘 작업 정리 (2026-09-02)

담당: 지현 (상세·검색·번역). 진행한 작업을 순서대로 "문제 → (검증) → 해결"로 정리.

---

## 1. AI 추천 검색어 — 실시간 Claude 호출 → DB 캐시 전환

**문제**
검색 화면 AI 추천 검색어를 요청이 올 때마다 Claude API로 생성해서, 응답이 느리고(~10초) 호출할 때마다 비용이 발생.

**해결**
언어(ko/en/ja/zh) × 월(8·9·10월) 조합별로 미리 생성해 [search_suggestion_cache](matchk-api/app/models/search_suggestion.py) 테이블에 저장해두고, 요청 시엔 [get_suggestions()](matchk-api/app/services/search_suggest.py#L224)가 그 달 행만 읽기만 함(Claude 호출 없음). [generate_search_suggestions.py](matchk-api/app/scripts/generate_search_suggestions.py) 배치 스크립트로 한 번에 생성.

---

## 2. 상세→일정담기 시 구 코드(sigunguCode) 누락

**문제**
랜드마크 상세 화면을 거쳐 일정에 담은 장소는 구 코드가 비어있어서, 스케줄러의 구별 필터링이 안 됨.

**해결**
[landmarks.py](matchk-api/app/routers/landmarks.py#L172-L178) 상세 응답에서 `Landmark`의 District FK를 조인해 `sigunguCode`를 같이 내려주도록 수정. 프론트([LandmarkDetailScreen.tsx](matchk-app/src/screens/LandmarkDetailScreen.tsx), [endpoints.ts](matchk-app/src/api/endpoints.ts))도 이 값을 그대로 전달하게 수정.

---

## 3. 검색 0건일 때 카테고리 칩 + 역추천

**문제**
자유 검색어로 0건이 나오면 사용자가 다음 행동을 못 하고 그냥 막힘.

**검증**
해변/공원/시장/카페/전망대/사찰 6개 카테고리를 실제 TourAPI로 하나씩 조회 — "해수욕장" 1건, "사찰"/"절" 0건·오탐(카파도키아, 수영돼지국밥 등 무관한 결과) 확인. 절/암자는 실제로 "OO사(부산)", "OO암(부산)" 식으로 등록돼있다는 패턴 발견.

**해결**
카테고리별 키워드를 여러 개로 넓혀 합치는 방식으로 [category_dictionary.py](matchk-api/app/services/category_dictionary.py#L57-L108) 재구성(실사 검증한 키워드 사전). 검색 0건 시 칩 노출 → 클릭하면 [search_by_category](matchk-api/app/routers/search.py#L51-L80)가 카테고리 검색 + 기존 역추천 점수 로직 재사용.

---

## 4. 계절 추천(9·10월 "전망대") 한국시간 고정

**문제**
9·10월엔 "전망대"를 추천에 고정 노출하기로 했는데, 월 전환 기준이 서버 배포 시간대(UTC 등)에 따라 달라질 위험이 있었음.

**해결**
[search_suggest.py](matchk-api/app/services/search_suggest.py#L37)에서 `ZoneInfo("Asia/Seoul")`로 명시적 한국시간 기준 월을 계산하도록 고정 — 서버가 어디에 배포되든 항상 한국 자정 기준으로 달이 바뀜.

---

## 5. 검색이 한국어인데 강제로 영어 미리보기로 나오던 버그

**문제**
한국어로 카테고리 검색해도 결과가 강제로 영어로 표시되고, 그 과정에서 Papago가 검색 1번에 ~18번씩 불필요하게 호출됨.

**검증**
원인이 [recommender.py](matchk-api/app/services/recommender.py#L286-L323)의 "user_lang이 ko면 내부에서 en으로 바꾼다"는 로직(원래 홈 추천 전용)이 검색 경로에도 그대로 적용되고 있었던 것으로 확인. 이 파일은 새봄님 담당이라 직접 고치지 않고 공유만 함.

**해결**
새봄님과 협의해 `preview_foreign` 파라미터로 분리 — 홈 추천(`/api/recommendations`)만 기존처럼 강제 미리보기 유지, 검색/카테고리(`preview_foreign=False`)는 요청 언어 그대로 표시.

---

## 6. 검색·구목록 언어별 결과 불균형 + 외국어 사용자 도장 실패

**문제**
카테고리 검색과 구별 명소 목록이 한국어는 결과가 많은데 영/일/중은 텅 비는 경우가 많았고, 조사해보니 외국어 사용자는 도장 자체가 안 찍히는 숨은 버그도 있었음.

**검증**
일본어로 수영구 조회 → 0건. 원인: 도장 시스템(`Landmark` 테이블)이 한국어 서비스(KorService2) contentid 기준으로 시드돼있는데, 외국어 서비스(JpnService2 등)는 같은 장소라도 다른 contentid를 줌 → 도장 매칭이 아예 실패. curl로 확인해보니 국문 우선 수집으로 바꾼 뒤 일본어 12구가 0건 → 9건으로 정상화, contentid도 기존 도장 시드값과 일치.

**해결**
[landmarks.py](matchk-api/app/routers/landmarks.py#L84-L96)를 항상 한국어(`"ko"`)로 먼저 수집하고, 표시만 `_localize_items()`([L56-L81](matchk-api/app/routers/landmarks.py#L56-L81))가 공식 등록판/Papago로 현지화하도록 변경. contentid는 절대 안 바꿔서 도장도 정상 작동. `search.py`의 카테고리 검색도 동일 패턴 적용.

---

## 7. GPS 무한 로딩

**문제**
구 재진입 시 GPS 응답이 안 오면 로딩 화면이 영원히 안 풀림.

**검증**
백엔드 로그로 5초 타임아웃 뒤 재진입이 정상 처리됨을 확인 (같은 구를 여러 번 재진입해도 안 걸림).

**해결**
[DistrictLandmarksScreen.tsx](matchk-app/src/screens/DistrictLandmarksScreen.tsx#L27-L36)에 `Promise.race` 5초 타임아웃 + "위치 확인 안 됨/다시 시도" 배너([L174-L181](matchk-app/src/screens/DistrictLandmarksScreen.tsx#L174-L181)) 추가. GPS 실패와 무관하게 화면·도장 목록은 정상 표시, 재시도 누르면 자동 도장도 다시 시도.

---

## 8. Papago 비용 상한 + 테스트 실호출 차단

**문제**
Papago가 서버 재시작마다 캐시(24h)가 날아가 계속 재호출되고 있었고, 100만자 단위 계단식 과금이라 8월 22,000원·9월 44,000원이 실제로 청구됨.

**검증**
NCP 요금표로 "Papago Text Translation = 100만자당 20,000원, 1글자만 써도 최소 과금(계단식)" 확인. 이 과정에서 로컬 `pytest`가 "키 없음"을 가정한 테스트인데 실제 `.env`의 진짜 키로 매번 실비용을 발생시키고 있었다는 것도 발견.

**해결**
- [translation_usage.py](matchk-api/app/models/translation_usage.py) 테이블로 월별 누적 글자수를 DB에 기록(서버 재시작해도 안 사라짐) + [translator.py](matchk-api/app/services/translator.py#L40-L72)가 월 100만자(2만원) 상한 넘으면 Papago 호출 자체를 스킵(원문 유지)
- [test_translator.py](matchk-api/tests/test_translator.py#L9-L19)에 키를 강제로 비우는 fixture 추가 + 캐시 초기화 → 로컬 테스트 실비용 완전 차단

---

## 9. 업적지도 다국어 이슈 진단 + 현표 전달용 데이터 검증

**문제**
업적지도에서 ① 구 클릭 시 명소가 안 나오고 ② 지도 라벨/구 목록의 구 이름이 언어를 바꿔도 한국어·영어로 고정되는 문제를 팀원이 리포트함. 담당(현표) 파일 문제인지, 번역(Papago) 쪽 문제인지 구분이 필요했음.

**검증**
①은 `landmarks.py`(내 담당) 쪽 원인으로 확인 — 6번 항목에서 이미 수정됨. ②는 `AchievementMapScreen.tsx`(지도 라벨)와 `stamps.py`(구 목록)가 구 이름을 `nameKo`/`District.name_en`으로 하드코딩하고 있어서였고, 구가 16개뿐인 고정 데이터라 실시간 번역(Papago) 없이 해결 가능함을 확인. TourAPI 다국어 서비스(`areaCode2`, EngService2/JpnService2/ChsService2)를 직접 호출해 부산 16개 구의 공식 영/일/중 이름을 `sigunguCode` 기준으로 전부 확보·검증.

**해결**
진단 결과 + 검증된 16개 구 다국어 이름 표와 그대로 붙여넣을 수 있는 코드 스니펫을 현표에게 전달. Papago 호출 없이 정적 데이터로 처리하도록 제안.

---

## 10. 백엔드 전체 Claude 호출 범위 재점검

**문제**
여러 기능을 DB 캐싱/규칙 기반으로 바꾼 뒤, "이제 라이브 요청에서 Claude가 진짜 안 불리는지"가 감으로만 파악되고 있었음.

**해결**
`grep`으로 백엔드 전체에서 `anthropic`/Claude 호출 지점을 전수 확인. 결과: AI 추천 검색어는 배치 스크립트([generate_search_suggestions.py](matchk-api/app/scripts/generate_search_suggestions.py))에만 남아있어 라이브 호출 0건, 카테고리 칩만 [category_dictionary.py:168](matchk-api/app/services/category_dictionary.py#L168)에서 "검색 0건 + 규칙 기반 매칭도 실패했을 때만" 조건부로 호출됨을 확인.
