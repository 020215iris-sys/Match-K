/** 색상/디자인 가이드 (스코프 v2 §12) — D가 Figma 확정 후 여기만 갱신 */
export const colors = {
  primary: '#185FA5', // 부산 바다 블루
  stampGold: '#E8B23A', // 도장 인증 강조
  background: '#FFFFFF',
  surface: '#F5F6F8',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  danger: '#DC2626',
};

/** 업적지도 색칠: 진행률 → 부산 블루 투명도 (단색 투명도 방식, 스코프 v2 §3-1) */
export function progressToOpacity(progress: number): number {
  if (progress <= 0) return 0.06; // 미방문 구도 살짝 표시
  return Math.min(1, Math.max(0.2, progress));
}
