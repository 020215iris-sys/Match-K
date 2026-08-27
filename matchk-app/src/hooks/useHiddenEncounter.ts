/** 히든 미션 조우 팝업 상태 관리 (2026-08 개편: GPS 근접 감지 → 구별 도장 비율 트리거).
 *
 *  이전 방식은 히든 좌표 목록을 받아 15초마다 GPS를 읽어 근접을 판정했다.
 *  지금은 위치를 전혀 읽지 않는다 — 서버(stamps.py district_status)가
 *  "이 구는 조건을 채웠다(hiddenReady) + 대상은 이거다(targetContentId)"까지 이미 계산해서
 *  내려주므로, 이 훅은 그 값을 받아 팝업 열림/닫힘/수집 상태만 관리한다.
 *  ⚠️ 위치정보보호법 문서와 무관해짐 — 더 이상 GPS를 다루지 않기 때문. */
import { useEffect, useState } from 'react';

import { endpoints } from '@/api/endpoints';

interface UseHiddenEncounterArgs {
  /** 이 구의 히든 발동 조건(구 도장 비율) 달성 여부 — /api/stamps/district/{code}의 hiddenReady */
  hiddenReady: boolean;
  /** 서버가 지정한 이 구의 히든 후보 contentid. 조건 미달이거나 다 모았으면 null */
  targetContentId: string | null;
}

export function useHiddenEncounter({ hiddenReady, targetContentId }: UseHiddenEncounterArgs) {
  const [visible, setVisible] = useState(false);
  const [collecting, setCollecting] = useState(false);

  // 구를 이동하거나(다른 sigunguCode) 대상이 바뀌면 이전 구의 팝업이 열려있지 않도록 초기화
  useEffect(() => {
    setVisible(false);
  }, [targetContentId]);

  const canOpen = hiddenReady && targetContentId !== null;

  const open = () => {
    if (canOpen) setVisible(true);
  };

  const dismiss = () => setVisible(false);

  /** 팝업의 "찍겠습니까?" 확정 — GPS 재검증 없음(화면 내 팝업 자체가 트리거). */
  const collect = async (onCollected?: (contentid: string) => void) => {
    if (!targetContentId || collecting) return;
    setCollecting(true);
    try {
      await endpoints.createStamp(targetContentId);
      setVisible(false);
      onCollected?.(targetContentId);
    } finally {
      setCollecting(false);
    }
  };

  return { visible, collecting, canOpen, open, dismiss, collect, targetContentId };
}
