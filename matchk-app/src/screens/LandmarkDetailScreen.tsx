/** 랜드마크 상세 (홈 검색발) — 사진·위치·설명 + 일정추가 버튼.
 *  ⚠️ 도장 기능은 업적지도로 이동 (2026-07-31 개편). 여기선 도장 없음. */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<RootStackParamList, 'LandmarkDetail'>;

export default function LandmarkDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<DetailRoute>();
  const navigation = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);
  const [detail, setDetail] = useState<Record<string, string> | null>(null);
  const [translated, setTranslated] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    endpoints
      .landmarkDetail(route.params.contentid, lang)
      .then((res) => {
        setDetail(res.detail);
        setTranslated(res.translated ?? false);
        setCoords(res.stampLat != null && res.stampLng != null
          ? { lat: res.stampLat, lng: res.stampLng } : null);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [route.params.contentid, lang]);

  // 일정추가 — 스케줄러로 이동해 파일 선택(없으면 생성) → 일차 선택 후 담김.
  const addToItinerary = () => {
    navigation.navigate('SchedulerMain', {
      addPlace: {
        contentid: route.params.contentid,
        title: detail?.title ?? route.params.title,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      },
    });
  };

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (!detail) return <Text style={styles.error}>{t('common.error')}</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.body}>
      {detail.firstimage ? (
        <Image source={{ uri: detail.firstimage }} style={styles.image} resizeMode="cover" />
      ) : null}
      <Text style={styles.title}>{detail.title}</Text>
      {translated ? <Text style={styles.translatedBadge}>{t('detail.autoTranslated')}</Text> : null}
      {detail.addr1 ? <Text style={styles.addr}>{detail.addr1}</Text> : null}
      {detail.overview ? <Text style={styles.overview}>{detail.overview}</Text> : null}

      <Pressable style={styles.addBtn} onPress={addToItinerary}>
        <Text style={styles.addBtnText}>➕ {t('detail.addToItinerary')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 48 },
  loader: { marginTop: 60 },
  error: { marginTop: 60, textAlign: 'center', color: colors.textSecondary },
  image: { width: '100%', height: 220, borderRadius: 16 },
  title: { marginTop: 16, fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  translatedBadge: { marginTop: 6, fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },
  addr: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  overview: { marginTop: 14, fontSize: 15, lineHeight: 23, color: colors.textPrimary },
  addBtn: {
    marginTop: 28, backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
