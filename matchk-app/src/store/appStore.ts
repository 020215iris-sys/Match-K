/** 전역 상태 (zustand) — 유저/언어/위치 최소한만. 서버 데이터는 화면별 fetch */
import { create } from 'zustand';

import type { AppLang } from '@/i18n';

interface AppState {
  userName: string | null;
  lang: AppLang;
  location: { lat: number; lng: number } | null;
  introSeen: boolean;
  recentSearches: string[]; // 이전 검색어 내역 (세션 내 유지)
  setUser: (name: string | null) => void;
  setLang: (lang: AppLang) => void;
  setLocation: (loc: { lat: number; lng: number } | null) => void;
  setIntroSeen: (seen: boolean) => void;
  addRecentSearch: (q: string) => void;
  removeRecentSearch: (q: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  userName: null,
  lang: 'en',
  location: null,
  introSeen: false,
  recentSearches: [],
  setUser: (userName) => set({ userName }),
  setLang: (lang) => set({ lang }),
  setLocation: (location) => set({ location }),
  setIntroSeen: (introSeen) => set({ introSeen }),
  addRecentSearch: (q) =>
    set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x !== q)].slice(0, 8) })),
  removeRecentSearch: (q) =>
    set((s) => ({ recentSearches: s.recentSearches.filter((x) => x !== q) })),
}));
