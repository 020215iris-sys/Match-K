/** 인트로 팝업 (D5 [A]) — 네이버 맛동여지도 스타일.
 *  앱 실행 시 언어권 역추천 + 발길 끊긴 구 필터 결과 1개 노출 (이중 팝업 구조 §6-4). */
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints, Recommendation } from '@/api/endpoints';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

interface Props {
  onSelect: (contentid: string, title: string) => void;
}

export default function IntroPopup({ onSelect }: Props) {
  const { t } = useTranslation();
  const { lang, introSeen, setIntroSeen } = useAppStore();
  const [item, setItem] = useState<Recommendation | null>(null);

  useEffect(() => {
    if (introSeen) return;
    endpoints
      .recommendations('auto', lang)
      .then((res) => setItem(res.items[0] ?? null))
      .catch(() => setItem(null)); // 백엔드/API 장애 시 팝업 생략
  }, [lang, introSeen]);

  if (introSeen || !item) return null;

  const close = () => setIntroSeen(true);

  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.backdrop}>
        <View style={styles.popup}>
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.category}>Mātch K · {t('intro.category')}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.tagline}>{t('intro.tagline')}</Text>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, { backgroundColor: colors.surface }]} />
          )}
          <Pressable
            style={styles.cta}
            onPress={() => {
              close();
              onSelect(item.contentid, item.title);
            }}
          >
            <Text style={styles.ctaText}>{t('intro.cta')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  popup: { width: '84%', backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  closeBtn: { position: 'absolute', top: 14, right: 16, zIndex: 1 },
  closeText: { fontSize: 18, color: colors.textSecondary },
  category: { fontSize: 12, fontWeight: '700', color: colors.primary },
  title: { marginTop: 8, fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  tagline: { marginTop: 4, fontSize: 13, color: colors.textSecondary },
  image: { marginTop: 14, width: '100%', height: 180, borderRadius: 14 },
  cta: { marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
