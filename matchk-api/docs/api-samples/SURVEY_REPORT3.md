# TourAPI 3차 실사 리포트 (전체를 Claude에게 붙여넣기)

실행일: 2026-07-13

| 항목 | 시도 (파라미터) | 결과 |
|---|---|---|
| A_방문자수 | `locgoRegnVisitrDDList` (startYmd=20260701, endYmd=20260705, areaCd=26) | ❌ API 에러: {"responseTime":"2026-07-13T21:04:33.311","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(areaCd)"} |
| A_방문자수 | `locgoRegnVisitrDDList` (startYmd=20260701, endYmd=20260705, areaCd=26, signguCd=26350) | ❌ API 에러: {"responseTime":"2026-07-13T21:04:33.832","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(areaCd)"} |
| A_방문자수 | `locgoRegnVisitrDDList` (startYmd=20260603, endYmd=20260608, areaCd=26) | ❌ API 에러: {"responseTime":"2026-07-13T21:04:33.975","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(areaCd)"} |
| B_연관관광지 | `areaBasedList1` (baseYm=202606, areaCd=26, signguCd=26350) | ✅ OK (601건) |
|  | 응답 필드 | `baseYm, tAtsCd, tAtsNm, areaCd, areaNm, signguCd, signguNm, rlteTatsCd, rlteTatsNm, rlteRegnCd, rlteRegnNm, rlteSignguCd, rlteSignguNm, rlteCtgryLclsNm, rlteCtgryMclsNm, rlteCtgrySclsNm, rlteRank` |
|  | 첫 행 | `{"baseYm": "202606", "tAtsCd": "9951cd14afadc30de7a66860ad5be803", "tAtsNm": "APEC나루공원", "areaCd": "26", "areaNm": "부산광역시", "signguCd": "26350", "signguNm": "해운대구", "rlteTatsCd": "c3e86c012b7f8f4ee15697cde66a9d41", "rlteTatsNm": "벡스코/제2전시장", "rlteRegnCd": "26", "rlteRegnNm": "부산광역시", "rlteSignguCd": "26350", "rlteSignguNm": "해운대구", "rlteCtgryLclsNm` |
| C_집중률 | `tatsCnctrRatedList` (areaCd=26) | ❌ API 에러: {"responseTime":"2026-07-13T21:04:34.372","resultCode":"11","resultMsg":"NO_MANDATORY_REQUEST_PARAMETERS_ERROR1(signguCd |
| C_집중률 | `tatsCnctrRatedList` (areaCd=26, signguCd=26350) | ✅ OK (570건) |
|  | 응답 필드 | `baseYmd, areaCd, areaNm, signguCd, signguNm, tAtsNm, cnctrRate` |
|  | 첫 행 | `{"baseYmd": "20260713", "areaCd": "26", "areaNm": "부산광역시", "signguCd": "26350", "signguNm": "해운대구", "tAtsNm": "SEA LIFE 부산아쿠아리움", "cnctrRate": "56.76"}` |

> 전부 ✅면 실사 끝 — 이 리포트가 마지막. ❌ 남으면 해당 API만 Swagger 확인.