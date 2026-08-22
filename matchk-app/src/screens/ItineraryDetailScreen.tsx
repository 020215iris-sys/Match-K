/** 일정 상세 (2026-07-31 개편) — 1~N일차 섹션 + 맨 하단 장소추가.
 *  · addPlace 진입 시 '일차 선택' 모달 → 고른 일차에 담김 (홈발/스케줄러발 공통).
 *  · 2026-08-15 수정: chooseDay 에러 핸들링 + 뒤로가기 항상 스케줄러로 + safe area 반영.
 *
 *  · 2026-08-20 재구현 (다은, 금요일 마감): 자유로운 드래그앤드롭.
 *    ⚠️ react-native-draggable-flatlist는 Expo Go SDK54에 확정적으로 안 맞음 —
 *      Expo Go 네이티브 바이너리가 reanimated ~4.1.1로 고정 컴파일되어 있는데(공식
 *      bundledNativeModules.json 확인), draggable-flatlist(최신 4.0.3)는 아직 reanimated 4의
 *      내부구조(Worklets 재작성)를 지원 안 해서 JS 버전을 뭘 설치해도 크래시남. 라이브러리
 *      버전으로는 해결 불가능하다고 최종 판단, 새 의존성 없이 RN 코어 API만으로 재구현.
 *
 *    구현 방식: react-native 코어 내장 PanResponder + Animated 사용 (신규 설치 0개).
 *
 *  · 2026-08-21 긴급 수정: "Rendered more hooks than during the previous render" 크래시.
 *    원인: `if (!data) return ...` 조기 종료를 useCallback들 "중간에" 넣어놔서, data 로딩 전
 *    렌더링(조기 종료 → 훅 15개만 실행)과 로딩 후 렌더링(끝까지 실행 → 훅 25개 실행)의 훅
 *    호출 개수가 달라짐 — 리액트 훅 규칙(매 렌더링마다 동일한 순서·개수로 호출) 위반.
 *    수정: 모든 useCallback을 조기 종료 지점보다 위로 이동, data가 null일 수 있는 상황은
 *    각 콜백 내부에서 옵셔널 체이닝/가드로 방어. 조기 종료(`if (!data) return`)는 이제
 *    모든 훅 선언이 끝난 다음, JSX를 그리기 직전 위치로 이동.
 *
 *  · 2026-08-21 추가 수정 (QA: "드래그는 되는데 드롭이 안 됨"): ItemRow의 PanResponder를
 *    useRef(...)로 마운트 시 한 번만 생성하면서, 그 안에서 onDragStart/onDragMove/onDragEnd/
 *    item을 직접 클로저로 붙잡고 있었음. 드래그 시작 시 부모가 draggingItem 상태를 바꾸면서
 *    이 함수들을 새로 만들어 내려줘도, 이미 마운트 시 얼려진 PanResponder는 옛날 함수를
 *    계속 참조(stale closure) — 특히 onDragEnd가 "드래그 시작 전" 버전이라 draggingItem을
 *    null로 알고 있어서, 손을 떼도 조용히 아무 일도 안 하고 끝나버림. 최신 값을 담아두는
 *    ref(latestRef)를 두고 PanResponder 핸들러가 그 ref를 통해서만 호출하도록 우회해서 해결.
 */
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

type Measurement = { pageY: number; height: number };

/** 일차 헤더 / 빈일차 표시줄처럼 상호작용 없는 행 — 레이아웃될 때마다 화면 절대좌표를
 *  측정해서 부모에 보고만 함(드래그 타겟 판정용). */
function MeasuredRow({
  rowKey,
  onMeasured,
  children,
  style,
}: {
  rowKey: string;
  onMeasured: (key: string, m: Measurement) => void;
  children: React.ReactNode;
  style?: any;
}) {
  const ref = useRef<View>(null);
  const handleLayout = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measure((_x, _y, _w, height, _pageX, pageY) => {
        onMeasured(rowKey, { pageY, height });
      });
    });
  }, [onMeasured, rowKey]);
  return (
    <View ref={ref} style={style} onLayout={handleLayout}>
      {children}
    </View>
  );
}

/** 항목 한 줄 — 탭하면 상세로, ⠿ 손잡이를 끌면 드래그 시작. 자체 PanResponder를 가짐
 *  (per-row 인스턴스가 필요해서 별도 컴포넌트로 분리 — 훅 규칙상 .map() 안에서 직접
 *  useRef/PanResponder.create를 쓸 수 없기 때문). */
