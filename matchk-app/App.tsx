import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/i18n'; // i18n 초기화 (사이드이펙트)
import RootNavigator from '@/navigation/RootNavigator';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store/appStore';
import { detectDeviceLang } from '@/i18n';

function Bootstrap() {
  const setLang = useAppStore((s) => s.setLang);
  React.useEffect(() => {
    setLang(detectDeviceLang());
  }, [setLang]);
  useAuth(); // 토큰 없으면 게스트 로그인
  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Bootstrap />
    </SafeAreaProvider>
  );
}
