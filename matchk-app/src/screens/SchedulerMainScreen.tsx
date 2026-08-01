/** 스케줄러 메인 (2026-07-31 개편) — 일정 파일 리스트 + 새 일정.
 *  addPlace 파라미터가 있으면 '담을 일정 고르기' 모드 (홈 검색발 진입). */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, ItinerarySummary } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SchedRoute = RouteProp<RootStackParamList, 'SchedulerMain'>;

export default function SchedulerMainScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<SchedRoute>();
  const addPlace = route.params?.addPlace;

  const [items, setItems] = useState<ItinerarySummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const load = useCallback(() => {
    endpoints.itineraries().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openFile = (id: number) => {
    // 담기 모드면 addPlace를 함께 넘겨 일정 상세에서 담기
    navigation.navigate('ItineraryDetail', { itineraryId: id, addPlace });
  };

  const create = async () => {
    if (!name.trim()) return;
    // 여행기간(YYYY-MM-DD)을 넣으면 일차 수(dayCount)가 자동 산출됨. 비우면 1일.
    try {
      const res = await endpoints.createItinerary(
        name.trim(),
        start.trim() || undefined,
        end.trim() || undefined,
      );
      setName('');
      setStart('');
      setEnd('');
      setCreating(false);
      navigation.navigate('ItineraryDetail', { itineraryId: res.id, addPlace });
    } catch {
      Alert.alert(t('common.error'));
    }
  };

  return (
    <View style={styles.container}>
      {addPlace ? <Text style={styles.banner}>{t('scheduler.pickTarget')}</Text> : null}

      {items.length === 0 && !creating ? (
        <View style={styles.emptyWrap}>
          <Pressable style={styles.plusBig} onPress={() => setCreating(true)}>
            <Text style={styles.plusBigText}>＋</Text>
          </Pressable>
          <Text style={styles.emptyLabel}>{t('scheduler.addItinerary')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => String(i.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.fileRow} onPress={() => openFile(item.id)}>
              <Text style={styles.fileName}>{item.name}</Text>
              <Text style={styles.fileMeta}>
                {t('scheduler.dayCount', { count: item.dayCount })} · {item.itemCount}
              </Text>
            </Pressable>
          )}
        />
      )}

      {creating ? (
        <View style={styles.createBox}>
          <TextInput
            style={styles.input}
            placeholder={t('scheduler.namePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              placeholder={t('scheduler.startDate')}
              placeholderTextColor={colors.textSecondary}
              value={start}
              onChangeText={setStart}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.dateInput, styles.dateInputRight]}
              placeholder={t('scheduler.endDate')}
              placeholderTextColor={colors.textSecondary}
              value={end}
              onChangeText={setEnd}
              autoCapitalize="none"
            />
          </View>
          {/* TODO(다은): 텍스트 대신 캘린더 피커로 교체 (@react-native-community/datetimepicker 등) */}
          <Pressable style={styles.createBtnWide} onPress={create}>
            <Text style={styles.createBtnText}>{t('common.create')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.fab} onPress={() => setCreating(true)}>
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  banner: {
    backgroundColor: colors.surface, color: colors.primary, fontWeight: '700',
    paddingHorizontal: 20, paddingVertical: 12, fontSize: 14,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBig: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  plusBigText: { color: '#fff', fontSize: 44, lineHeight: 48 },
  emptyLabel: { marginTop: 14, fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  list: { padding: 20 },
  fileRow: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16, marginBottom: 12,
  },
  fileName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  fileMeta: { marginTop: 4, fontSize: 12, color: colors.textSecondary },
  createBox: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  input: {
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },
  dateRow: { flexDirection: 'row', marginTop: 10 },
  dateInput: { flex: 1 },
  dateInputRight: { marginLeft: 10 },
  createBtnWide: {
    marginTop: 10, backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 24, bottom: 28,
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  fabText: { color: '#fff', fontSize: 34, lineHeight: 38 },
});
