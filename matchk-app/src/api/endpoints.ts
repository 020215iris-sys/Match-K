/** 백엔드 엔드포인트 래퍼 — E의 API 스펙 문서(D5 [E])와 1:1 대응 유지 */
import { api } from './client';

export interface TourItem {
  contentid: string;
  title: string;
  firstimage?: string;
  addr1?: string;
  mapx?: string;
  mapy?: string;
  sigungucode?: string;
}

export interface Recommendation {
  contentid: string;
  title: string;
  image: string;
  sigunguCode: number | null;
  lat: number | null;
  lng: number | null;
  score: number;
  congestion: number | null;
  reasons: string[];
  /** true=유저 언어판으로 표시 중 / false=내 언어권 미등록(컨셉 타깃) / null·undefined=판별 불가 */
  availableInYourLanguage?: boolean | null;
}

export interface DistrictProgress {
  sigunguCode: number;
  name: string;
  isDeclining: boolean;
  total: number;
  stamped: number;
  progress: number;
}

export const endpoints = {
  guestLogin: (lang: string) =>
    api<{ token: string; user: { id: number; name: string; lang: string } }>(
      `/auth/guest?lang=${lang}`, { method: 'POST', auth: false }),

  recommendations: (type: 'auto' | 'nearby', lang: string, lat?: number, lng?: number) => {
    const pos = lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : '';
    return api<{ items: Recommendation[] }>(`/api/recommendations?type=${type}&lang=${lang}${pos}`);
  },

  search: (q: string, lang: string) =>
    api<{ items: TourItem[]; fallbackNearby: TourItem[] }>(
      `/api/search?q=${encodeURIComponent(q)}&lang=${lang}`),

  landmarksByDistrict: (district: number, lang: string, type?: number) =>
    api<{ items: TourItem[]; count: number }>(
      `/api/landmarks?district=${district}&lang=${lang}${type ? `&type=${type}` : ''}`),

  landmarkDetail: (contentid: string, lang: string) =>
    api<{ detail: Record<string, string>; stamped: boolean; district: string | null;
          availableInYourLanguage?: boolean; translated?: boolean;
          stampLat: number | null; stampLng: number | null }>(
      `/api/landmarks/${contentid}?lang=${lang}`),

  relatedLandmarks: (contentid: string) =>
    api<{ items: TourItem[] }>(`/api/landmarks/${contentid}/related`),

  // 위치는 전송하지 않음 — 거리 검증은 앱에서 완료된 뒤 contentid만 전송 (위치정보보호법)
  createStamp: (contentid: string) =>
    api<{ stampId: number; isHidden: boolean }>('/api/stamps', { method: 'POST', body: { contentid } }),

  // 히든 미션: 잠금 해제 여부 + 발견 개수(총 개수 비공개)
  hiddenStatus: () =>
    api<{ unlocked: boolean; mapProgress: number; stampProgress: number;
          mapThreshold: number; stampThreshold: number; discovered: number }>(
      '/api/hidden/status'),

  // 근접 판정용 히든 장소 좌표 (이름 없음 — 조우 시 상세 API로 조회). 잠금 전엔 빈 목록.
  hiddenLandmarks: () =>
    api<{ items: { contentid: string; lat: number; lng: number }[]; unlocked: boolean }>(
      '/api/hidden/landmarks'),

  progress: () =>
    api<{ districts: DistrictProgress[]; totalLandmarks: number; totalStamped: number }>(
      '/api/stamps/progress'),

  updateLanguage: (lang: string) =>
    api<{ lang: string }>('/api/users/me/language', { method: 'PATCH', body: { lang } }),

  // 회원탈퇴 — 계정+도장 영구 삭제 (스토어 심사 필수)
  deleteAccount: () =>
    api<null>('/api/users/me', { method: 'DELETE' }),
};
