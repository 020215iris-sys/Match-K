/** 검색 화면 (홈에서 분리, 2026-07-31 개편) — AI(LLM) 추천 검색어 + 이전 검색어 + 실시간 검색.
 *  pick 파라미터가 있으면 '일정 담기 모드' → 결과 선택 시 일정 상세로 돌아가 일차를 고른다. */
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { endpoints, Recommendation, SearchSuggestion, TourItem } from '@/api/endpoints';
import { useDebounce } from '@/hooks/useDebounce';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type SearchRoute = RouteProp<RootStackParamList, 'Search'>;

// 카테고리 칩(문장 검색 0건 → 제안) — 이모지/번역키는 프론트 전용, category_dictionary.py의
// 카테고리 키(beach/park/...)랑 이름을 맞춰야 함 (2026-08-23 "카테고리 칩 + 역추천" 제안).
const CATEGORY_META: Record<string, { emoji: string; labelKey: string }> = {
  beach: { emoji: '🏖', labelKey: 'search.category.beach' },
  park: { emoji: '🌳', labelKey: 'search.category.park' },
  market: { emoji: '🛒', labelKey: 'search.category.market' },
  cafe: { emoji: '☕', labelKey: 'search.category.cafe' },
  viewpoint: { emoji: '🌇', labelKey: 'search.category.viewpoint' },
  temple: { emoji: '⛩', labelKey: 'search.category.temple' },
};

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
  // display(보여줄 문장)/keyword(탭 시 실제 검색어) 분리 — 문장 그대로 검색하면 0건 나오는 문제 때문
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  // 문장 검색 0건일 때 백엔드가 제안하는 카테고리 키들("beach" 등)
  const [categoryHints, setCategoryHints] = useState<string[]>([]);
  // 카테고리 칩 탭한 뒤의 결과 — TourItem이 아니라 역추천 점수가 붙은 Recommendation 모양
  const [categoryResults, setCategoryResults] = useState<Recommendation[] | null>(null);

  // AI(LLM) 추천 검색어/키워드
  useEffect(() => {
    endpoints.searchSuggestions(lang).then((r) => setSuggestions(r.items)).catch(() => setSuggestions([]));
  }, [lang]);

  // display 문구 → keyword 역참조 맵. 검색창엔 display를 그대로 보여주되(사용자가 본 문구랑 동일하게),
  // 실제 TourAPI 호출은 keyword로 해야 결과가 나옴(문장 그대로면 0건). 사용자가 글자를 고치면
  // display와 더 이상 정확히 일치하지 않으니 자동으로 "직접 입력" 취급되어 원래 동작으로 돌아감.
  const suggestionKeywordByDisplay = useMemo(
    () => new Map(suggestions.map((s) => [s.display, s.keyword])),
    [suggestions],
  );

  // 실시간 검색 (디바운싱 400ms)
  useEffect(() => {
    const trimmed = debounced.trim();
    if (!trimmed) {
      setResults(null);
      setCategoryHints([]);
      setCategoryResults(null);
      return;
    }
    setCategoryResults(null); // 새로 검색 시작하면 이전 카테고리 결과는 지움
    const searchTerm = suggestionKeywordByDisplay.get(trimmed) ?? trimmed;
    endpoints
      .search(searchTerm, lang)
      .then((r) => {
        setResults(r.items);
        setCategoryHints(r.categoryHints || []);
      })
      .catch(() => {
        setResults([]);
        setCategoryHints([]);
      });
  }, [debounced, lang, suggestionKeywordByDisplay]);

  // 카테고리 칩 탭 — 그 카테고리로 역추천 점수 적용된 결과를 새로 받아옴
  const onSelectCategory = (category: string) => {
    endpoints
      .searchByCategory(category, lang)
      .then((r) => setCategoryResults(r.items))
      .catch(() => setCategoryResults([]));
  };

  const onSelectRecommendation = (item: Recommendation) => {
    if (query.trim()) addRecentSearch(query.trim());
    if (pick) {
      navigation.navigate('ItineraryDetail', {
        itineraryId: pick.itineraryId,
        addPlace: {
          contentid: item.contentid,
          title: item.title,
          lat: item.lat,
          lng: item.lng,
          sigunguCode: item.sigunguCode,
        },
      });
      return;
    }
    navigation.navigate('LandmarkDetail', { contentid: item.contentid, title: item.title });
  };

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
          {suggestions.map((s, idx) => (
            <Pressable
              key={`${s.keyword}-${idx}`}
              style={styles.suggestRow}
              onPress={() => setQuery(s.display)}
            >
              <Text style={styles.suggestText}>◇  {s.display}</Text>
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
      ) : categoryResults !== null ? (
        // 카테고리 칩 탭한 뒤 — 역추천 점수 적용된 결과 (Recommendation 모양)
        <FlatList
          data={categoryResults}
          keyExtractor={(i) => i.contentid}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('search.noResults')}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => onSelectRecommendation(item)}>
              <Text style={styles.rowTitle}>{item.title}</Text>
            </Pressable>
          )}
        />
      ) : results.length === 0 && categoryHints.length > 0 ? (
        // 문장 검색 0건 + 제안 카테고리 있음 — 죽은 화면 대신 카테고리 칩 (2026-08-23)
        <View style={styles.list}>
          <Text style={styles.empty}>{t('search.noResults')}</Text>
          <Text style={[styles.suggestTitle, styles.categoryTitle]}>{t('search.categoryHint')}</Text>
          <View style={styles.categoryChipRow}>
            {categoryHints.map((cat) => {
              const meta = CATEGORY_META[cat];
              if (!meta) return null;
              return (
                <Pressable key={cat} style={styles.categoryChip} onPress={() => onSelectCategory(cat)}>
                  <Text style={styles.categoryChipText}>{meta.emoji}  {t(meta.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
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
  categoryTitle: { marginTop: 24, textAlign: 'center' },
  categoryChipRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12,
  },
  categoryChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  categoryChipText: { fontSize: 14, color: colors.textPrimary },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  rowAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
