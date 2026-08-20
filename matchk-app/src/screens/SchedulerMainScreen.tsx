/** 스케줄러 메인 (2026-07-31 개편) — 일정 파일 리스트 + 새 일정.
 *  addPlace 파라미터가 있으면 '담을 일정 고르기' 모드 (홈 검색발 진입).
 *
 *  2026-08-15 수정:
 *  · 여행기간 입력 시 하이픈 없이(예: 20280817) 쳐도 자동으로 2028-08-17로 변환 후 전송.
 *  · 시작일이 종료일보다 늦은 경우 등 명백히 잘못된 값은 API 호출 전에 바로 안내.
 *  · create() 실패 시 서버 detail 메시지를 그대로 보여주도록 수정.
 *  · 일정 생성 폼이 키보드에 가려지는 문제 — ScrollView + KeyboardAvoidingView 조정.
 *  · FAB(＋)가 제스처 내비게이션 바와 겹치는 문제 — safe area insets 반영.
 *  · 달력 클릭으로도 날짜 입력 가능 (react-native-calendars, 순수 JS·Expo Go 호환).
 *  · 2026-08-15 재수정 (QA 피드백):
 *    - 달력을 별도 모달로 띄우던 것 → 입력창을 탭하면 그 아래 인라인으로 펼쳐지는 방식으로 변경.
 *      Modal이 아니므로 키보드/포커스를 가로채지 않아 직접 타이핑도 동시에 가능.
 *    - 달력 헤더(년/월)를 탭하면 년도 스크롤 + 월 그리드로 빠르게 이동할 수 있는 선택 화면 제공
 *      (화살표만으로 몇 년 뒤까지 넘기는 불편함 해소).
 *  · 2026-08-15 추가 QA 피드백 (다은):
 *    - 년도 선택 범위를 2099년까지 확장.
 *    - 일정 리스트 항목에 날짜 범위(시작일~종료일) 표시 추가 — dayCount/itemCount만 보이던 문제.
 *    - 일정 이름 미입력 / 시작·종료일 중 하나만 입력 / 날짜 형식 오류 시 각각 구체적인 안내 팝업 추가
 *      (기존엔 조건 미충족 시 그냥 아무 반응 없이 넘어가지 않아 사용자가 이유를 알 수 없었음).
 *    - 실제 드래그앤드랍(꾹 눌러서 순서/일차 이동)은 다은 담당으로 별도 진행 예정 — 이 파일에서는
 *      건드리지 않음.
 *  · 2026-08-15 추가: 오늘 이전 날짜는 선택 불가(minDate) + 년도 선택 범위를 오늘 연도~2099년으로.
 *    달력에서는 minDate로 과거 날짜 탭 자체가 막히고, 직접 타이핑 경로는 create() 제출 시
 *    별도로 오늘 이전인지 검증(datePastError).
 *  · 2026-08-20 버그 수정 (팀원 제보): 일정 생성 폼(creating=true)이 열린 상태에서 헤더
 *    뒤로가기를 누르면 폼만 닫혀야 하는데 앱 홈까지 나가버리던 문제. 기본 goBack()이
 *    creating 상태와 무관하게 무조건 스택을 pop해서 생긴 것 — creating 중엔 뒤로가기가
 *    폼을 닫기만(취소와 동일) 하도록 headerLeft 커스텀.
 */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
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
import { Calendar, type DateData } from 'react-native-calendars';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/api/client';
import { endpoints, ItinerarySummary } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SchedRoute = RouteProp<RootStackParamList, 'SchedulerMain'>;
type DateFieldKey = 'start' | 'end';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "20280817" 같은 숫자 8자리 입력을 "2028-08-17"로 변환.
 *  이미 하이픈이 있거나 8자리가 아니면 원본을 그대로 반환(서버 검증에 맡김). */
function normalizeDateInput(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 8 && digitsOnly === trimmed.replace(/-/g, '')) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
  }
  return trimmed;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 400 + detail 메시지가 있으면 그대로, 아니면 공통 에러 문구로 폴백. */
