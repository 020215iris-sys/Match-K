/** 마스코트 (역추천의 얼굴) — 화면에 둥둥 떠서, 탭하면 말풍선으로 오늘의 추천을 안내.
 *  홈·업적지도·스케줄러에서 재사용. 추천 로직은 서버(recommender)가 이미 계산 → 여기선 표시만.
 *
 *  ⚠️ 캐릭터 이미지는 임시(이모지 원형). 디자인 확정 후 <Image source=...>로 교체하면 됨.
 *  ⚠️ "인구감소지역" 등 부정적 표현 금지 — reasons를 마스코트 말투(i18n mascot.*)로만 노출. */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, Recommendation } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** reasons 배열 → 마스코트 말풍선 대사 키 (우선순위: 언어공백 > 로컬골목 > 미발견 > 여행자 > 기본) */
function reasonKey(reasons: string[]): string {
  if (reasons.includes('thin_in_your_language')) return 'mascot.reasonThin';
  if (reasons.includes('hidden_district')) return 'mascot.reasonHidden';
  if (reasons.includes('undiscovered')) return 'mascot.reasonUndiscovered';
  if (reasons.includes('visited_by_foreigners_not_locals')) return 'mascot.reasonForeigners';
  return 'mascot.reasonDefault';
}

interface Props {
  /** 추천 타입 — 화면별로 auto(큐레이션) / nearby(GPS) 지정. 기본 auto */
  recType?: 'auto' | 'nearby';
  /** GPS 좌표 (nearby일 때) */
  lat?: number;
  lng?: number;
}

export default function Mascot({ recType = 'auto', lat, lng }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [open, setOpen] = useState(false);

  // 오늘의 추천 1건 로드 (서버 역추천 결과의 최상위)
  useEffect(() => {
    endpoints.recommendations(recType, lang, lat, lng)
      .then((res) => setRec(res.items[0] ?? null))
      .catch(() => setRec(null));
  }, [recType, lang, lat, lng]);

  if (!rec) return null; // 추천 없으면 마스코트 숨김 (조용히)

  const goDetail = () => {
    setOpen(false);
    navigation.navigate('LandmarkDetail', { contentid: rec.contentid, title: rec.title });
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open && (
        <View style={styles.bubble}>
          <Text style={styles.greeting}>{t('mascot.greeting')}</Text>
          <Text style={styles.place}>📍 {rec.title}</Text>
          <Text style={styles.reason}>{t(reasonKey(rec.reasons))}</Text>
          <Pressable style={styles.cta} onPress={goDetail}>
            <Text style={styles.ctaText}>{t('mascot.cta')}</Text>
          </Pressable>
          <View style={styles.tail} />
        </View>
      )}
      <Pressable style={styles.mascot} onPress={() => setOpen((v) => !v)} hitSlop={8}
        accessibilityLabel="Match K 마스코트">
        {/* 말풍선 열리면 기쁨, 닫혀 있으면 정면 (표정: happy/surprised/sad/angry 교체 가능) */}
        <Image
          source={open ? require('../../assets/mascot/mascot-happy.png')
            : require('../../assets/mascot/mascot-front.png')}
          style={styles.mascotImg}
          resizeMode="contain"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, bottom: 24, alignItems: 'flex-end', zIndex: 50 },
  mascot: {
    width: 76, height: 76, alignItems: 'center', justifyContent: 'center',
  },
  mascotImg: { width: 76, height: 76 },
  bubble: {
    maxWidth: 260, marginBottom: 12, padding: 14, borderRadius: 16,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  greeting: { fontSize: 13, color: colors.textSecondary },
  place: { marginTop: 6, fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  reason: { marginTop: 4, fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  cta: {
    marginTop: 12, alignSelf: 'flex-start', backgroundColor: colors.primary,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
  },
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tail: {
    position: 'absolute', right: 24, bottom: -7, width: 14, height: 14,
    backgroundColor: colors.background, borderRightWidth: 1, borderBottomWidth: 1,
    borderColor: colors.border, transform: [{ rotate: '45deg' }],
  },
});
