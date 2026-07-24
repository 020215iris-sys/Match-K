/** GPS 위치 훅 (expo-location). 권한 거부/실패 시 null → 호출부에서 부산 중심 폴백 */
import * as Location from 'expo-location';
import { useEffect } from 'react';

import { useAppStore } from '@/store/appStore';

export const BUSAN_CENTER = { lat: 35.1796, lng: 129.0756 };

export function useLocation() {
  const { location, setLocation } = useAppStore();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (mounted) setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        // GPS 실패 — location은 null 유지 (부산 중심 폴백은 호출부에서)
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setLocation]);

  return location ?? null;
}
