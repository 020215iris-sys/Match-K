/** 네비게이션 뼈대 — 스택만, 탭 없음 (D1 [A]) */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { colors } from '@/theme/colors';
import AchievementMapScreen from '@/screens/AchievementMapScreen';
import DistrictLandmarksScreen from '@/screens/DistrictLandmarksScreen';
import HomeScreen from '@/screens/HomeScreen';
import LandmarkDetailScreen from '@/screens/LandmarkDetailScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import SchedulerScreen from '@/screens/SchedulerScreen';

export type RootStackParamList = {
  Home: undefined;
  AchievementMap: undefined;
  DistrictLandmarks: { sigunguCode: number; name: string };
  Scheduler: undefined;
  LandmarkDetail: { contentid: string; title?: string };
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
        <Stack.Screen name="AchievementMap" component={AchievementMapScreen} />
        <Stack.Screen
          name="DistrictLandmarks"
          component={DistrictLandmarksScreen}
          options={({ route }) => ({ title: route.params.name })}
        />
        <Stack.Screen name="Scheduler" component={SchedulerScreen} />
        <Stack.Screen
          name="LandmarkDetail"
          component={LandmarkDetailScreen}
          options={({ route }) => ({ title: route.params.title ?? '' })}
        />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
