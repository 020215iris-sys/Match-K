/** 일정 상세 (2026-07-31 개편) — 1~N일차 섹션 + 맨 하단 장소추가.
 *  · addPlace 진입 시 '일차 선택' 모달 → 고른 일차에 담김 (홈발/스케줄러발 공통).
 *  · 항목 재정렬(▲▼)·삭제(🗑) — 실제 드래그앤드랍은 TODO(다은, 라이브러리 필요).
 *  · 2026-08-15 수정: chooseDay/reorder/remove 에러 핸들링 추가
 *    (실패 시 무피드백으로 넘어가던 문제 — Alert + 상태 유지/재동기화로 수정)
 *  · 백엔드에 dayIndex 범위 검증(400)이 추가됨에 따라 chooseDay는 서버 detail 메시지를
 *    그대로 보여주도록 보강 (alertFromError)
 *  · 뒤로가기를 항상 스케줄러 메인으로 커스텀. 하단 버튼 safe area 반영.
 *  · 항목 길게 누르면 이동할 일차를 고르는 모달 (전날/다음날 자유롭게 이동 가능)
 *
 *  ⚠️ 2026-08-15 롤백: react-native-draggable-flatlist 기반 실제 드래그앤드롭을
 *     시도했으나 reanimated 4.1.1 ↔ draggable-flatlist 4.0.3 버전 충돌로 Expo Go에서
 *     크래시(NativeWorklets/installTurboModule 에러) 발생. 팀 공유 일정상 우선 이 버전
 *     (롱프레스 모달 방식)으로 롤백. 드래그앤드롭은 reanimated 버전 고정 등 별도 해결 후
 *     재시도 예정 — react-native-draggable-flatlist, react-native-gesture-handler,
 *     react-native-reanimated 의존성은 package.json에 남아있어도 이 파일에서는 사용 안 함.
 */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { endpoints, ItineraryDetail as Itin, ItineraryItem } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

/** 400(day_index_out_of_range) 등 서버가 detail 메시지를 준 경우 그대로 보여주고,
 *  아니면 공통 에러 문구로 폴백. */
