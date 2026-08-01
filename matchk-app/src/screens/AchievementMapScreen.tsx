/** 업적지도 ① 전체지도 (2026-07-31 개편) — 부산 한 덩어리. 탭하면 구지도(②)로.
 *  ⚠️ 이미지 기반 — 기존 카카오 WebView 제거. TODO(현표): 부산 전체지도 이미지 삽입. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

      {/* TODO(현표): 부산 전체지도 이미지 (탭 → 구지도). 지금은 플레이스홀더. */}
      <Pressable style={styles.mapPlaceholder} onPress={() => navigation.navigate('AchievementDistricts')}>
        <Text style={styles.mapEmoji}>🗺️</Text>
        <Text style={styles.mapHint}>{t('map.tapBusan')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressBar: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface },
  progressText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  mapPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mapEmoji: { fontSize: 80 },
  mapHint: { marginTop: 16, fontSize: 15, color: colors.textSecondary },
});
