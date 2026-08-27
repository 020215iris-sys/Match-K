/** 업적지도 ③ 구 상세 (2026-07-31 개편) — 상단 구 지도 + 하단 도장 리스트 (네이버지도식).
 *  · 도장: 진입 시 포그라운드 원샷 GPS로 근처 안 찍힌 장소 자동 도장 (폰 내 계산, 위치 서버 전송 X).
 *  · 히든: 구 도장 비율(hiddenReady) 달성 시 배너 노출 → 탭하면 팝업("찍겠습니까?").
 *    2026-08 개편: GPS 근접 감지 폐기, 대상 contentid는 백엔드가 지정(hiddenTargetContentId).
 *  TODO(현표): 구별 지도 이미지 삽입(현재 이모지 플레이스홀더 — 디자인팀 일러스트 대기). */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, TourItem } from '@/api/endpoints';
import ErrorNotice from '@/components/ErrorNotice';
import HiddenEncounterPopup from '@/components/HiddenEncounterPopup';
import { useHiddenEncounter } from '@/hooks/useHiddenEncounter';
import { haversineM, STAMP_RADIUS_M } from '@/utils/geo';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

// 시연 빌드에서만 true (GPS 없이 도장 시연 — 부산 외 발표 대비)
const DEMO_STAMP = process.env.EXPO_PUBLIC_DEMO_STAMP === 'true';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type DistrictRoute = RouteProp<RootStackParamList, 'DistrictLandmarks'>;

/** 도장칸 한 줄 — 방금 찍힌 순간엔 팝(pop) 애니메이션, 이미 찍혀있던 건 정적으로 표시. */
function StampSlot({ isStamped, justStamped }: { isStamped: boolean; justStamped: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (justStamped) {
      pop.setValue(0.3);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
  }, [justStamped, pop]);

  return (
    <Animated.View
      style={[
        styles.stampSlot,
        isStamped && styles.stampSlotDone,
        justStamped && { transform: [{ scale: pop }] },
      ]}
    >
      <Text style={styles.stampMark}>{isStamped ? '✓' : ''}</Text>
    </Animated.View>
  );
}

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
  const [hiddenTargetId, setHiddenTargetId] = useState<string | null>(null);
  const [justStampedId, setJustStampedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const hidden = useHiddenEncounter({ hiddenReady, targetContentId: hiddenTargetId });

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
        setHiddenTargetId(status?.hiddenTargetContentId ?? null);

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
                    if (active) setJustStampedId(it.contentid);
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

      {hidden.canOpen ? (
        <Pressable style={styles.hiddenBanner} onPress={hidden.open}>
          <Text style={styles.hiddenBannerText}>✦ {t('map.hiddenReady')}</Text>
          <Text style={styles.hiddenBannerHint}>{t('map.hiddenBannerHint')}</Text>
        </Pressable>
      ) : null}

      {hidden.visible && hidden.targetContentId ? (
        <HiddenEncounterPopup
          contentid={hidden.targetContentId}
          lang={lang}
          collecting={hidden.collecting}
          onDismiss={hidden.dismiss}
          onCollect={() =>
            hidden.collect((collectedId) => {
              setHiddenIds((prev) => new Set(prev).add(collectedId));
              setJustStampedId(collectedId);
              // 이 구에 남은 히든이 있으면 다음 대상을 다시 조회 (배너가 이어서 열리도록)
              endpoints.districtStampStatus(sigunguCode)
                .then((s) => setHiddenTargetId(s.hiddenTargetContentId))
                .catch(() => setHiddenTargetId(null));
            })
          }
        />
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
                {/* 도장칸 — 찍힘: 금색(+방금 찍힌 경우 팝 애니메이션) / 안 찍힘: 빈칸(점선) */}
                <StampSlot isStamped={isStamped} justStamped={justStampedId === item.contentid} />
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
  hiddenBannerHint: { color: '#fff', fontSize: 11, marginTop: 2, opacity: 0.85 },
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
