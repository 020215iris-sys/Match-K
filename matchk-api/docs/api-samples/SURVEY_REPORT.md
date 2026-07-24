# TourAPI 실사 리포트 (이 파일 전체를 Claude에게 붙여넣기)

실행일: 2026-07-13

| API | 시도 | 결과 |
|---|---|---|
| 1_국문_관광정보 | `KorService2/areaBasedList2` | ✅ OK (782건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |
| 2_영문 | `EngService2/areaBasedList2` | ✅ OK (202건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |
| 3_일문 | `JpnService2/areaBasedList2` | ✅ OK (203건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |
| 4_중문간체 | `ChsService2/areaBasedList2` | ✅ OK (189건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |
| 5_중문번체 | `ChtService2/areaBasedList2` | ✅ OK (167건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |

## 부산 시군구 코드 (areaCode2) — OK (16건)

- 1 = 강서구
- 2 = 금정구
- 3 = 기장군
- 4 = 남구
- 5 = 동구
- 6 = 동래구
- 7 = 부산진구
- 8 = 북구
- 9 = 사상구
- 10 = 사하구
- 11 = 서구
- 12 = 수영구
- 13 = 연제구
- 14 = 영도구
- 15 = 중구
- 16 = 해운대구
| 6_지역별_방문자수 | `DataLabService/locgoRegnVisitrDDList` | ✅ OK (0건) |
| 7_연관_관광지 | `TarRlteTarService1/areaBasedList1` | ❌ API 에러: {"responseTime":"2026-07-13T20:53:08.089","resultCode":"11","resultMsg":"NO_MANDATORY_REQUEST_PARAMETERS_ERROR1(signguCd |
| 7_연관_관광지 | `TarRlteTarService/areaBasedList` | ❌ HTTP 500: Unexpected errors
 |
| 8_집중률_예측 | `TatsCnctrRateService1/tatsCnctrRatedList1` | ❌ HTTP 500: Unexpected errors
 |
| 8_집중률_예측 | `CnctrRateService/areaBasedList` | ❌ HTTP 500: Unexpected errors
 |

> ❌인 항목은 공공데이터포털 마이페이지 > 해당 API > 상세기능(Swagger)에서
> 실제 엔드포인트 URL을 복사해서 리포트와 함께 전달해주세요.