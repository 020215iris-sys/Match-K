/** 단말기 내 거리 계산 (위치정보보호법: 위치를 서버로 보내지 않기 위해 앱에서 haversine).
 *  백엔드 app/services/geo_utils.py와 동일 공식. */
const R = 6371000; // 지구 반경 (m)

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 도장 인정 반경 (m) — 백엔드 GPS_RADIUS_M 기본값과 일치. 시연 빌드는 검증 생략.
export const STAMP_RADIUS_M = 100;
