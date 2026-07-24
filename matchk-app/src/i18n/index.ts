/**
 * i18n 초기화 (D2 [A]).
 * OS 로케일 자동 감지 (스코프 v2 §4): ko / ja / zh(간체 통합) / 그 외 en 폴백.
 * 온보딩 언어 선택 화면 없음 — 설정에서 수동 변경만 제공.
 */
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import zh from './locales/zh.json';

export type AppLang = 'ko' | 'en' | 'ja' | 'zh';

export function detectDeviceLang(): AppLang {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase() ?? 'en';
  if (code.startsWith('ko')) return 'ko';
  if (code.startsWith('ja')) return 'ja';
  if (code.startsWith('zh')) return 'zh'; // zh-CN/TW/HK 통합 (MVP)
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    ja: { translation: ja },
    zh: { translation: zh },
  },
  lng: detectDeviceLang(),
  fallbackLng: 'en',
  compatibilityJSON: 'v3', // Hermes에 Intl.PluralRules 없음 → v3 포맷으로 경고 제거
  interpolation: { escapeValue: false },
});

export default i18n;
