/** 업적지도 ② 구지도 (신규, 2026-07-31 개편) — 부산이 구별로 쪼개진 지도.
 *  지금은 구 그리드(진행률만큼 색칠 게이지)로 플레이스홀더. 구 탭 → 구 상세(③).
 *  TODO(현표): 실제 구별 지도 이미지/폴리곤으로 교체. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { DistrictProgress, endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function AchievementDistrictsScreen() {
  const navigation = useNavigation<Nav>();
  const [districts, setDistricts] = useState<DistrictProgress[]>([]);

  useEffect(() => {
    endpoints.progress().then((r) => setDistricts(r.districts)).catch(() => setDistricts([]));
  }, []);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.grid}
      data={districts}
      numColumns={2}
      keyExtractor={(d) => String(d.sigunguCode)}
      renderItem={({ item }) => (
        <Pressable
          style={[styles.cell, item.isDeclining && styles.cellDeclining]}
          onPress={() => navigation.navigate('DistrictLandmarks', { sigunguCode: item.sigunguCode, name: item.name })}
        >
          <Text style={styles.cellName}>{item.name}</Text>
          <Text style={styles.cellMeta}>{item.stamped}/{item.total}</Text>
          <View style={styles.gauge}>
            <View style={[styles.gaugeFill, { width: `${Math.round(item.progress * 100)}%` }]} />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  grid: { padding: 12 },
  cell: {
    flex: 1, margin: 6, backgroundColor: colors.surface, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  cellDeclining: { borderColor: colors.stampGold }, // 소멸위험 구 강조 (로컬 스팟)
  cellName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cellMeta: { marginTop: 4, fontSize: 12, color: colors.textSecondary },
  gauge: { marginTop: 10, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  gaugeFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
