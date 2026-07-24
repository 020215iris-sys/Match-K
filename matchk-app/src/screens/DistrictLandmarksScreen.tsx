/** 구별 랜드마크 리스트 (§6-7) — 업적지도에서 구 탭 시 진입.
 *  그 구의 도장 대상(관광지 타입) 목록을 실시간 호출로 표시. */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, TourItem } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DistrictRoute = RouteProp<RootStackParamList, 'DistrictLandmarks'>;

export default function DistrictLandmarksScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<DistrictRoute>();
  const lang = useAppStore((s) => s.lang);
  const [items, setItems] = useState<TourItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    endpoints
      .landmarksByDistrict(route.params.sigunguCode, lang, 12) // 관광지 타입(도장 대상)만
      .then((res) => setItems(res.items))
      .catch((e: unknown) => {
        setItems([]);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [route.params.sigunguCode, lang, reloadKey]);

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (error !== null) {
    return (
      <View style={[styles.container, styles.list]}>
        <ErrorNotice detail={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={items}
      keyExtractor={(i) => i.contentid}
      ListEmptyComponent={<Text style={styles.empty}>{t('search.noResults')}</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('LandmarkDetail', { contentid: item.contentid, title: item.title })}
        >
          {item.firstimage ? (
            <Image source={{ uri: item.firstimage }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
            {item.addr1 ? <Text style={styles.rowAddr} numberOfLines={1}>{item.addr1}</Text> : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 20 },
  loader: { marginTop: 60 },
  empty: { marginTop: 40, textAlign: 'center', color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surface },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  rowBody: { flex: 1, marginLeft: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
