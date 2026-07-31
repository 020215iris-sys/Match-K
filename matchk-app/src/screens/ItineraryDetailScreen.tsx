/** 일정 상세 (2026-07-31 개편) — 1~N일차 섹션 + 맨 하단 장소추가.
 *  · addPlace 진입 시 '일차 선택' 모달 → 고른 일차에 담김 (홈발/스케줄러발 공통).
 *  · 항목 재정렬(▲▼)·다음 일차로 이동(▶日)·삭제(🗑) — 실제 드래그앤드랍은 TODO(다은, 라이브러리 필요). */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, ItineraryDetail as Itin, ItineraryItem } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ItinRoute = RouteProp<RootStackParamList, 'ItineraryDetail'>;

export default function ItineraryDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ItinRoute>();
  const { itineraryId, addPlace } = route.params;
  const [data, setData] = useState<Itin | null>(null);

  const load = useCallback(() => {
    endpoints.itineraryDetail(itineraryId).then(setData).catch(() => setData(null));
  }, [itineraryId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!data) return <Text style={styles.error}>{t('common.error')}</Text>;

  const dayCount = Math.max(1, data.dayCount);
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);
  const itemsByDay = (day: number): ItineraryItem[] =>
    data.items.filter((x) => x.dayIndex === day).sort((a, b) => a.sortOrder - b.sortOrder);

  // addPlace 일차 선택
  const chooseDay = async (day: number) => {
    if (!addPlace) return;
    await endpoints
      .addItineraryItem(itineraryId, {
        contentid: addPlace.contentid, dayIndex: day,
        lat: addPlace.lat, lng: addPlace.lng,
        sigunguCode: addPlace.sigunguCode, title: addPlace.title,
      })
      .catch(() => {});
    navigation.setParams({ addPlace: undefined });
    load();
  };
  const cancelAdd = () => navigation.setParams({ addPlace: undefined });

  // 재정렬/이동/삭제 (드래그 대체 — 실제 DnD는 TODO 다은)
  const reorder = async (item: ItineraryItem, dir: 'up' | 'down') => {
    const list = itemsByDay(item.dayIndex);
    const idx = list.findIndex((x) => x.id === item.id);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;
    const other = list[swap];
    await endpoints.moveItineraryItem(itineraryId, item.id, { sortOrder: other.sortOrder });
    await endpoints.moveItineraryItem(itineraryId, other.id, { sortOrder: item.sortOrder });
    load();
  };
  const moveNextDay = async (item: ItineraryItem) => {
    if (item.dayIndex >= dayCount) return;
    await endpoints.moveItineraryItem(itineraryId, item.id, { dayIndex: item.dayIndex + 1, sortOrder: 999 });
    load();
  };
  const remove = async (item: ItineraryItem) => {
    await endpoints.deleteItineraryItem(itineraryId, item.id);
    load();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{data.name}</Text>
        {days.map((d) => (
          <View key={d} style={styles.daySection}>
            <Text style={styles.dayTitle}>{t('scheduler.dayN', { n: d })}</Text>
            {itemsByDay(d).length === 0 ? (
              <Text style={styles.dayEmpty}>—</Text>
            ) : (
              itemsByDay(d).map((it) => (
                <View key={it.id} style={styles.itemRow}>
                  <Pressable
                    style={styles.itemMain}
                    onPress={() => navigation.navigate('LandmarkDetail', { contentid: it.contentid, title: it.title ?? '' })}
                  >
                    <Text style={styles.itemTitle} numberOfLines={1}>{it.title ?? it.contentid}</Text>
                  </Pressable>
                  <View style={styles.itemCtrls}>
                    <Pressable onPress={() => reorder(it, 'up')} hitSlop={6}><Text style={styles.ctrl}>▲</Text></Pressable>
                    <Pressable onPress={() => reorder(it, 'down')} hitSlop={6}><Text style={styles.ctrl}>▼</Text></Pressable>
                    {d < dayCount ? (
                      <Pressable onPress={() => moveNextDay(it)} hitSlop={6}><Text style={styles.ctrl}>▶日</Text></Pressable>
                    ) : null}
                    <Pressable onPress={() => remove(it)} hitSlop={6}><Text style={styles.ctrlDel}>🗑</Text></Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ))}
        <Text style={styles.hint}>{t('scheduler.reorderHint')}</Text>
      </ScrollView>

      {/* 장소추가 — 맨 하단 하나. 검색 화면(담기 모드)으로 이동 */}
      <Pressable style={styles.addBtn} onPress={() => navigation.navigate('Search', { pick: { itineraryId } })}>
        <Text style={styles.addBtnText}>➕ {t('scheduler.addPlace')}</Text>
      </Pressable>

      {/* 일차 선택 모달 (addPlace 진입 시) */}
      <Modal transparent visible={!!addPlace} animationType="fade" onRequestClose={cancelAdd}>
        <Pressable style={styles.backdrop} onPress={cancelAdd}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('scheduler.chooseDay')}</Text>
            {days.map((d) => (
              <Pressable key={d} style={styles.dayBtn} onPress={() => chooseDay(d)}>
                <Text style={styles.dayBtnText}>{t('scheduler.dayN', { n: d })}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  body: { padding: 20, paddingBottom: 96 },
  error: { marginTop: 60, textAlign: 'center', color: colors.textSecondary },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  daySection: { marginBottom: 20 },
  dayTitle: { fontSize: 15, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  dayEmpty: { fontSize: 14, color: colors.textSecondary, paddingVertical: 8 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  itemMain: { flex: 1, marginRight: 8 },
  itemTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemCtrls: { flexDirection: 'row', alignItems: 'center' },
  ctrl: { fontSize: 14, color: colors.textSecondary, paddingHorizontal: 5 },
  ctrlDel: { fontSize: 15, paddingHorizontal: 5 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  addBtn: {
    position: 'absolute', left: 20, right: 20, bottom: 24,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  dayBtn: {
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8,
  },
  dayBtnText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
});