function alertFromError(t: (key: string) => string, err: unknown) {
  if (err instanceof ApiError && err.status === 400 && typeof (err.body as any)?.detail === 'string') {
    Alert.alert((err.body as any).detail as string);
    return;
  }
  if (err instanceof ApiError && err.status === 422) {
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

  // 생성 폼이 열려있을 땐 헤더 뒤로가기가 화면을 나가지 않고 폼만 닫도록(취소와 동일) 커스텀.
  // 기본 goBack()은 creating 여부와 무관하게 무조건 스택을 pop해서, 폼 작성 중 실수로
  // 앱 홈까지 나가버리는 문제가 있었음(팀원 제보).
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: creating
        ? () => (
            <Pressable onPress={() => setCreating(false)} hitSlop={10}>
              <Text style={styles.headerBack}>←</Text>
            </Pressable>
          )
        : undefined, // 목록 화면에서는 기본 뒤로가기(goBack) 그대로 사용
    });
  }, [navigation, creating]);

  // 달력 인라인 팝업 상태 — 어떤 필드(start/end)를 위해 펼쳐져 있는지, 어느 년/월을 보고 있는지,
  // 날짜 그리드인지 년/월 선택 그리드인지.
  const [activeField, setActiveField] = useState<DateFieldKey | null>(null);
  const [calendarAnchor, setCalendarAnchor] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  });
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonthNum, setViewMonthNum] = useState(() => new Date().getMonth() + 1);
  const [pickerMode, setPickerMode] = useState<'days' | 'yearMonth'>('days');

  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    const endYear = 2099;
    return Array.from({ length: endYear - cy + 1 }, (_, i) => cy + i);
  }, []);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const load = useCallback(() => {
    endpoints.itineraries().then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openFile = (id: number) => {
    // 담기 모드면 addPlace를 함께 넘겨 일정 상세에서 담기
    navigation.navigate('ItineraryDetail', { itineraryId: id, addPlace });
  };

  // 입력창을 탭하면(포커스) 그 필드용 달력을 인라인으로 펼침. 이미 유효한 날짜가 있으면
  // 그 달로, 없으면 이전에 보던 달(또는 오늘)을 유지. 오늘 이전 달로는 열리지 않게 클램프.
  const todayYear = new Date().getFullYear();
  const todayMonth = new Date().getMonth() + 1;
  const clampToToday = (y: number, m: number): [number, number] =>
    y < todayYear || (y === todayYear && m < todayMonth) ? [todayYear, todayMonth] : [y, m];

  const openField = (field: DateFieldKey) => {
    const raw = field === 'start' ? start : end;
    const normalized = normalizeDateInput(raw);
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
    const [rawY, rawM] = valid ? normalized.split('-').map(Number) : [viewYear, viewMonthNum];
    const [y, m] = clampToToday(rawY, rawM);
    setCalendarAnchor(`${y}-${pad2(m)}-01`);
    setViewYear(y);
    setViewMonthNum(m);
    setPickerMode('days');
    setActiveField(field);
  };
  const closeField = () => setActiveField(null);

  const handleMonthChange = (m: DateData) => {
    setViewYear(m.year);
    setViewMonthNum(m.month);
  };

  const handleDayPress = (day: DateData) => {
    if (activeField === 'start') setStart(day.dateString);
    if (activeField === 'end') setEnd(day.dateString);
    setActiveField(null);
  };

  // 년/월 선택 그리드에서 월을 고르면 그 달로 점프(react-native-calendars가 current prop 변경을
  // 안정적으로 반영하도록 key도 함께 바꿔 강제 리렌더). 오늘 이전 달은 선택돼도 오늘 달로 클램프.
  const jumpToMonth = (month: number) => {
    const [y, m] = clampToToday(viewYear, month);
    setCalendarAnchor(`${y}-${pad2(m)}-01`);
    setViewYear(y);
    setViewMonthNum(m);
    setPickerMode('days');
  };

  const activeValue = activeField === 'start' ? start : activeField === 'end' ? end : '';
  const activeValueNormalized = normalizeDateInput(activeValue);
  const markedDates = /^\d{4}-\d{2}-\d{2}$/.test(activeValueNormalized)
    ? { [activeValueNormalized]: { selected: true, selectedColor: colors.primary } }
    : undefined;

  const create = async () => {
    if (!name.trim()) {
      Alert.alert(t('scheduler.nameRequiredError'));
      return;
    }

    const startDate = start.trim() ? normalizeDateInput(start) : undefined;
    const endDate = end.trim() ? normalizeDateInput(end) : undefined;

    // 형식이 YYYY-MM-DD가 아니면 서버 왕복 없이 바로 안내
    const isValidFormat = (s?: string) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isValidFormat(startDate) || !isValidFormat(endDate)) {
      Alert.alert(t('scheduler.dateFormatError'));
      return;
    }

    // 오늘 이전 날짜는 선택 불가 — 달력에서는 minDate로 막지만, 직접 타이핑 경로는 별도 검증 필요
    if ((startDate && startDate < todayISO) || (endDate && endDate < todayISO)) {
      Alert.alert(t('scheduler.datePastError'));
      return;
    }

    // 시작일/종료일 중 하나만 입력된 경우 — 사용자가 실수로 하나만 채운 것일 확률이 높아 명시적으로 안내
    if ((startDate && !endDate) || (!startDate && endDate)) {
      Alert.alert(t('scheduler.dateBothRequiredError'));
      return;
    }

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
      setActiveField(null);
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
              onFocus={() => openField('start')}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[styles.input, styles.dateInput, styles.dateInputRight]}
              placeholder={t('scheduler.endDate')}
              placeholderTextColor={colors.textSecondary}
              value={end}
              onChangeText={setEnd}
              onFocus={() => openField('end')}
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <Text style={styles.dateHint}>{t('scheduler.dateHint')}</Text>

          {/* 인라인 달력 팝업 — Modal이 아니라 일반 컴포넌트라 키보드/포커스를 가로채지 않음.
              입력창을 탭하면 열리고, 날짜를 타이핑하는 것도 동시에 가능. */}
          {activeField ? (
            <View style={styles.calendarPopover}>
              <View style={styles.calendarPopoverTopRow}>
                <Text style={styles.calendarPopoverLabel}>
                  {activeField === 'start' ? t('scheduler.startDate') : t('scheduler.endDate')}
                </Text>
                <Pressable onPress={closeField} hitSlop={8}>
                  <Text style={styles.calendarCloseText}>{t('common.close')}</Text>
                </Pressable>
              </View>

              {pickerMode === 'yearMonth' ? (
                <View style={styles.yearMonthPicker}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.yearRow}
                  >
                    {yearOptions.map((y) => (
                      <Pressable
                        key={y}
                        onPress={() => setViewYear(y)}
                        style={[styles.yearChip, y === viewYear && styles.yearChipActive]}
                      >
                        <Text style={[styles.yearChipText, y === viewYear && styles.yearChipTextActive]}>
                          {y}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <View style={styles.monthGrid}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <Pressable key={m} onPress={() => jumpToMonth(m)} style={styles.monthCell}>
                        <Text style={styles.monthCellText}>
                          {t('scheduler.monthN', { n: m })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Calendar
                  key={calendarAnchor}
                  current={calendarAnchor}
                  minDate={todayISO}
                  onMonthChange={handleMonthChange}
                  onDayPress={handleDayPress}
                  markedDates={markedDates}
                  renderHeader={() => (
                    <Pressable onPress={() => setPickerMode('yearMonth')} hitSlop={6}>
                      <Text style={styles.calendarHeaderText}>
                        {t('scheduler.yearMonthLabel', { year: viewYear, month: viewMonthNum })} ▾
                      </Text>
                    </Pressable>
                  )}
                  theme={{
                    todayTextColor: colors.primary,
                    selectedDayBackgroundColor: colors.primary,
                    arrowColor: colors.primary,
                  }}
                />
              )}
            </View>
          ) : null}

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
              {item.startDate && item.endDate ? (
                <Text style={styles.fileDates}>{item.startDate} ~ {item.endDate}</Text>
              ) : null}
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
  headerBack: { fontSize: 22, color: colors.primary, paddingHorizontal: 8 },
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
  fileDates: {
    marginTop: 3,
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
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
  calendarPopover: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
  },
  calendarPopoverTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  calendarPopoverLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  calendarCloseText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  calendarHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    paddingVertical: 10,
  },
  yearMonthPicker: {
    paddingVertical: 8,
  },
  yearRow: {
    paddingVertical: 4,
  },
  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.background,
    marginRight: 8,
  },
  yearChipActive: {
    backgroundColor: colors.primary,
  },
  yearChipText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  yearChipTextActive: {
    color: '#fff',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  monthCell: {
    width: '25%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  monthCellText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
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
