/** 전역 상태 (zustand) — 유저/언어/위치 최소한만. 서버 데이터는 화면별 fetch */
import { create } from 'zustand';

import type { AppLang } from '@/i18n';

interface AppState {
  userName: string | null;
  lang: AppLang;
  location: { lat: number; lng: number } | null;
  introSeen: boolean;
  setUser: (name: string | null) => void;
  setLang: (lang: AppLang) => void;
  setLocation: (loc: { lat: number; lng: number } | null) => void;
  setIntroSeen: (seen: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  userName: null,
  lang: 'en',
  location: null,
  introSeen: false,
  setUser: (userName) => set({ userName }),
  setLang: (lang) => set({ lang }),
  setLocation: (location) => set({ location }),
  setIntroSeen: (introSeen) => set({ introSeen }),
}));
