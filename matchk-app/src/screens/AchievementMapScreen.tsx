/** 업적지도 ① 전체지도 (2026-08 개편) — 부산 16개 구·군을 실제 부산 행정지도
 *  참고해서 손으로 뜬 폴리곤(사각 타일 아님)으로 배치. 구마다 고유색(HSL 색상환
 *  16등분)을 갖고, 그 안에서 도장 비율만큼 fillOpacity로 진하게 채워진다
 *  ("색칠하는 느낌"). 색상 팔레트 표·선정 근거는 docs/achievement-map.md 참고.
 *  구 타일을 바로 탭하면 그 구 상세(③)로 이동 — 중간 그리드 페이지는
 *  "리스트로 보기" 링크로 뺐다(② AchievementDistrictsScreen, 목록형 대안 화면).
 *
 *  ⚠️ 폴리곤은 실제 GIS 좌표가 아니라 참고 지도 이미지 보고 눈대중으로 뜬
 *  근사 형태다(강서구 서쪽 큰 덩어리, 기장군 북동쪽 돌출, 영도구 남쪽 좁은 목
 *  섬 등 실루엣만 맞춤) — 디자인팀 최종 폴리곤 지도 나오면 LAYOUT의 points만
 *  교체하면 됨(구조는 그대로 재사용 가능). */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';

import { endpoints } from '@/api/endpoints';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { colors } from '@/theme/colors';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DistrictLayout {
  code: number;
  nameKo: string;
  points: string; // SVG <Polygon points="x,y x,y ...">
  labelX: number; labelY: number;
  color: string; // 구별 고유색(진행률은 fillOpacity로 표현 — docs/achievement-map.md 참고)
}

// 부산 16개 구·군 — 실제 부산 행정지도 참고해서 손으로 뜬 근사 폴리곤(실제 GIS
// 좌표 아님). viewBox 0 0 680 720. 영도구만 남쪽 좁은 목으로 이어진 섬 형태.
// color: 구를 한눈에 구분하기 위한 고유색(HSL 색상환 16등분, S58% L48%) —
//        선정 근거·전체 팔레트 표는 docs/achievement-map.md 참고.
const LAYOUT: DistrictLayout[] = [
  { code: 1,  nameKo: '강서구',   labelX: 104, labelY: 445, color: '#C13333',
    points: '20,300 70,290 110,320 140,300 175,330 190,380 175,430 180,460 150,480 160,520 140,560 150,600 130,625 100,615 80,590 60,600 35,570 45,530 30,500 50,470 35,430 55,400 40,360' },
  { code: 9,  nameKo: '사상구',   labelX: 224, labelY: 424, color: '#C16933',
    points: '190,380 230,365 255,390 260,430 250,470 215,480 190,470 200,430 190,400' },
  { code: 8,  nameKo: '북구',     labelX: 267, labelY: 329, color: '#C19E33',
    points: '215,300 250,280 300,285 320,320 310,360 280,375 255,390 230,365 220,330' },
  { code: 2,  nameKo: '금정구',   labelX: 369, labelY: 251, color: '#B0C133',
    points: '300,190 350,170 410,180 440,220 430,270 440,300 400,330 350,325 320,320 300,285 310,240' },
  { code: 3,  nameKo: '기장군',   labelX: 534, labelY: 183, color: '#7AC133',
    points: '440,90 500,60 560,70 610,110 650,150 660,200 630,240 600,270 560,290 510,300 460,290 430,270 440,220' },
  { code: 6,  nameKo: '동래구',   labelX: 369, labelY: 361, color: '#45C133',
    points: '320,320 350,325 400,330 420,360 400,395 365,405 335,385 330,360' },
  { code: 13, nameKo: '연제구',   labelX: 387, labelY: 422, color: '#33C157',
    points: '335,385 365,405 400,395 430,410 425,445 390,455 360,440 345,415' },
  { code: 16, nameKo: '해운대구', labelX: 519, labelY: 360, color: '#33C18C',
    points: '400,330 460,290 510,300 560,290 600,270 620,310 610,360 600,410 560,440 510,450 470,430 440,410 430,410 420,360' },
  { code: 7,  nameKo: '부산진구', labelX: 317, labelY: 454, color: '#33C1C1',
    points: '260,430 300,410 330,420 360,440 390,455 380,480 340,490 300,485 270,470 250,470' },
  { code: 12, nameKo: '수영구',   labelX: 447, labelY: 464, color: '#338CC1',
    points: '390,455 425,445 470,430 490,455 480,490 440,495 410,480' },
  { code: 11, nameKo: '서구',     labelX: 263, labelY: 516, color: '#3357C1',
    points: '250,470 270,470 280,500 300,510 295,545 260,555 230,535 235,500' },
  { code: 5,  nameKo: '동구',     labelX: 322, labelY: 512, color: '#4533C1',
    points: '280,500 300,485 340,490 360,500 350,530 320,540 295,545 300,510' },
  { code: 15, nameKo: '중구',     labelX: 323, labelY: 557, color: '#7A33C1',
    points: '295,545 320,540 350,530 355,560 330,580 300,575 285,560' },
  { code: 4,  nameKo: '남구',     labelX: 399, labelY: 521, color: '#B033C1',
    points: '360,500 380,480 410,480 440,495 450,520 430,555 390,565 360,545 355,560 350,530' },
  { code: 10, nameKo: '사하구',   labelX: 191, labelY: 540, color: '#C1339E',
    points: '180,460 215,480 250,470 235,500 230,535 215,565 220,600 200,630 170,615 150,600 160,520 150,480' },
  { code: 14, nameKo: '영도구',   labelX: 354, labelY: 624, color: '#C13369',
    points: '300,575 330,580 355,560 360,545 390,565 400,600 395,650 370,690 340,700 320,680 310,640 320,610 300,595' },
];