function alertFromError(t: (key: string) => string, err: unknown) {
  if (err instanceof ApiError && err.status === 400 && typeof (err.body as any)?.detail === 'string') {
    Alert.alert((err.body as any).detail as string);
    return;
  }
  Alert.alert(t('common.error'));
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ItinRoute = RouteProp<RootStackParamList, 'ItineraryDetail'>;

export default function ItineraryDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ItinRoute>();
  const insets = useSafeAreaInsets();
  const { itineraryId, addPlace } = route.params;
  const [data, setData] = useState<Itin | null>(null);
  // 길게 눌러 이동할 항목 — null이면 이동 모달 닫힘
  const [movingItem, setMovingItem] = useState<ItineraryItem | null>(null);

  const load = useCallback(() => {
    endpoints.itineraryDetail(itineraryId).then(setData).catch(() => setData(null));
  }, [itineraryId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 뒤로가기는 스케줄러 메인으로 — 단, navigate()로 매번 이동하면 스택이 계속 쌓이거나
  // 같은 두 화면을 오가며 goBack으로만 빠져나올 수 있는 상태가 됨(실제 발생한 버그).
  // 정상 진입 경로(스케줄러 → 일정상세)라면 그냥 goBack()이 스케줄러로 돌아가는 것과 동일하므로
  // goBack()을 우선 사용하고, 스택에 뒤로 갈 곳이 없는 예외적인 경우에만 navigate로 폴백.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('SchedulerMain', {});
            }
          }}
          hitSlop={10}
        >
          <Text style={styles.headerBack}>←</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  if (!data) return <Text style={styles.error}>{t('common.error')}</Text>;

  const dayCount = Math.max(1, data.dayCount);
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);
  const itemsByDay = (day: number): ItineraryItem[] =>
    data.items.filter((x) => x.dayIndex === day).sort((a, b) => a.sortOrder - b.sortOrder);

  // addPlace 일차 선택 (신규 항목 추가)
  const chooseDay = async (day: number) => {
    if (!addPlace) return;
    try {
      await endpoints.addItineraryItem(itineraryId, {
        contentid: addPlace.contentid, dayIndex: day,
        lat: addPlace.lat, lng: addPlace.lng,
        sigunguCode: addPlace.sigunguCode, title: addPlace.title,
      });
      navigation.setParams({ addPlace: undefined });
      load();
    } catch (err) {
      alertFromError(t, err);
    }
  };
  const cancelAdd = () => navigation.setParams({ addPlace: undefined });

  // 재정렬(같은 일차 내 순서)
  const reorder = async (item: ItineraryItem, dir: 'up' | 'down') => {
    const list = itemsByDay(item.dayIndex);
    const idx = list.findIndex((x) => x.id === item.id);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;
    const other = list[swap];
    try {
      await endpoints.moveItineraryItem(itineraryId, item.id, { sortOrder: other.sortOrder });
      await endpoints.moveItineraryItem(itineraryId, other.id, { sortOrder: item.sortOrder });
      load();
    } catch {
      Alert.alert(t('common.error'));
      load();
    }
  };

  // 항목을 다른 일차로 이동 — 길게 누르면 열리는 모달에서 원하는 일차를 고름
  const openMoveModal = (item: ItineraryItem) => setMovingItem(item);
  const closeMoveModal = () => setMovingItem(null);
  const moveToDay = async (day: number) => {
    if (!movingItem) return;
    if (day === movingItem.dayIndex) {
      closeMoveModal();
      return;
    }
    try {
      await endpoints.moveItineraryItem(itineraryId, movingItem.id, { dayIndex: day, sortOrder: 999 });
      closeMoveModal();
      load();
    } catch (err) {
      alertFromError(t, err);
    }
  };

  const remove = async (item: ItineraryItem) => {
    try {
      await endpoints.deleteItineraryItem(itineraryId, item.id);
      load();
    } catch {
      Alert.alert(t('common.error'));
    }
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
                    onLongPress={() => openMoveModal(it)}
                    delayLongPress={350}
                  >
                    <Text style={styles.itemTitle} numberOfLines={1}>{it.title ?? it.contentid}</Text>
                  </Pressable>
                  <View style={styles.itemCtrls}>
                    <Pressable onPress={() => reorder(it, 'up')} hitSlop={6}><Text style={styles.ctrl}>▲</Text></Pressable>
                    <Pressable onPress={() => reorder(it, 'down')} hitSlop={6}><Text style={styles.ctrl}>▼</Text></Pressable>
                    <Pressable onPress={() => remove(it)} hitSlop={6}><Text style={styles.ctrlDel}>🗑</Text></Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ))}
        <Text style={styles.hint}>{t('scheduler.reorderHint')}</Text>
      </ScrollView>

      {/* 장소추가 — 맨 하단 하나. 검색 화면(담기 모드)으로 이동. 하단 안전영역만큼 띄움 */}
      <Pressable
        style={[styles.addBtn, { bottom: 24 + insets.bottom }]}
        onPress={() => navigation.navigate('Search', { pick: { itineraryId } })}
      >
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

      {/* 일차 이동 모달 (항목 길게 누르면 오픈) */}
      <Modal transparent visible={!!movingItem} animationType="fade" onRequestClose={closeMoveModal}>
        <Pressable style={styles.backdrop} onPress={closeMoveModal}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('scheduler.moveToDay')}</Text>
            {days.map((d) => (
              <Pressable
                key={d}
                style={[styles.dayBtn, movingItem?.dayIndex === d ? styles.dayBtnCurrent : null]}
                onPress={() => moveToDay(d)}
              >
                <Text style={styles.dayBtnText}>
                  {t('scheduler.dayN', { n: d })}
                  {movingItem?.dayIndex === d ? ` (${t('scheduler.currentDay')})` : ''}
                </Text>
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
  headerBack: { fontSize: 22, color: colors.primary, paddingHorizontal: 8 },
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
    position: 'absolute', left: 20, right: 20,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  dayBtn: {
    backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8,
  },
  dayBtnCurrent: { opacity: 0.5 },
  dayBtnText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
});
