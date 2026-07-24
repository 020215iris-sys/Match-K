/** Kakao Map WebView HTML 생성 (D4 [A]).
 *
 * - JS 키는 카카오 콘솔에 웹 도메인 등록 필수 → WebView source의 baseUrl을
 *   그 도메인으로 지정해 도메인 검증을 통과시킨다 (계획서 리스크 표).
 * - 구·군 폴리곤 GeoJSON은 D가 D3에 전달 (assets/busanDistricts.geojson.json).
 *   전달 전까지는 features가 빈 플레이스홀더 → 폴백 동작.
 * - RN ↔ WebView 통신: window.ReactNativeWebView.postMessage(JSON)
 */
export interface DistrictProgressForMap {
  sigunguCode: number;
  name: string;
  progress: number; // 0~1 → 투명도
}

export function buildKakaoMapHtml(
  jsKey: string,
  districts: DistrictProgressForMap[],
  geojson: object | null,
): string {
  const districtsJson = JSON.stringify(districts);
  const geojsonStr = JSON.stringify(geojson);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body,#map{margin:0;padding:0;width:100%;height:100%;}</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false"></script>
</head>
<body>
<div id="map"></div>
<script>
  var DISTRICTS = ${districtsJson};
  var GEOJSON = ${geojsonStr};
  var BUSAN_BLUE = '#185FA5';

  function progressToOpacity(p) {
    if (p <= 0) return 0.06;
    return Math.min(1, Math.max(0.2, p));
  }

  function notify(payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  kakao.maps.load(function () {
    var map = new kakao.maps.Map(document.getElementById('map'), {
      center: new kakao.maps.LatLng(35.1796, 129.0756),
      level: 9,
    });

    var byCode = {};
    DISTRICTS.forEach(function (d) { byCode[d.sigunguCode] = d; });

    if (GEOJSON && GEOJSON.features && GEOJSON.features.length > 0) {
      // 시/구 폴리곤 색칠 — 단색 투명도 방식 (스코프 v2 §3-1)
      GEOJSON.features.forEach(function (feature) {
        var code = feature.properties && feature.properties.sigunguCode;
        var d = byCode[code] || { progress: 0, name: (feature.properties || {}).name || '' };
        var rings = feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates; // MultiPolygon
        rings.forEach(function (polyCoords) {
          var path = polyCoords[0].map(function (c) { return new kakao.maps.LatLng(c[1], c[0]); });
          var polygon = new kakao.maps.Polygon({
            map: map, path: path,
            strokeWeight: d.progress >= 1 ? 3 : 1.5, // 100% 구는 테두리 강조 (D6 [A])
            strokeColor: BUSAN_BLUE, strokeOpacity: 0.9,
            fillColor: BUSAN_BLUE, fillOpacity: progressToOpacity(d.progress),
          });
          kakao.maps.event.addListener(polygon, 'click', function () {
            notify({ type: 'districtClick', sigunguCode: code, name: d.name });
          });
        });
      });
    } else {
      // GeoJSON 미배치 시 폴백 (D의 D3 산출물 대기)
      notify({ type: 'geojsonMissing' });
    }
  });
</script>
</body>
</html>`;
}
