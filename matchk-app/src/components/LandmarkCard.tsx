/** 홈 자동 카드/검색 결과 공용 카드 (Trip.com 스타일) */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';

interface Props {
  title: string;
  imageUrl?: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
  width?: number;
}

export default function LandmarkCard({ title, imageUrl, subtitle, badge, onPress, width = 160 }: Props) {
  return (
    <Pressable style={[styles.card, { width }]} onPress={onPress}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.placeholder]} />
      )}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Text style={styles.title} numberOfLines={2}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginRight: 12 },
  image: { width: '100%', height: 110, borderRadius: 12, backgroundColor: colors.surface },
  placeholder: { borderWidth: 1, borderColor: colors.border },
  badge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: colors.primary,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  title: { marginTop: 6, fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
});
