/** 업적지도 (D4·D6 [A]) — 카카오맵 WebView + 구별 투명도 색칠 + 진행률 표시 (§6-7) */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';

import { DistrictProgress, endpoints } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice';
import { buildKakaoMapHtml } from '@/map/kakaoMapHtml';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

// D가 D3에 전달하는 GeoJSON (16개 구·군, properties.sigunguCode 필수).
// 실데이터 전까지는 features가 빈 플레이스홀더 → WebView가 폴백 동작.
// (동적 require는 Metro 번들 에러를 내므로 정적 import + 플레이스홀더 파일 방식)
import busanGeojson from '../../assets/busanDistricts.geojson.json';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AchievementMapScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [districts, setDistricts] = useState<DistrictProgress[]>([]);
  const [totals, setTotals] = useState({ stamped: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setError(null);
    endpoints
      .progress()
      .then((res) => {
        setDistricts(res.districts);
        setTotals({ stamped: res.totalStamped, total: res.totalLandmarks });
      })
      .catch((e: unknown) => {
        setDistricts([]);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [reloadKey]);

  const jsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const baseUrl = process.env.EXPO_PUBLIC_KAKAO_BASE_URL ?? 'https://localhost';
  const html = buildKakaoMapHtml(
    jsKey,
    districts.map((d) => ({ sigunguCode: d.sigunguCode, name: d.name, progress: d.progress })),
    busanGeojson,
  );

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {t('map.progress', { stamped: totals.stamped, total: totals.total })}
        </Text>
      </View>
      {error !== null && (
        <ErrorNotice detail={error} onRetry={() => setReloadKey((k) => k + 1)} />
      )}
      <WebView
        style={styles.web}
        originWhitelist={['*']}
        source={{ html, baseUrl }} // baseUrl = 카카오 콘솔 등록 도메인 (도메인 검증 우회)
        javaScriptEnabled
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'districtClick' && msg.sigunguCode) {
              navigation.navigate('DistrictLandmarks', {
                sigunguCode: Number(msg.sigunguCode),
                name: msg.name ?? '',
              });
            }
            if (msg.type === 'geojsonMissing') {
              console.warn('busanDistricts.geojson 미배치 — D의 D3 산출물 필요');
            }
          } catch {
            /* noop */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressBar: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface },
  progressText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  web: { flex: 1 },
});
