/** 홈 화면 — 검색은 별도 화면(Search)으로 분리 (2026-07-31 개편).
 *  구성: 검색창(→Search) · 원형버튼(스케줄러/업적지도) · 역추천 카드 · 마스코트. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { endpoints, Recommendation } from '@/api/endpoints';
import CircleButton from '@/components/CircleButton';
import ErrorNotice from '@/components/ErrorNotice';
import IntroPopup from '@/components/IntroPopup';
import LandmarkCard from '@/components/LandmarkCard';
import Mascot from '@/components/Mascot';
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

  // GPS 기반 근처 역추천 카드 — 실패 시 에러 표시(조용한 빈 화면 금지)
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

  const openDetail = (contentid: string, title: string) =>
    navigation.navigate('LandmarkDetail', { contentid, title });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <IntroPopup onSelect={openDetail} />

      {/* 상단바 */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>Mātch K</Text>
        <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={8}>
          <Text style={styles.profileIcon}>👤</Text>
        </Pressable>
      </View>

      {/* 검색창 — 탭하면 별도 검색 화면으로 이동 (인라인 검색 제거) */}
      <Pressable style={styles.search} onPress={() => navigation.navigate('Search')}>
        <Text style={styles.searchPlaceholder}>🔍  {t('home.searchPlaceholder')}</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.circleRow}>
          <CircleButton label={t('home.scheduler')} emoji="🗓️" onPress={() => navigation.navigate('SchedulerMain')} />
          <CircleButton label={t('home.achievementMap')} emoji="🗺️" onPress={() => navigation.navigate('AchievementMap')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('home.nextTrips')}</Text>
          {cardsError !== null ? (
            <ErrorNotice detail={cardsError} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={cards}
              keyExtractor={(i) => i.contentid}
              renderItem={({ item }) => (
                <LandmarkCard
                  title={item.title}
                  imageUrl={item.image}
                  badge={item.reasons.includes('hidden_district') ? '✦' : undefined}
                  onPress={() => openDetail(item.contentid, item.title)}
                />
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* 역추천의 얼굴 (GPS 근처 추천). GPS 없으면 카드와 동일하게 부산 중심 좌표로 대체
          (기존엔 fallback 없이 undefined가 그대로 넘어가 GPS 미확보 시 조용히 숨어버렸음). */}
      <Mascot recType="nearby" lat={(location ?? BUSAN_CENTER).lat} lng={(location ?? BUSAN_CENTER).lng} />
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
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  searchPlaceholder: { fontSize: 15, color: colors.textSecondary },
  body: { paddingBottom: 32 },
  circleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  section: { marginTop: 28, paddingLeft: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 12 },
});
