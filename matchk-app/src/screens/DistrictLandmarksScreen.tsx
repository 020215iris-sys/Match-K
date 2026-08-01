/** 업적지도 ③ 구 상세 (2026-07-31 개편) — 상단 구 지도 + 하단 도장 리스트 (네이버지도식).
 *  · 도장: 진입 시 포그라운드 원샷 GPS로 근처 안 찍힌 장소 자동 도장 (폰 내 계산, 위치 서버 전송 X).
 *  · 히든: 구 도장 비율(hiddenReady) 달성 시 배너 노출. 히든 도장은 리스트 최상단 고정.
 *  TODO(현표): 구별 지도 이미지 삽입, 도장 애니메이션/진동, 히든 팝업(대상 contentid는 백엔드 지정 후). */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, TourItem } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice';
import { haversineM, STAMP_RADIUS_M } from '@/utils/geo';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

// 시연 빌드에서만 true (GPS 없이 도장 시연 — 부산 외 발표 대비)
const DEMO_STAMP = process.env.EXPO_PUBLIC_DEMO_STAMP === 'true';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DistrictRoute = RouteProp<RootStackParamList, 'DistrictLandmarks'>;

export default function DistrictLandmarksScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<DistrictRoute>();
  const lang = useAppStore((s) => s.lang);
  const { sigunguCode, name } = route.params;

  const [items, setItems] = useState<TourItem[]>([]);
  const [stampedIds, setStampedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [hiddenReady, setHiddenReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [list, status] = await Promise.all([
          endpoints.landmarksByDistrict(sigunguCode, lang, 12), // 관광지 타입(도장 대상)만
          endpoints.districtStampStatus(sigunguCode).catch(() => null),
        ]);
        if (!active) return;
        setItems(list.items);
        const stamped = new Set(status?.stampedContentIds ?? []);
        setHiddenIds(new Set(status?.hiddenStampedContentIds ?? []));
        setHiddenReady(status?.hiddenReady ?? false);

        // ── 포그라운드 원샷 GPS 자동 도장 ───────────────────────
        // 위치를 딱 한 번 읽어, 근처(<반경) 안 찍힌 장소를 자동으로 찍는다.
        // 거리 계산은 단말기 내에서만 (위치정보보호법). 백그라운드 추적 없음.
        if (!DEMO_STAMP) {
          try {
            const { status: perm } = await Location.requestForegroundPermissionsAsync();
            if (perm === 'granted') {
              const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
              for (const it of list.items) {
                if (stamped.has(it.contentid) || !it.mapx || !it.mapy) continue;
                const d = haversineM(
                  pos.coords.latitude, pos.coords.longitude, Number(it.mapy), Number(it.mapx));
                if (d <= STAMP_RADIUS_M) {
                  try {
                    await endpoints.createStamp(it.contentid); // 서버엔 contentid만
                    stamped.add(it.contentid);
                  } catch {
                    /* 이미 찍혔거나 seed에 없는 장소 — 무시 */
                  }
                }
              }
            }
          } catch {
            /* GPS 실패 — 자동 도장 생략 */
          }
        }
        if (active) setStampedIds(stamped);
      } catch (e: unknown) {
        if (!active) return;
        setItems([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [sigunguCode, lang, reloadKey]);

  // 히든 도장은 리스트 최상단 고정
  const ordered = [...items].sort(
    (a, b) => (hiddenIds.has(b.contentid) ? 1 : 0) - (hiddenIds.has(a.contentid) ? 1 : 0),
  );

  if (loading) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  return (
    <View style={styles.container}>
      {/* 상단: 그 구 지도 (플레이스홀더) — TODO(현표): 구별 지도 이미지 + 관광지 위치 */}
      <View style={styles.mapArea}>
        <Text style={styles.mapEmoji}>📍 {name}</Text>
      </View>

      {hiddenReady ? (
        <View style={styles.hiddenBanner}>
          {/* TODO(현표): 히든 조우 팝업(HiddenEncounterPopup 재활용) — "찍겠습니까?" (대상 contentid 백엔드 지정 후) */}
          <Text style={styles.hiddenBannerText}>✦ {t('map.hiddenReady')}</Text>
        </View>
      ) : null}

      {error !== null ? (
        <ErrorNotice detail={error} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listBody}
          data={ordered}
          keyExtractor={(i) => i.contentid}
          ListEmptyComponent={<Text style={styles.empty}>{t('search.noResults')}</Text>}
          renderItem={({ item }) => {
            const isStamped = stampedIds.has(item.contentid);
            const isHidden = hiddenIds.has(item.contentid);
            return (
              <Pressable
                style={styles.row}
                onPress={() => navigation.navigate('LandmarkDetail', { contentid: item.contentid, title: item.title })}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {isHidden ? '✦ ' : ''}{item.title}
                  </Text>
                  {item.addr1 ? <Text style={styles.rowAddr} numberOfLines={1}>{item.addr1}</Text> : null}
                </View>
                {/* 도장칸 — 찍힘: 금색 / 안 찍힘: 빈칸(점선) */}
                <View style={[styles.stampSlot, isStamped && styles.stampSlotDone]}>
                  <Text style={styles.stampMark}>{isStamped ? '✓' : ''}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: 60 },
  mapArea: {
    height: 200, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  mapEmoji: { fontSize: 20, fontWeight: '700', color: colors.textSecondary },
  hiddenBanner: { backgroundColor: colors.stampGold, paddingVertical: 10, alignItems: 'center' },
  hiddenBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { flex: 1 },
  listBody: { padding: 20 },
  empty: { marginTop: 40, textAlign: 'center', color: colors.textSecondary },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowBody: { flex: 1, marginRight: 12 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  stampSlot: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  stampSlotDone: { backgroundColor: colors.stampGold, borderStyle: 'solid', borderColor: colors.stampGold },
  stampMark: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
