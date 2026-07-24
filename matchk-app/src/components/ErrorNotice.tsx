/** 데이터 로딩 실패 표시 + 재시도 (조용한 catch로 빈 화면 되는 문제 방지) */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors } from '@/theme/colors';

interface Props {
  onRetry: () => void;
  /** 개발 중 원인 파악용 상세 (프로덕션에서는 숨겨도 됨) */
  detail?: string;
}

export default function ErrorNotice({ onRetry, detail }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.box}>
      <Text style={styles.message}>{t('common.error')}</Text>
      {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
      <Pressable style={styles.button} onPress={onRetry} hitSlop={8}>
        <Text style={styles.buttonText}>{t('common.retry')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginRight: 20, padding: 16, borderRadius: 12, alignItems: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  message: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  detail: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },
  button: {
    marginTop: 10, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 8, backgroundColor: colors.primary,
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
