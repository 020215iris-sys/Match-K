/** 랜드마크 상세 (D8 [A]) — "여기 있어요" 버튼 → GPS 검증 → 도장 API.
 *  시연 모드: 백엔드 DEMO_MODE=true일 때 mock=true로 도장 가능 (부산 외 시연). */
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';
import { haversineM, STAMP_RADIUS_M } from '@/utils/geo';

// 시연 빌드에서만 true로 (D4 [B] 시연 모드와 세트)
const DEMO_STAMP = process.env.EXPO_PUBLIC_DEMO_STAMP === 'true';

type DetailRoute = RouteProp<RootStackParamList, 'LandmarkDetail'>;

export default function LandmarkDetailScreen() {
  const { t } = useTranslation();
  const route = useRoute<DetailRoute>();
  const lang = useAppStore((s) => s.lang);
  const [detail, setDetail] = useState<Record<string, string> | null>(null);
  const [stamped, setStamped] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState(false);

  useEffect(() => {
    endpoints
      .landmarkDetail(route.params.contentid, lang)
      .then((res) => {
        setDetail(res.detail);
        setStamped(res.stamped);
        setTranslated(res.translated ?? false);
        setCoords(res.stampLat != null && res.stampLng != null
          ? { lat: res.stampLat, lng: res.stampLng } : null);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [route.params.contentid, lang]);

  const stampHere = async () => {
    setStamping(true);
    try {
      // ⚠️ 위치정보보호법: GPS는 단말기 안에서만 쓰고 서버로 전송하지 않음.
      // 거리 검증을 여기서 끝내고, 서버엔 contentid만 보냄.
      if (!DEMO_STAMP) {
        if (!coords) throw new Error('no_coords');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('permission');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const distance = haversineM(
          pos.coords.latitude, pos.coords.longitude, coords.lat, coords.lng);
        if (distance > STAMP_RADIUS_M) {
          Alert.alert(t('detail.tooFar', { distance: Math.round(distance) }));
          return;
        }
      }
      await endpoints.createStamp(route.params.contentid);
      setStamped(true);
      Alert.alert('🎉', t('detail.stampSuccess')); // TODO(D7 [D]): 도장 애니메이션+진동
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setStamped(true);
      } else {
        Alert.alert(t('common.error'));
      }
    } finally {
      setStamping(false);
    }
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

      <Pressable
        style={[styles.stampBtn, stamped && styles.stampBtnDone]}
        onPress={stampHere}
        disabled={stamped || stamping}
      >
        <Text style={styles.stampBtnText}>
          {stamped ? `✅ ${t('detail.stamped')}` : `📍 ${t('detail.stampHere')}`}
        </Text>
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
  stampBtn: {
    marginTop: 28, backgroundColor: colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  stampBtnDone: { backgroundColor: colors.stampGold },
  stampBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
