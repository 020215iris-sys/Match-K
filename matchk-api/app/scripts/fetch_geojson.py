"""부산 구·군 경계 GeoJSON 자동 준비 (D3 [D] 자동화).

공개 행정경계 데이터(southkorea-maps, KOSTAT 2013 간소화판)에서 부산 16개 구·군을
추출하고, 앱이 기대하는 형식(properties.sigunguCode = TourAPI 코드 1~16)으로 변환해
matchk-app/assets/busanDistricts.geojson.json 에 저장한다.

사용법 (matchk-api 폴더에서): python -m app.scripts.fetch_geojson
완료 후: Expo 재시작하면 업적지도에 폴리곤 색칠이 나타남
"""
import json
from pathlib import Path

import httpx

SRC_URL = ("https://raw.githubusercontent.com/southkorea/southkorea-maps/"
           "master/kostat/2013/json/skorea_municipalities_geo_simple.json")
OUT = Path("../matchk-app/assets/busanDistricts.geojson.json")

# KOSTAT 2013에서 부산 시군구 코드는 "21"로 시작. 구명 → TourAPI sigunguCode(실사 검증 완료)
NAME_TO_SIGUNGU = {
    "강서구": 1, "금정구": 2, "기장군": 3, "남구": 4, "동구": 5, "동래구": 6,
    "부산진구": 7, "북구": 8, "사상구": 9, "사하구": 10, "서구": 11, "수영구": 12,
    "연제구": 13, "영도구": 14, "중구": 15, "해운대구": 16,
}


def _round_coords(obj, ndigits: int = 4):
    """좌표 정밀도 축소 (용량 절감, WebView 성능)."""
    if isinstance(obj, list):
        if obj and isinstance(obj[0], (int, float)):
            return [round(x, ndigits) for x in obj]
        return [_round_coords(x, ndigits) for x in obj]
    return obj


def main() -> None:
    print("다운로드 중...", SRC_URL)
    r = httpx.get(SRC_URL, timeout=60, follow_redirects=True)
    r.raise_for_status()
    src = r.json()

    features = []
    for f in src.get("features", []):
        props = f.get("properties", {})
        code = str(props.get("code", ""))
        name = str(props.get("name", ""))
        if not code.startswith("21") or len(code) != 5:
            continue  # 부산 외 지역
        sigungu = NAME_TO_SIGUNGU.get(name)
        if sigungu is None:
            print(f"  [!] 매핑 실패 (스킵): {code} {name}")
            continue
        features.append({
            "type": "Feature",
            "properties": {"sigunguCode": sigungu, "name": name},
            "geometry": {
                "type": f["geometry"]["type"],
                "coordinates": _round_coords(f["geometry"]["coordinates"]),
            },
        })

    if len(features) != 16:
        print(f"[!] 경고: 16개가 아니라 {len(features)}개 추출됨 — 결과 확인 필요")

    out = {"type": "FeatureCollection", "features": features}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    size_kb = OUT.stat().st_size // 1024
    print(f"[완료] {OUT.resolve()} — {len(features)}개 구·군, {size_kb}KB")
    print("다음: Expo 재시작(npx expo start -c)하면 업적지도 폴리곤이 나타남")


if __name__ == "__main__":
    main()
