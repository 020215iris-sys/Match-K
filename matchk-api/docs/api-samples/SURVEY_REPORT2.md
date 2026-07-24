# TourAPI 2차 실사 리포트 (전체를 Claude에게 붙여넣기)

실행일: 2026-07-13

| 항목 | 시도 | 결과 |
|---|---|---|
| A_방문자수_20260701 | `DataLabService/locgoRegnVisitrDDList` | ❌ API 에러: {"responseTime":"2026-07-13T21:00:01.773","resultCode":"10","resultMsg":"INVALID_REQUEST_PARAMETER_ERROR(areaCode)"} |
| A_방문자수_20260623 | `DataLabService/locgoRegnVisitrDDList` | ✅ OK (0건) |
| B_연관관광지_구16 | `TarRlteTarService1/areaBasedList1` | ✅ OK (0건) |
| B_연관관광지_구15 | `TarRlteTarService1/areaBasedList1` | ✅ OK (0건) |
| C_집중률 | `TatsCnctrRateService/tatsCnctrRatedList` | ❌ API 에러: {"responseTime":"2026-07-13T21:00:05.834","resultCode":"11","resultMsg":"NO_MANDATORY_REQUEST_PARAMETERS_ERROR1(areaCd)" |
| C_집중률 | `CnctrRateService1/cnctrRatedList1` | ❌ HTTP 500: Unexpected errors
 |
| C_집중률 | `TourCnctrRateService1/areaBasedList1` | ❌ HTTP 500: Unexpected errors
 |
| D_관광지1건 | `KorService2/areaBasedList2` | ✅ OK (156건) |
|  | 응답 필드 | `addr1, addr2, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy, mlevel, modifiedtime` |
|  | 첫 행 샘플 | `{"addr1": "부산광역시 강서구 외양포로 10", "addr2": "", "areacode": "6", "cat1": "A01", "cat2": "A0101", "cat3": "A01011600", "contentid": "129156", "contenttypeid": "12", "createdtime": "20060719090000", "firstimage": "http://tong.visitkorea.or.kr/cms/resource/81/3342781_image2_1.jpg", "firstimage2": "http://t` |
| D_상세(129156) | `KorService2/detailCommon2` | ✅ OK (1건) |
|  | 응답 필드 | `contentid, contenttypeid, title, createdtime, modifiedtime, tel, telname, homepage, firstimage, firstimage2, cpyrhtDivCd, areacode, sigungucode, lDongRegnCd, lDongSignguCd, lclsSystm1` |
|  | 첫 행 샘플 | `{"contentid": "129156", "contenttypeid": "12", "title": "가덕도 등대", "createdtime": "20060719090000", "modifiedtime": "20250318220404", "tel": "", "telname": "", "homepage": "<a href=\"https://www.bsgangseo.go.kr/visit/tour/view.do?touIdx=286&mId=0403020000\" target=\"_blank\" title=\"새창 : 부산 강서구 문화관광 ` |
| D_키워드검색 | `KorService2/searchKeyword2` | ✅ OK (19건) |
|  | 응답 필드 | `addr1, addr2, zipcode, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy, mlevel` |
|  | 첫 행 샘플 | `{"addr1": "부산광역시 해운대구 중동1로43번길 23", "addr2": "", "zipcode": "48095", "areacode": "6", "cat1": "A05", "cat2": "A0502", "cat3": "A05020100", "contentid": "2778487", "contenttypeid": "39", "createdtime": "20211124194514", "firstimage": "", "firstimage2": "", "cpyrhtDivCd": "", "mapx": "129.1645185529",` |
| D_위치기반 | `KorService2/locationBasedList2` | ✅ OK (84건) |
|  | 응답 필드 | `addr1, addr2, zipcode, areacode, cat1, cat2, cat3, contentid, contenttypeid, createdtime, dist, firstimage, firstimage2, cpyrhtDivCd, mapx, mapy` |
|  | 첫 행 샘플 | `{"addr1": "부산광역시 해운대구", "addr2": "우동, 중동, 송정동, 재송동 센텀시티 지역", "zipcode": "612-020,1", "areacode": "6", "cat1": "A02", "cat2": "A0202", "cat3": "A02020200", "contentid": "127004", "contenttypeid": "12", "createdtime": "20031215090000", "dist": "55.42224534505327", "firstimage": "http://tong.visitkorea` |

> C(집중률)가 전부 ❌면: 공공데이터포털 마이페이지 > 관광지 집중률 API > 상세기능에서
> Swagger의 실제 요청 URL을 복사해 함께 전달 (P2라 없어도 개발 진행에 지장 없음)