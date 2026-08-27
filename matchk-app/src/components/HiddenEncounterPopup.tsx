/** 히든 조우 팝업 — 일반 도장(상세 화면 버튼)과 완전히 다른 이벤트성 UI (포켓몬 고식).
 *  2026-08 개편: GPS 근접 조우가 아니라, 업적지도 3페이지에서 그 구 도장 비율을
 *  채웠을 때 배너를 탭하면 뜨는 전체화면 모달. useHiddenEncounter가 열림/대상을 관리한다. */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints } from '@/api/endpoints';
import { colors } from '@/theme/colors';

interface Props {
  contentid: string;
  lang: string;
  onCollect: () => void;   // 히든 도장 수집 확정 (GPS 재검증 없음 — 팝업 자체가 트리거)
  onDismiss: () => void;
  collecting: boolean;
}

export default function HiddenEncounterPopup({ contentid, lang, onCollect, onDismiss, collecting }: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState<string | null>(null);
  // 등장 연출 — 도장/발견 계열 이벤트에 공통으로 쓸 팝(pop) 애니메이션 (스프링 스케일)
  const pop = useRef(new Animated.Value(0)).current;

  // 조우한 순간에만 이름 조회 (그 전까지는 좌표만 알고 정체는 숨김)
  useEffect(() => {
    let on = true;
    endpoints.landmarkDetail(contentid, lang)
      .then((res) => { if (on) setTitle(res.detail.title ?? '???'); })
      .catch(() => { if (on) setTitle('???'); });
    return () => { on = false; };
  }, [contentid, lang]);

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
  }, [contentid, pop]);

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <Animated.View
          style={[
            styles.card,
            { transform: [{ scale: pop }], opacity: pop },
          ]}
        >
          <Text style={styles.spark}>✦</Text>
          <Text style={styles.header}>{t('hidden.encounterTitle')}</Text>
          <Text style={styles.sub}>{t('hidden.encounterSub')}</Text>
          <View style={styles.nameBox}>
            {title === null
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.name}>{title}</Text>}
          </View>
          <Pressable style={styles.collectBtn} onPress={onCollect} disabled={collecting}>
            <Text style={styles.collectText}>
              {collecting ? '...' : t('hidden.collect')}
            </Text>
          </Pressable>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={styles.later}>{t('hidden.later')}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  card: {
    width: '100%', backgroundColor: colors.background, borderRadius: 24, padding: 28,
    alignItems: 'center', borderWidth: 2, borderColor: colors.stampGold,
  },
  spark: { fontSize: 44 },
  header: { marginTop: 8, fontSize: 22, fontWeight: '800', color: colors.stampGold },
  sub: { marginTop: 6, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  nameBox: { marginTop: 20, minHeight: 34, justifyContent: 'center' },
  name: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  collectBtn: {
    marginTop: 24, backgroundColor: colors.stampGold, borderRadius: 16,
    paddingVertical: 15, paddingHorizontal: 48,
  },
  collectText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  later: { marginTop: 16, fontSize: 13, color: colors.textSecondary },
});