function ItemRow({
  item,
  isDragging,
  onPress,
  onDelete,
  onMeasured,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: ItineraryItem;
  isDragging: boolean;
  onPress: () => void;
  onDelete: () => void;
  onMeasured: (key: string, m: Measurement) => void;
  onDragStart: (item: ItineraryItem, touchY: number) => void;
  onDragMove: (moveY: number) => void;
  onDragEnd: () => void;
}) {
  const ref = useRef<View>(null);
  const rowKey = `item-${item.id}`;

  // PanResponder는 아래에서 useRef(...).current로 "마운트 시 딱 한 번만" 생성됨.
  // 그 안의 핸들러가 onDragStart/onDragMove/onDragEnd/item을 직접 클로저로 붙잡으면,
  // 이후 부모가 draggingItem 상태를 바꿔서 이 함수들을 새로 만들어 내려줘도 PanResponder는
  // "마운트 시점의 옛날 함수"를 계속 참조함 (stale closure). 실제로 이것 때문에 드래그는
  // 화면상 보이는데 손을 뗄 때 호출되는 onDragEnd는 옛날(=드래그 시작 전, draggingItem=null)
  // 버전이라 아무 것도 안 하고 조용히 끝나버리는 버그가 있었음 — QA에서 "드롭이 안 됨"으로
  // 확인됨. 최신 값을 담아두는 ref를 하나 두고, PanResponder 핸들러는 그 ref를 통해서만
  // 호출하도록 우회해서 항상 최신 콜백/item을 쓰게 함.
  const latestRef = useRef({ item, onDragStart, onDragMove, onDragEnd });
  latestRef.current = { item, onDragStart, onDragMove, onDragEnd };

  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      ref.current?.measure((_x, _y, _w, height, _pageX, pageY) => {
        onMeasured(rowKey, { pageY, height });
      });
    });
  }, [onMeasured, rowKey]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { item: curItem, onDragStart: start } = latestRef.current;
        start(curItem, evt.nativeEvent.pageY);
      },
      onPanResponderMove: (evt) => {
        latestRef.current.onDragMove(evt.nativeEvent.pageY);
      },
      onPanResponderRelease: () => {
        latestRef.current.onDragEnd();
      },
      onPanResponderTerminate: () => {
        latestRef.current.onDragEnd();
      },
    }),
  ).current;

  return (
    <View ref={ref} onLayout={measure} style={[styles.itemRow, isDragging && styles.itemRowGhost]}>
      <Pressable style={styles.itemMain} onPress={onPress}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title ?? item.contentid}</Text>
      </Pressable>
      <View style={styles.itemCtrls}>
        <View {...panResponder.panHandlers} hitSlop={10}>
          <Text style={styles.dragHandle}>⠿</Text>
        </View>
        <Pressable onPress={onDelete} hitSlop={6}><Text style={styles.ctrlDel}>🗑</Text></Pressable>
      </View>
    </View>
  );
}

