/** 네비게이션 뼈대 — 스택만, 탭 없음. 홈이 허브. (2026-07-31 설계 개편 반영) */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { colors } from '@/theme/colors';
import AchievementDistrictsScreen from '@/screens/AchievementDistrictsScreen';
import AchievementMapScreen from '@/screens/AchievementMapScreen';
import DistrictLandmarksScreen from '@/screens/DistrictLandmarksScreen';
import HomeScreen from '@/screens/HomeScreen';
import ItineraryDetailScreen from '@/screens/ItineraryDetailScreen';
import LandmarkDetailScreen from '@/screens/LandmarkDetailScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import SchedulerMainScreen from '@/screens/SchedulerMainScreen';
import SearchScreen from '@/screens/SearchScreen';

/** 일정에 담을 장소 페이로드 — 검색 상세 → 스케줄러 왕복 연결용 (참조 키만) */
export type PlacePayload = {
  contentid: string;
  title?: string;
  lat?: number | null;
  lng?: number | null;
  sigunguCode?: number | null;
  contenttypeid?: string | null;
};

export type RootStackParamList = {
  Home: undefined;
  // pick 있으면 '일정 담기 모드' — 결과 선택 시 그 일정 상세로 돌아가 일차 선택 후 추가
  Search: { pick?: { itineraryId: number } } | undefined;
  LandmarkDetail: { contentid: string; title?: string };
  // 스케줄러
  SchedulerMain: { addPlace?: PlacePayload } | undefined;
  ItineraryDetail: { itineraryId: number; addPlace?: PlacePayload };
  // 업적지도 3단
  AchievementMap: undefined;        // ① 전체지도
  AchievementDistricts: undefined;  // ② 구지도
  DistrictLandmarks: { sigunguCode: number; name: string }; // ③ 구 상세(지도+리스트)
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontWeight: '600' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: '' }} />
        <Stack.Screen
          name="LandmarkDetail"
          component={LandmarkDetailScreen}
          options={({ route }) => ({ title: route.params.title ?? '' })}
        />
        {/* TODO(공용): 헤더 타이틀 i18n 처리 */}
        <Stack.Screen name="SchedulerMain" component={SchedulerMainScreen} options={{ title: '스케줄러' }} />
        <Stack.Screen name="ItineraryDetail" component={ItineraryDetailScreen} options={{ title: '일정' }} />
        <Stack.Screen name="AchievementMap" component={AchievementMapScreen} options={{ title: '업적지도' }} />
        <Stack.Screen name="AchievementDistricts" component={AchievementDistrictsScreen} options={{ title: '부산 구별' }} />
        <Stack.Screen
          name="DistrictLandmarks"
          component={DistrictLandmarksScreen}
          options={({ route }) => ({ title: route.params.name })}
        />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: '프로필' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
