/** 히든 미션 조우 감지 (포켓몬 고식).
 *  ⚠️ 위치정보보호법: 서버에서 히든 좌표만 받아오고, 근접 판정은 단말기 내에서 수행.
 *     사용자 GPS는 서버로 전송하지 않는다. */
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import { endpoints } from '@/api/endpoints';
import { haversineM, STAMP_RADIUS_M } from '@/utils/geo';

// 조우 감지 반경 (도장 반경보다 살짝 넓게 — "근처에 숨은 곳이 있어요" 예고 느낌)
const ENCOUNTER_RADIUS_M = 150;
const POLL_MS = 15000; // 15초마다 근접 확인

export interface HiddenEncounter {
  contentid: string;
  distanceM: number;
}

export function useHiddenEncounter(enabled: boolean) {
  const [encounter, setEncounter] = useState<HiddenEncounter | null>(null);
  const spots = useRef<{ contentid: string; lat: number; lng: number }[]>([]);
  const dismissed = useRef<Set<string>>(new Set());

  // 잠금 해제 시 히든 좌표 목록 1회 로드
  useEffect(() => {
    if (!enabled) return;
    endpoints.hiddenLandmarks()
      .then((res) => { spots.current = res.unlocked ? res.items : []; })
      .catch(() => { spots.current = []; });
  }, [enabled]);

  // 주기적으로 현재 위치 ↔ 히든 좌표 근접 판정 (단말기 내 계산)
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const check = async () => {
      if (spots.current.length === 0) return;
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        for (const s of spots.current) {
          if (dismissed.current.has(s.contentid)) continue;
          const d = haversineM(pos.coords.latitude, pos.coords.longitude, s.lat, s.lng);
          if (d <= ENCOUNTER_RADIUS_M && active) {
            setEncounter({ contentid: s.contentid, distanceM: Math.round(d) });
            break;
          }
        }
      } catch {
        /* GPS 실패 시 조용히 스킵 */
      }
    };
    check();
    const id = setInterval(check, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, [enabled]);

  const dismiss = () => {
    if (encounter) dismissed.current.add(encounter.contentid);
    setEncounter(null);
  };

  return { encounter, dismiss, canStamp: (d: number) => d <= STAMP_RADIUS_M };
}