interface ProgressByCode {
  [code: number]: { name: string; progress: number; isDeclining: boolean };
}

export default function AchievementMapScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const [totals, setTotals] = useState({ stamped: 0, total: 0 });
  const [byCode, setByCode] = useState<ProgressByCode>({});
  // 개발 모드 전용 — 실기기 없이도 색칠 그라데이션을 눈으로 바로 확인하기 위한
  // 프리뷰 오버라이드. 프로덕션 빌드(__DEV__ false)에서는 아예 렌더 안 됨.
  const [previewPct, setPreviewPct] = useState<number | null>(null);

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
        <Svg viewBox="0 0 680 720" style={styles.svg}>
          {LAYOUT.map((d) => {
            const info = byCode[d.code];
            const progress = previewPct !== null ? previewPct / 100 : (info?.progress ?? 0);
            const isDeclining = info?.isDeclining ?? false;
            // 도장 비율만큼 진하게 — 0%는 옅은 틴트, 100%는 꽉 찬 색 ("색칠하는 느낌")
            const fillOpacity = 0.12 + progress * 0.88;
            const labelColor = progress > 0.5 ? '#FFFFFF' : colors.textPrimary;
            return (
              <React.Fragment key={d.code}>
                <Polygon
                  points={d.points}
                  fill={d.color}
                  fillOpacity={fillOpacity}
                  // 구끼리는 흰 경계선으로 맞닿게(지도의 행정구역 경계선 느낌).
                  // 소멸위험 구만 금색 테두리로 강조.
                  stroke={isDeclining ? colors.stampGold : colors.background}
                  strokeWidth={isDeclining ? 4 : 2.5}
                  strokeLinejoin="round"
                  onPress={() =>
                    navigation.navigate('DistrictLandmarks', {
                      sigunguCode: d.code,
                      name: info?.name ?? d.nameKo,
                    })
                  }
                />
                <SvgText
                  x={d.labelX} y={d.labelY + 4}
                  fontSize={16} fontWeight="700" fill={labelColor}
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

      {__DEV__ ? (
        <View style={styles.devPreview}>
          <Text style={styles.devPreviewLabel}>
            🎨 색칠 미리보기(개발용) {previewPct !== null ? `— ${previewPct}%` : ''}
          </Text>
          <View style={styles.devPreviewRow}>
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((pct) => (
              <Pressable
                key={pct}
                style={[styles.devChip, previewPct === pct && styles.devChipActive]}
                onPress={() => setPreviewPct(previewPct === pct ? null : pct)}
              >
                <Text style={[styles.devChipText, previewPct === pct && styles.devChipTextActive]}>
                  {pct}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
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
  // 개발용 색칠 미리보기 — __DEV__에서만 렌더, 프로덕션 빌드엔 안 들어감
  devPreview: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.surface,
  },
  devPreviewLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  devPreviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  devChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  devChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  devChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  devChipTextActive: { color: '#FFFFFF' },
});
