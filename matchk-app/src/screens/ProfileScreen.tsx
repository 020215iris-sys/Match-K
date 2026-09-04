/** 프로필/설정 — 언어 변경 / 구글 로그인 / 로그아웃 / 회원탈퇴 */
// ⚠️ @react-native-google-signin/google-signin은 최상단에서 정적 import하면 안 됨 —
// Expo Go엔 이 네이티브 모듈이 없어서, RootNavigator가 이 화면을 참조하는 순간
// 앱 전체가 부팅 시 크래시남 (2026-08-24, 현표님 리포트).
//
// ⚠️ 2차 수정 (같은 날, 동적 import만으론 부족했음): 네이티브 모듈이 없을 때
// `TurboModuleRegistry.getEnforcing()`이 던지는 에러는 Metro가 "치명적 에러"로
// 취급해서 try/catch로 못 잡음. 그래서 이 패키지를 아예 import하기 "전에"
// TurboModuleRegistry.get()(안 던지는 버전)으로 네이티브 모듈 존재 여부부터
// 확인하고, 없으면 이 패키지 자체를 절대 불러오지 않도록 함.
//
// ⚠️ 2026-08-27 추가: 이용약관(TERMS_OF_SERVICE.md) 링크 추가 — 스토어 심사 요건
// (개인정보처리방침과 동일하게 GitHub 파일 뷰 방식, public repo라 별도 호스팅 불필요).
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, TurboModuleRegistry, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { endpoints } from '@/api/endpoints';
import { useAuth } from '@/hooks/useAuth';
import i18n, { AppLang } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { colors } from '@/theme/colors';

const LANGS: { code: AppLang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
];

// 스토어 등록 URL과 동일하게 유지 (GitHub Pages — docs/ 폴더를 웹페이지로 게시)
const PRIVACY_POLICY_URL = 'https://020215iris-sys.github.io/Match-K/privacy.html';
const TERMS_OF_SERVICE_URL = 'https://020215iris-sys.github.io/Match-K/terms.html';

// TurboModuleRegistry.get()은 getEnforcing()과 달리 없어도 안 던지고 null 반환 —
// 이걸로 먼저 확인해야 google-signin 패키지를 아예 안 불러올 수 있음(Expo Go 대응).
const isGoogleSignInAvailable = () => TurboModuleRegistry.get('RNGoogleSignin') != null;


export default function ProfileScreen() {
  const { t } = useTranslation();
  const { lang, setLang, userName } = useAppStore();
  const { logout, deleteAccount, loginWithGoogle } = useAuth();

  // 구글 로그인 (네이티브 Google Sign-In — expo-auth-session 리다이렉트 방식은
  // standalone 빌드에서 앱으로 복귀가 안 되는 문제가 있어 2026-08-24 교체).
  // 액세스 토큰 방식: 설치형 앱은 id_token만으론 서버 userinfo 조회가 안 돼서 accessToken 사용.
  useEffect(() => {
    if (!isGoogleSignInAvailable()) return; // Expo Go 등 — 패키지 자체를 안 불러옴
    import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
      GoogleSignin.configure({
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
        offlineAccess: false,
      });
    });
  }, []);

  const handleGoogleLogin = async () => {
    if (!isGoogleSignInAvailable()) {
      Alert.alert(t('profile.devBuildRequired'));
      return;
    }
    try {
      const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // 사용자가 취소함 — 조용히 무시
      const { accessToken } = await GoogleSignin.getTokens();
      await loginWithGoogle(accessToken);
      Alert.alert('✓', t('profile.loginGoogle'));
    } catch {
      Alert.alert(t('common.error'));
    }
  };

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
        onPress={handleGoogleLogin}
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
        style={styles.linkRow}
        onPress={() => WebBrowser.openBrowserAsync(TERMS_OF_SERVICE_URL)}
      >
        <Text style={styles.linkText}>{t('profile.terms')}</Text>
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
