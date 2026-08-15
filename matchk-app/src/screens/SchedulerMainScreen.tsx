/** 스케줄러 메인 (2026-07-31 개편) — 일정 파일 리스트 + 새 일정.
 *  addPlace 파라미터가 있으면 '담을 일정 고르기' 모드 (홈 검색발 진입).
 *
 *  2026-08-15 수정:
 *  · 여행기간 입력 시 하이픈 없이(예: 20280817) 쳐도 자동으로 2028-08-17로 변환 후 전송.
 *    (숫자 8자리가 아니면 원본 그대로 보내 서버 검증에 맡김 — 추후 달력 UI 추가 시 이 로직 그대로 재사용 가능)
 *  · 시작일이 종료일보다 늦은 경우 등 명백히 잘못된 값은 API 호출 전에 바로 안내.
 *  · create() 실패 시 무조건 "네트워크/서버 확인" 문구만 뜨던 것을, 서버가 detail을 주면
 *    그 메시지를 그대로 보여주도록 수정 (실제 원인은 날짜 형식 오류였는데 네트워크 문제로 오인되던 버그).
 *  · 일정 생성 폼이 키보드에 가려지는 문제 — 폼을 ScrollView로 감싸고 KeyboardAvoidingView
 *    behavior/offset을 조정해 날짜 입력 필드까지 스크롤해서 볼 수 있게 수정.
 *  · 2026-08-15 재수정 (QA 피드백): FAB(＋)가 제스처 내비게이션 바와 겹치는 문제 —
 *    safe area insets 반영.
 */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { endpoints, ItinerarySummary } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SchedRoute = RouteProp<RootStackParamList, 'SchedulerMain'>;

/** "20280817" 같은 숫자 8자리 입력을 "2028-08-17"로 변환.
 *  이미 하이픈이 있거나 8자리가 아니면 원본을 그대로 반환(서버 검증에 맡김).
 *  → 추후 달력 UI를 붙여도 텍스트 입력 경로에서 계속 재사용 가능. */
function normalizeDateInput(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 8 && digitsOnly === trimmed.replace(/-/g, '')) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
  }
  return trimmed;
}

/** 400 + detail 메시지가 있으면 그대로, 아니면 공통 에러 문구로 폴백. */
function alertFromError(t: (key: string) => string, err: unknown) {
  if (err instanceof ApiError && err.status === 400 && typeof (err.body as any)?.detail === 'string') {
    Alert.alert((err.body as any).detail as string);
    return;
  }
  if (err instanceof ApiError && err.status === 422) {
    // Pydantic 날짜 파싱 실패 등 — 원인이 형식 문제임을 명시
    Alert.alert(t('scheduler.dateFormatError'));
    return;
  }
  Alert.alert(t('common.error'));
}

export default function SchedulerMainScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<SchedRoute>();
  const insets = useSafeAreaInsets();
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

    const startDate = start.trim() ? normalizeDateInput(start) : undefined;
    const endDate = end.trim() ? normalizeDateInput(end) : undefined;

    // 둘 다 있을 때 시작일 > 종료일이면 API 호출 전에 바로 막기
    if (startDate && endDate && startDate > endDate) {
      Alert.alert(t('scheduler.dateRangeError'));
      return;
    }

    // 여행기간(YYYY-MM-DD)을 넣으면 일차 수(dayCount)가 자동 산출됨. 비우면 1일.
    try {
      const res = await endpoints.createItinerary(name.trim(), startDate, endDate);
      setName('');
      setStart('');
      setEnd('');
      setCreating(false);
      navigation.navigate('ItineraryDetail', { itineraryId: res.id, addPlace });
    } catch (err) {
      alertFromError(t, err);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {addPlace ? <Text style={styles.banner}>{t('scheduler.pickTarget')}</Text> : null}

      {creating ? (
        // 생성 폼: 목록은 숨기고 폼 전체를 스크롤 가능한 영역으로 — 키보드가 떠도 날짜 입력까지 스크롤해서 보임
        <ScrollView
          style={styles.createScroll}
          contentContainerStyle={styles.createBox}
          keyboardShouldPersistTaps="handled"
        >
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
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.input, styles.dateInput, styles.dateInputRight]}
              placeholder={t('scheduler.endDate')}
              placeholderTextColor={colors.textSecondary}
              value={end}
              onChangeText={setEnd}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Text style={styles.dateHint}>{t('scheduler.dateHint')}</Text>

          <Pressable style={styles.createBtnWide} onPress={create}>
            <Text style={styles.createBtnText}>{t('common.create')}</Text>
          </Pressable>
          <Pressable style={styles.cancelBtn} onPress={() => setCreating(false)}>
            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
          </Pressable>
        </ScrollView>
      ) : items.length === 0 ? (
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

      {!creating && items.length > 0 ? (
        <Pressable
          style={[styles.fab, { bottom: 28 + insets.bottom }]}
          onPress={() => setCreating(true)}
        >
          <Text style={styles.fabText}>＋</Text>
        </Pressable>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  banner: {
    backgroundColor: colors.surface,
    color: colors.primary,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 14,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusBig: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusBigText: { color: '#fff', fontSize: 44, lineHeight: 48 },
  emptyLabel: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  list: { padding: 20 },
  fileRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  fileMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
  },
  createScroll: { flex: 1 },
  createBox: {
    padding: 16,
    flexGrow: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  dateRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  dateInput: {
    flex: 1,
  },
  dateInputRight: {
    marginLeft: 10,
  },
  dateHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
  },
  createBtnWide: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  fabText: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 38,
  },
});
