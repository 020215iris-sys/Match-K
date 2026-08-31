/** 업적지도 ① 전체지도 (2026-08 개편) — 부산 16개 구·군을 실제 상대 위치에 배치한
 *  색칠형 지도. 구마다 도장 비율만큼 진하게 채워진다("색칠하는 느낌").
 *  구 타일을 바로 탭하면 그 구 상세(③)로 이동 — 중간 그리드 페이지는
 *  "리스트로 보기" 링크로 뺐다(② AchievementDistrictsScreen, 목록형 대안 화면).
 *
 *  ⚠️ 타일 배치는 실제 좌표(GIS)가 아니라 강서구=서쪽·크다, 영도구=섬(남쪽 분리)
 *  같은 실제 상대 위치·인접 관계만 맞춘 손조정 값이다 — 디자인팀 최종 폴리곤
 *  지도 나오면 이 레이아웃 상수만 교체하면 됨(구조는 그대로 재사용 가능). */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DistrictLayout {
  code: number;
  nameKo: string;
  x: number; y: number; w: number; h: number;
}

// 부산 16개 구·군 — 실제 상대 위치(서→동, 북→남) 손배치. viewBox 0 0 400 400.
const LAYOUT: DistrictLayout[] = [
  { code: 1,  nameKo: '강서구',   x: 10,  y: 10,  w: 60,  h: 320 }, // 서쪽 전체, 가장 큼
  { code: 8,  nameKo: '북구',     x: 74,  y: 10,  w: 60,  h: 158 },
  { code: 2,  nameKo: '금정구',   x: 138, y: 10,  w: 124, h: 104 },
  { code: 3,  nameKo: '기장군',   x: 266, y: 10,  w: 124, h: 104 }, // 북동쪽 끝
  { code: 6,  nameKo: '동래구',   x: 138, y: 118, w: 124, h: 50  },
  { code: 16, nameKo: '해운대구', x: 266, y: 118, w: 124, h: 104 }, // 동쪽 해안
  { code: 9,  nameKo: '사상구',   x: 74,  y: 172, w: 60,  h: 50  },
  { code: 13, nameKo: '연제구',   x: 138, y: 172, w: 124, h: 50  },
  { code: 10, nameKo: '사하구',   x: 74,  y: 226, w: 60,  h: 50  },
  { code: 7,  nameKo: '부산진구', x: 138, y: 226, w: 124, h: 50  },
  { code: 12, nameKo: '수영구',   x: 266, y: 226, w: 124, h: 50  },
  { code: 11, nameKo: '서구',     x: 74,  y: 280, w: 60,  h: 50  },
  { code: 15, nameKo: '중구',     x: 138, y: 280, w: 60,  h: 50  }, // 가장 작음
  { code: 5,  nameKo: '동구',     x: 202, y: 280, w: 60,  h: 50  },
  { code: 4,  nameKo: '남구',     x: 266, y: 280, w: 124, h: 50  },
  { code: 14, nameKo: '영도구',   x: 138, y: 334, w: 124, h: 50  }, // 섬 — 남쪽 분리
];

interface ProgressByCode {
  [code: number]: { name: string; progress: number; isDeclining: boolean };
}

export default function AchievementMapScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [totals, setTotals] = useState({ stamped: 0, total: 0 });
  const [byCode, setByCode] = useState<ProgressByCode>({});

  useEffect(() => {
    endpoints
      .progress()
      .then((r) => {
        setTotals({ stamped: r.totalStamped, total: r.totalLandmarks });
        const map: ProgressByCode = {};
        for (const d of r.districts) {
          map[d.sigunguCode] = { name: d.name, progress: d.progress, isDeclining: d.isDeclining };
        }
        setByCode(map);
      })
      .catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {t('map.progress', { stamped: totals.stamped, total: totals.total })}
        </Text>
        <Pressable onPress={() => navigation.navigate('AchievementDistricts')} hitSlop={8}>
          <Text style={styles.listLink}>{t('map.viewAsList')}</Text>
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <Svg viewBox="0 0 400 400" style={styles.svg}>
          {LAYOUT.map((d) => {
            const info = byCode[d.code];
            const progress = info?.progress ?? 0;
            const isDeclining = info?.isDeclining ?? false;
            // 도장 비율만큼 진하게 — 0%는 옅은 틴트, 100%는 꽉 찬 색 ("색칠하는 느낌")
            const fillOpacity = 0.12 + progress * 0.88;
            const labelColor = progress > 0.5 ? '#FFFFFF' : colors.textPrimary;
            return (
              <React.Fragment key={d.code}>
                <Rect
                  x={d.x} y={d.y} width={d.w} height={d.h} rx={8}
                  fill={colors.primary}
                  fillOpacity={fillOpacity}
                  stroke={isDeclining ? colors.stampGold : colors.border}
                  strokeWidth={isDeclining ? 2.5 : 1}
                  onPress={() =>
                    navigation.navigate('DistrictLandmarks', {
                      sigunguCode: d.code,
                      name: info?.name ?? d.nameKo,
                    })
                  }
                />
                <SvgText
                  x={d.x + d.w / 2} y={d.y + d.h / 2 + 4}
                  fontSize={11} fontWeight="700" fill={labelColor}
                  textAnchor="middle"
                >
                  {d.nameKo}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      </View>

      <Text style={styles.hint}>{t('map.tapBusan')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  progressBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.surface,
  },
  progressText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  listLink: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textDecorationLine: 'underline' },
  mapWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  svg: { width: '100%', aspectRatio: 1 },
  hint: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, paddingBottom: 16 },
});
