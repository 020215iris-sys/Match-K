/** 검색 화면 (홈에서 분리, 2026-07-31 개편) — AI(LLM) 추천 검색어 + 이전 검색어 + 실시간 검색.
 *  pick 파라미터가 있으면 '일정 담기 모드' → 결과 선택 시 일정 상세로 돌아가 일차를 고른다. */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { endpoints, TourItem } from '@/api/endpoints';
import { useDebounce } from '@/hooks/useDebounce';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SearchRoute = RouteProp<RootStackParamList, 'Search'>;

export default function SearchScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<SearchRoute>();
  const lang = useAppStore((s) => s.lang);
  const recentSearches = useAppStore((s) => s.recentSearches);
  const addRecentSearch = useAppStore((s) => s.addRecentSearch);
  const removeRecentSearch = useAppStore((s) => s.removeRecentSearch);
  const pick = route.params?.pick;

  const [query, setQuery] = useState('');
  const debounced = useDebounce(query, 400);
  const [results, setResults] = useState<TourItem[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // AI(LLM) 추천 검색어/키워드 (TODO 지현: 백엔드 LLM 연결 — 지금은 스텁)
  useEffect(() => {
    endpoints.searchSuggestions(lang).then((r) => setSuggestions(r.items)).catch(() => setSuggestions([]));
  }, [lang]);

  // 실시간 검색 (디바운싱 400ms)
  useEffect(() => {
    if (!debounced.trim()) {
      setResults(null);
      return;
    }
    endpoints
      .search(debounced.trim(), lang)
      .then((r) => setResults(r.items))
      .catch(() => setResults([]));
  }, [debounced, lang]);

  const onSelect = (item: TourItem) => {
    if (query.trim()) addRecentSearch(query.trim());
    if (pick) {
      // 일정 담기 모드 — 일정 상세로 돌아가 일차 선택 후 담김 (홈발/스케줄러발 동일 흐름)
      navigation.navigate('ItineraryDetail', {
        itineraryId: pick.itineraryId,
        addPlace: {
          contentid: item.contentid,
          title: item.title,
          lat: item.mapy ? Number(item.mapy) : null,
          lng: item.mapx ? Number(item.mapx) : null,
          sigunguCode: item.sigungucode ? Number(item.sigungucode) : null,
        },
      });
      return;
    }
    navigation.navigate('LandmarkDetail', { contentid: item.contentid, title: item.title });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TextInput
        style={styles.search}
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => query.trim() && addRecentSearch(query.trim())}
        autoFocus
        returnKeyType="search"
      />

      {results === null ? (
        <View style={styles.suggestWrap}>
          <Text style={styles.suggestTitle}>{t('search.aiSuggest')}</Text>
          {suggestions.map((s) => (
            <Pressable key={s} style={styles.suggestRow} onPress={() => setQuery(s)}>
              <Text style={styles.suggestText}>◇  {s}</Text>
            </Pressable>
          ))}

          {recentSearches.length > 0 ? (
            <>
              <Text style={[styles.suggestTitle, styles.recentTitle]}>{t('search.recent')}</Text>
              {recentSearches.map((s) => (
                <View key={s} style={styles.recentRow}>
                  <Pressable style={styles.recentTextWrap} onPress={() => setQuery(s)}>
                    <Text style={styles.suggestText}>{s}</Text>
                  </Pressable>
                  <Pressable onPress={() => removeRecentSearch(s)} hitSlop={8}>
                    <Text style={styles.recentX}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.contentid}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('search.noResults')}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelect(item)}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {item.addr1 ? <Text style={styles.rowAddr} numberOfLines={1}>{item.addr1}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: {
    marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },
  suggestWrap: { paddingHorizontal: 20, paddingTop: 20 },
  suggestTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
  recentTitle: { marginTop: 20 },
  suggestRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestText: { fontSize: 15, color: colors.textPrimary },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  recentTextWrap: { flex: 1 },
  recentX: { fontSize: 14, color: colors.textSecondary, paddingLeft: 12 },
  list: { padding: 20 },
  empty: { marginTop: 40, textAlign: 'center', color: colors.textSecondary },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
