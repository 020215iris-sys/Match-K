/** 인증 훅 — 앱 시작 시 토큰 없으면 게스트 로그인 (개발 편의 + 부록 D 폴백).
 *  Google OAuth는 expo-auth-session으로 D2 [A]에서 연결 (EAS dev build 필요). */
import { useEffect, useState } from 'react';

import { clearToken, getToken, setToken } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useAppStore } from '@/store/appStore';

export function useAuth() {
  const [ready, setReady] = useState(false);
  const { lang, setUser } = useAppStore();

  useEffect(() => {
    (async () => {
      try {
        const existing = await getToken();
        if (!existing) {
          const res = await endpoints.guestLogin(lang);
          await setToken(res.token);
          setUser(res.user.name);
        }
      } catch {
        // 백엔드 미기동 시에도 앱은 뜨게 (화면들이 개별 폴백 처리)
      } finally {
        setReady(true);
      }
    })();
  }, [lang, setUser]);

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  // 구글 로그인 — 앱에서 받은 액세스 토큰을 서버로 보내 검증받고 JWT 저장
  const loginWithGoogle = async (accessToken: string) => {
    const res = await endpoints.googleLogin(accessToken);
    await setToken(res.token);
    setUser(res.user.name);
  };

  // 회원탈퇴 — 서버에서 계정·도장 삭제 후 로컬 토큰 정리
  const deleteAccount = async () => {
    await endpoints.deleteAccount();
    await clearToken();
    setUser(null);
  };

  return { ready, logout, deleteAccount, loginWithGoogle };
}
