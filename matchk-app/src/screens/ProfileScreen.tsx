/** 프로필/설정 — 언어 변경 / 구글 로그인 / 로그아웃 / 회원탈퇴 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import i18n, { AppLang } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

WebBrowser.maybeCompleteAuthSession(); // 로그인 후 브라우저 세션 정리

const LANGS: { code: AppLang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

// 웹에 게시한 개인정보처리방침 URL로 교체 (스토어 등록 URL과 동일하게)
const PRIVACY_POLICY_URL = 'https://matchk.example.com/privacy';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { lang, setLang, userName } = useAppStore();
  const { logout, deleteAccount, loginWithGoogle } = useAuth();

  // 구글 로그인 (액세스 토큰 방식 — 설치형 앱은 id_token 미지원이라 이 방식 사용).
  const [, googleResponse, promptGoogle] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const accessToken = googleResponse.authentication?.accessToken;
    if (!accessToken) return;
    loginWithGoogle(accessToken)
      .then(() => Alert.alert('✓', t('profile.loginGoogle')))
      .catch(() => Alert.alert(t('common.error')));
  }, [googleResponse]);

  const changeLang = async (code: AppLang) => {
    setLang(code);
    await i18n.changeLanguage(code); // 언어 변경 즉시 반영
    endpoints.updateLanguage(code).catch(() => {}); // 서버 동기화는 베스트에포트
  };

  // 회원탈퇴 — 2단계 확인 후 계정·도장 영구 삭제 (스토어 심사 필수)
  const confirmDelete = () => {
    Alert.alert(
      t('profile.deleteTitle'),
      t('profile.deleteWarning'),
      [
        { text: t('profile.cancel'), style: 'cancel' },
        {
          text: t('profile.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              Alert.alert(t('profile.deleteDone'));
            } catch {
              Alert.alert(t('common.error'));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{userName ?? 'Guest'}</Text>

      <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
      <View style={styles.langGrid}>
        {LANGS.map((l) => (
          <Pressable
            key={l.code}
            style={[styles.langBtn, lang === l.code && styles.langBtnActive]}
            onPress={() => changeLang(l.code)}
          >
            <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.googleBtn}
        onPress={() => promptGoogle()}
      >
        <Text style={styles.googleText}>{t('profile.loginGoogle')}</Text>
      </Pressable>

      <Pressable
        style={styles.linkRow}
        onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
      >
        <Text style={styles.linkText}>{t('profile.privacy')}</Text>
      </Pressable>

      <Pressable
        style={styles.logoutBtn}
        onPress={() => {
          logout();
          Alert.alert(t('profile.logout'), '✓');
        }}
      >
        <Text style={styles.logoutText}>{t('profile.logout')}</Text>
      </Pressable>

      <Pressable style={styles.deleteBtn} onPress={confirmDelete}>
        <Text style={styles.deleteText}>{t('profile.deleteTitle')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  name: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: 12 },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  langBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontSize: 14, color: colors.textPrimary },
  langTextActive: { color: '#fff', fontWeight: '700' },
  googleBtn: {
    marginTop: 28, alignItems: 'center', paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  googleText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  linkRow: { marginTop: 32, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  linkText: { fontSize: 14, color: colors.textSecondary },
  logoutBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  deleteBtn: { marginTop: 8, alignItems: 'center', paddingVertical: 10 },
  deleteText: { color: colors.textSecondary, fontSize: 13, textDecorationLine: 'underline' },
});