export default function ItineraryDetailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<ItinRoute>();
  const insets = useSafeAreaInsets();
  const { itineraryId, addPlace } = route.params;
  const [data, setData] = useState<Itin | null>(null);
  const [draggingItem, setDraggingItem] = useState<ItineraryItem | null>(null);

  // ── 드래그 관련 ref ────────────────────────────────────────────────
  const containerRef = useRef<View>(null);
  const containerPageYRef = useRef(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const measurementsRef = useRef<Map<string, Measurement>>(new Map());
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchOffsetWithinRowRef = useRef(0);
  const hoverRef = useRef<{ day: number; index: number } | null>(null);
  const dragTop = useRef(new Animated.Value(0)).current;

  // data가 null일 수 있으므로 전부 안전하게 폴백 — 훅이 아니라 일반 값/함수라
  // early return보다 위에 있어도, 아래에 있어도 훅 규칙과는 무관하지만, 아래에서
  // 훅들이 이 값들을 참조하므로 반드시 훅보다 먼저 계산되어 있어야 함.
  const dayCount = data ? Math.max(1, data.dayCount) : 1;
  const days = Array.from({ length: dayCount }, (_, i) => i + 1);
  const itemsByDay = (day: number): ItineraryItem[] =>
    (data?.items ?? []).filter((x) => x.dayIndex === day).sort((a, b) => a.sortOrder - b.sortOrder);

  const load = useCallback(() => {
    endpoints.itineraryDetail(itineraryId).then(setData).catch(() => setData(null));
  }, [itineraryId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 2026-08-21 재수정 (QA): goBack()은 "실제로 쌓인 스택"을 그대로 따라가는 거라,
  // 진입 경로에 따라 결과가 달라짐 — 스케줄러발이면 [Home, SchedulerMain, ItineraryDetail]
  // 이라 goBack이 SchedulerMain으로 잘 가지만, 홈발(랜드마크 상세 경유)이면
  // [Home, LandmarkDetail, SchedulerMain, ItineraryDetail]처럼 중간에 다른 화면이 껴있어
  // goBack이 엉뚱한 화면(LandmarkDetail 등)으로 튐. 진입 경로와 무관하게 항상
  // "홈 → 스케줄러 리스트"로만 남도록 스택 자체를 reset으로 강제 정리.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => {
            navigation.reset({
              index: 1,
              routes: [{ name: 'Home' }, { name: 'SchedulerMain', params: {} }],
            });
          }}
          hitSlop={10}
        >
          <Text style={styles.headerBack}>←</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  // ⚠️ 아래 useCallback들은 전부 "early return보다 위"에 있어야 함 — 훅 규칙(매 렌더링
  // 동일한 순서·개수로 호출)을 지키기 위함. data가 아직 null인 렌더링에서도 반드시
  // 호출되어야 하므로, 내부에서 data null 체크를 각자 방어적으로 처리함.

  const handleMeasured = useCallback((key: string, m: Measurement) => {
    measurementsRef.current.set(key, m);
  }, []);

  const onContainerLayout = useCallback(() => {
    requestAnimationFrame(() => {
      containerRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
        containerPageYRef.current = pageY;
      });
    });
  }, []);

  const onScrollViewLayout = useCallback((e: any) => {
    scrollViewHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const onScroll = useCallback((e: any) => {
    scrollYRef.current = e.nativeEvent.contentOffset.y;
  }, []);

  const clearAutoScroll = useCallback(() => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  // 리스트 위/아래 가장자리 근처로 끌면 자동 스크롤
  const maybeAutoScroll = useCallback((moveY: number) => {
    const top = containerPageYRef.current;
    const bottom = top + scrollViewHeightRef.current;
    const EDGE = 60;
    const STEP = 12;
    const nearTop = moveY < top + EDGE;
    const nearBottom = moveY > bottom - EDGE;
    if (!nearTop && !nearBottom) {
      clearAutoScroll();
      return;
    }
    if (autoScrollTimerRef.current) return; // 이미 스크롤 중이면 새로 안 만듦
    autoScrollTimerRef.current = setInterval(() => {
      scrollYRef.current = Math.max(0, scrollYRef.current + (nearTop ? -STEP : STEP));
      scrollViewRef.current?.scrollTo({ y: scrollYRef.current, animated: false });
    }, 16);
  }, [clearAutoScroll]);

  // moveY(화면 절대좌표)가 어느 일차·몇 번째 위치에 해당하는지 계산
  const computeHover = useCallback((moveY: number): { day: number; index: number } => {
    const headerEntries = days
      .map((d) => ({ day: d, pageY: measurementsRef.current.get(`header-${d}`)?.pageY ?? Infinity }))
      .sort((a, b) => a.pageY - b.pageY);

    let targetDay = headerEntries[0]?.day ?? 1;
    for (let i = 0; i < headerEntries.length; i++) {
      const cur = headerEntries[i];
      if (moveY >= cur.pageY) targetDay = cur.day;
    }

    const dayItems = itemsByDay(targetDay).filter((x) => x.id !== draggingItem?.id);
    let index = dayItems.length;
    for (let i = 0; i < dayItems.length; i++) {
      const m = measurementsRef.current.get(`item-${dayItems[i].id}`);
      if (!m) continue;
      const mid = m.pageY + m.height / 2;
      if (moveY < mid) {
        index = i;
        break;
      }
    }
    return { day: targetDay, index };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, draggingItem]);

  const handleDragStart = useCallback((item: ItineraryItem, touchY: number) => {
    const m = measurementsRef.current.get(`item-${item.id}`);
    const rowPageY = m?.pageY ?? touchY;
    touchOffsetWithinRowRef.current = touchY - rowPageY;
    dragTop.setValue(rowPageY - containerPageYRef.current);
    hoverRef.current = {
      day: item.dayIndex,
      index: itemsByDay(item.dayIndex).findIndex((x) => x.id === item.id),
    };
    setDraggingItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleDragMove = useCallback((moveY: number) => {
    dragTop.setValue(moveY - containerPageYRef.current - touchOffsetWithinRowRef.current);
    hoverRef.current = computeHover(moveY);
    maybeAutoScroll(moveY);
  }, [computeHover, maybeAutoScroll]);

  const handleDragEnd = useCallback(async () => {
    clearAutoScroll();
    const dragged = draggingItem;
    const hover = hoverRef.current;
    setDraggingItem(null);
    hoverRef.current = null;
    if (!dragged || !hover || !data) return;

    const { day: targetDay, index: targetIndex } = hover;

    const targetDayItems = data.items
      .filter((x) => x.dayIndex === targetDay && x.id !== dragged.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const reordered = [...targetDayItems];
    reordered.splice(Math.max(0, Math.min(targetIndex, reordered.length)), 0, dragged);

    const updates: { id: number; dayIndex: number; sortOrder: number }[] = [];
    reordered.forEach((it, idx) => {
      if (it.id === dragged.id || it.dayIndex !== targetDay || it.sortOrder !== idx) {
        updates.push({ id: it.id, dayIndex: targetDay, sortOrder: idx });
      }
    });

    // 다른 일차로 옮긴 경우, 원래 일차에 남은 항목들도 순서 재정렬(빈틈 정리)
    if (targetDay !== dragged.dayIndex) {
      const originalDayItems = data.items
        .filter((x) => x.dayIndex === dragged.dayIndex && x.id !== dragged.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      originalDayItems.forEach((it, idx) => {
        if (it.sortOrder !== idx) updates.push({ id: it.id, dayIndex: dragged.dayIndex, sortOrder: idx });
      });
    }

    if (updates.length === 0) return;

    try {
      for (const u of updates) {
        // eslint-disable-next-line no-await-in-loop
        await endpoints.moveItineraryItem(itineraryId, u.id, { dayIndex: u.dayIndex, sortOrder: u.sortOrder });
      }
    } catch (err) {
      alertFromError(t, err);
    } finally {
      load();
    }
  }, [clearAutoScroll, draggingItem, data, itineraryId, t, load]);

  // ── 여기부터는 훅이 아닌 일반 함수들 — early return 아래에 있어도 문제없음 ──────
  // (JSX는 data가 있을 때만 그려지므로, 이 함수들이 실제 호출될 시점엔 data가 항상 존재)

  if (!data) return <Text style={styles.error}>{t('common.error')}</Text>;

  // addPlace 일차 선택 (신규 항목 추가 흐름 — 드래그와는 무관)
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

  const remove = async (item: ItineraryItem) => {
    try {
      await endpoints.deleteItineraryItem(itineraryId, item.id);
      load();
    } catch {
      Alert.alert(t('common.error'));
    }
  };

  return (
    <View ref={containerRef} style={styles.container} onLayout={onContainerLayout}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.body}
        onLayout={onScrollViewLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={!draggingItem}
      >
        <Text style={styles.title}>{data.name}</Text>
        {days.map((d) => (
          <View key={d} style={styles.daySection}>
            <MeasuredRow rowKey={`header-${d}`} onMeasured={handleMeasured}>
              <Text style={styles.dayTitle}>{t('scheduler.dayN', { n: d })}</Text>
            </MeasuredRow>
            {itemsByDay(d).length === 0 ? (
              <MeasuredRow rowKey={`empty-${d}`} onMeasured={handleMeasured}>
                <Text style={styles.dayEmpty}>—</Text>
              </MeasuredRow>
            ) : (
              itemsByDay(d).map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  isDragging={draggingItem?.id === it.id}
                  onPress={() => navigation.navigate('LandmarkDetail', { contentid: it.contentid, title: it.title ?? '' })}
                  onDelete={() => remove(it)}
                  onMeasured={handleMeasured}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </View>
        ))}
        <Text style={styles.hint}>{t('scheduler.reorderHint')}</Text>
      </ScrollView>

      {/* 드래그 중 손가락을 따라다니는 떠다니는 복사본 */}
      {draggingItem ? (
        <Animated.View pointerEvents="none" style={[styles.dragOverlay, { top: dragTop }]}>
          <View style={[styles.itemRow, styles.dragOverlayInner]}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {draggingItem.title ?? draggingItem.contentid}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      {/* 장소추가 — 맨 하단 하나. 검색 화면(담기 모드)으로 이동. 하단 안전영역만큼 띄움 */}
      <Pressable
        style={[styles.addBtn, { bottom: 24 + insets.bottom }]}
        onPress={() => navigation.navigate('Search', { pick: { itineraryId } })}
      >
        <Text style={styles.addBtnText}>➕ {t('scheduler.addPlace')}</Text>
      </Pressable>

      {/* 일차 선택 모달 (addPlace로 신규 항목 추가 시) */}
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
  itemRowGhost: { opacity: 0.3 },
  itemMain: { flex: 1, marginRight: 8 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  itemCtrls: { flexDirection: 'row', alignItems: 'center' },
  dragHandle: { fontSize: 16, color: colors.textSecondary, paddingHorizontal: 6 },
  ctrlDel: { fontSize: 15, paddingHorizontal: 5 },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  dragOverlay: { position: 'absolute', left: 20, right: 20 },
  dragOverlayInner: {
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
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
  dayBtnText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
});
