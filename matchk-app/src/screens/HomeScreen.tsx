/** 홈 화면 (D3 [A], Trip.com 스타일 §6-3).
 *  검색창 입력 시 자동 카드가 밀리고 결과 표시 (§6-6, 디바운싱 400ms). */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import * as Location from 'expo-location';

import { endpoints, Recommendation, TourItem } from '@/api/endpoints';
import CircleButton from '@/components/CircleButton';
import ErrorNotice from '@/components/ErrorNotice';
import HiddenEncounterPopup from '@/components/HiddenEncounterPopup';
import { useHiddenEncounter } from '@/hooks/useHiddenEncounter';
import { haversineM, STAMP_RADIUS_M } from '@/utils/geo';
import IntroPopup from '@/components/IntroPopup';
import LandmarkCard from '@/components/LandmarkCard';
import { useDebounce } from '@/hooks/useDebounce';
import { BUSAN_CENTER, useLocation } from '@/hooks/useLocation';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);
  const location = useLocation();

  const [cards, setCards] = useState<Recommendation[]>([]);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 400);
  const [results, setResults] = useState<TourItem[] | null>(null);
  const [fallback, setFallback] = useState<TourItem[]>([]);
  const [hiddenUnlocked, setHiddenUnlocked] = useState(false);
  const [collecting, setCollecting] = useState(false);

  // 히든 미션 잠금 해제 여부 확인 → 해제 시 조우 감지 시작
  useEffect(() => {
    endpoints.hiddenStatus().then((s) => setHiddenUnlocked(s.unlocked)).catch(() => {});
  }, [reloadKey]);
  const { encounter, dismiss } = useHiddenEncounter(hiddenUnlocked);

  // 히든 도장 수집 — 위치 검증은 단말기 내에서 (위치정보보호법)
  const collectHidden = async () => {
    if (!encounter) return;
    setCollecting(true);
    try {
      const detail = await endpoints.landmarkDetail(encounter.contentid, lang);
      if (detail.stampLat != null && detail.stampLng != null) {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const d = haversineM(pos.coords.latitude, pos.coords.longitude, detail.stampLat, detail.stampLng);
        if (d > STAMP_RADIUS_M) { dismiss(); return; }
      }
      await endpoints.createStamp(encounter.contentid);
      dismiss();
    } catch {
      dismiss();
    } finally {
      setCollecting(false);
    }
  };

  // GPS 기반 근처 역추천 카드 (D6 [A]) — 실패 시 에러 표시 (조용한 빈 화면 금지)
  useEffect(() => {
    const pos = location ?? BUSAN_CENTER;
    setCardsError(null);
    endpoints
      .recommendations('nearby', lang, pos.lat, pos.lng)
      .then((res) => setCards(res.items))
      .catch((e: unknown) => {
        setCards([]);
        setCardsError(e instanceof Error ? e.message : String(e));
      });
  }, [location, lang, reloadKey]);

  // 검색 (실시간 TourAPI, D6 [B])
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      return;
    }
    endpoints
      .search(debouncedQuery.trim(), lang)
      .then((res) => {
        setResults(res.items);
        setFallback(res.fallbackNearby);
      })
      .catch(() => setResults([]));
  }, [debouncedQuery, lang]);

  const openDetail = (contentid: string, title: string) =>
    navigation.navigate('LandmarkDetail', { contentid, title });

  const searching = results !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <IntroPopup onSelect={openDetail} />
      {encounter && (
        <HiddenEncounterPopup
          contentid={encounter.contentid}
          lang={lang}
          collecting={collecting}
          onCollect={collectHidden}
          onDismiss={dismiss}
        />
      )}

      {/* 상단바 */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>Mātch K</Text>
        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={styles.profileIcon}>👤</Text>
        </Pressable>
      </View>
      <TextInput
        style={styles.search}
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      <ScrollView contentContainerStyle={styles.body}>
        {!searching && (
          <View style={styles.circleRow}>
            <CircleButton label={t('home.scheduler')} emoji="🗓️" onPress={() => navigation.navigate('Scheduler')} />
            <CircleButton label={t('home.achievementMap')} emoji="🗺️" onPress={() => navigation.navigate('AchievementMap')} />
          </View>
        )}

        {searching ? (
          <View style={styles.section}>
            {results.length === 0 ? (
              <>
                <Text style={styles.sectionTitle}>{t('search.noResults')}</Text>
                <Text style={styles.sectionTitle}>{t('search.nearbyInstead')}</Text>
                <FlatList
                  horizontal showsHorizontalScrollIndicator={false} data={fallback}
                  keyExtractor={(i) => i.contentid}
                  renderItem={({ item }) => (
                    <LandmarkCard title={item.title} imageUrl={item.firstimage}
                      subtitle={item.addr1} onPress={() => openDetail(item.contentid, item.title)} />
                  )}
                />
              </>
            ) : (
              results.map((item) => (
                <Pressable key={item.contentid} style={styles.resultRow}
                  onPress={() => openDetail(item.contentid, item.title)}>
                  <Text style={styles.resultTitle}>{item.title}</Text>
                  <Text style={styles.resultAddr} numberOfLines={1}>{item.addr1}</Text>
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('home.nextTrips')}</Text>
            {cardsError !== null ? (
              <ErrorNotice detail={cardsError} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : (
              <FlatList
                horizontal showsHorizontalScrollIndicator={false} data={cards}
                keyExtractor={(i) => i.contentid}
                renderItem={({ item }) => (
                  <LandmarkCard title={item.title} imageUrl={item.image}
                    badge={item.reasons.includes('hidden_district') ? '✦' : undefined}
                    onPress={() => openDetail(item.contentid, item.title)} />
                )}
              />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  logo: { fontSize: 22, fontWeight: '800', color: colors.primary },
  profileIcon: { fontSize: 22 },
  search: {
    marginHorizontal: 20, marginTop: 12, backgroundColor: colors.surface,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: colors.textPrimary,
  },
  body: { paddingBottom: 32 },
  circleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  section: { marginTop: 28, paddingLeft: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
  resultRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginRight: 20 },
  resultTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  resultAddr: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
