/** 홈 원형 버튼 (스케줄러/업적지도) — 아이콘은 D의 assets 전달 후 교체 (D3 [D]) */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/theme/colors';

interface Props {
  label: string;
  emoji: string; // 임시 — D의 아이콘으로 교체 예정
  onPress: () => void;
}

export default function CircleButton({ label, emoji, onPress }: Props) {
  return (
    <Pressable style={styles.wrap} onPress={onPress}>
      <Pressable style={styles.circle} onPress={onPress}>
        <Text style={styles.emoji}>{emoji}</Text>
      </Pressable>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginHorizontal: 24 },
  circle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  emoji: { fontSize: 30 },
  label: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colors.textPrimary },
});
