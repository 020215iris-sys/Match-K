/** 업적지도 ① 전체지도 (2026-07-31 개편) — 부산 한 덩어리. 탭하면 구지도(②)로.
 *  ⚠️ 이미지 기반 — 기존 카카오 WebView 제거.
 *  지금은 assets/maps/busan-full.png(플레이스홀더 일러스트)를 쓴다.
 *  디자인팀 확정 일러스트가 나오면 같은 파일명으로 교체만 하면 됨 — 코드 변경 불필요. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AchievementMapScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [totals, setTotals] = useState({ stamped: 0, total: 0 });

  useEffect(() => {
    endpoints
      .progress()
      .then((r) => setTotals({ stamped: r.totalStamped, total: r.totalLandmarks }))
      .catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {t('map.progress', { stamped: totals.stamped, total: totals.total })}
        </Text>
      </View>

      <Pressable
        style={styles.mapWrap}
        onPress={() => navigation.navigate('AchievementDistricts')}
        accessibilityRole="button"
        accessibilityLabel={t('map.tapBusan')}
      >
        <Image
          source={require('../../assets/maps/busan-full.png')}
          style={styles.mapImage}
          resizeMode="contain"
        />
        <View style={styles.hintBadge}>
          <Text style={styles.mapHint}>{t('map.tapBusan')}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressBar: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface },
  progressText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  mapWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  mapImage: { width: '100%', height: '100%' },
  hintBadge: {
    position: 'absolute', bottom: 28, alignSelf: 'center',
    backgroundColor: colors.background, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  mapHint: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
});
