/** 업적지도 ② 목록 보기 (2026-08 개편) — 실제 지도(①)의 대안 화면.
 *  ①에서 구 타일을 직접 탭하면 바로 구 상세(③)로 가지만, 지도보다 목록으로
 *  쭉 훑어보고 싶은 사람을 위해 "리스트로 보기" 링크로 여기 들어올 수 있게 남겨둠.
 *  진행률 게이지 있는 2열 그리드. 구 탭 → 구 상세(③)로 가는 흐름은 그대로. */
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
