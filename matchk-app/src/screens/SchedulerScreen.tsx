/** 스케줄러 (D7 [A], §6-5) — 장소 입력 → 연관 관광지 리스트 → 상세.
 *  MBTI J형의 리네이밍. 범위 최소: 입력/리스트/이동만. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, TourItem } from '@/api/endpoints';
import { useDebounce } from '@/hooks/useDebounce';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SchedulerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);

  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 400);
  const [baseCandidates, setBaseCandidates] = useState<TourItem[]>([]);
  const [related, setRelated] = useState<TourItem[]>([]);
  const [baseTitle, setBaseTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!debounced.trim()) {
      setBaseCandidates([]);
      return;
    }
    endpoints
      .search(debounced.trim(), lang)
      .then((res) => setBaseCandidates(res.items.slice(0, 5)))
      .catch(() => setBaseCandidates([]));
  }, [debounced, lang]);

  const pickBase = (item: TourItem) => {
    setBaseTitle(item.title);
    setBaseCandidates([]);
    setQuery(item.title);
    endpoints
      .relatedLandmarks(item.contentid)
      .then((res) => setRelated(res.items))
      .catch(() => setRelated([]));
  };

  const openRelated = async (item: TourItem) => {
    // 연관 관광지 API 응답에는 contentid가 없음 → 이름으로 검색해 상세로 연결
    if (item.contentid) {
      navigation.navigate('LandmarkDetail', { contentid: item.contentid, title: item.title });
      return;
    }
    try {
      const res = await endpoints.search(item.title, lang);
      const hit = res.items[0];
      if (hit) navigation.navigate('LandmarkDetail', { contentid: hit.contentid, title: hit.title });
    } catch {
      /* noop */
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('scheduler.inputPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={(v) => {
          setQuery(v);
          setBaseTitle(null);
        }}
      />
      {baseCandidates.length > 0 && !baseTitle && (
        <View style={styles.dropdown}>
          {baseCandidates.map((c) => (
            <Pressable key={c.contentid} style={styles.dropdownItem} onPress={() => pickBase(c)}>
              <Text style={styles.dropdownText}>{c.title}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {baseTitle && <Text style={styles.relatedTitle}>{t('scheduler.relatedTitle')}</Text>}
      <FlatList
        data={related}
        keyExtractor={(i, idx) => i.contentid ?? String(idx)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => openRelated(item)}
          >
            <Text style={styles.rowTitle}>{item.title}</Text>
            {item.addr1 ? <Text style={styles.rowAddr} numberOfLines={1}>{item.addr1}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  input: {
    backgroundColor: colors.surface, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },
  dropdown: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 12, marginTop: 6 },
  dropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownText: { fontSize: 14, color: colors.textPrimary },
  relatedTitle: { marginTop: 20, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  list: { paddingTop: 8 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
