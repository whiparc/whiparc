'use client';

import { useAuthStore } from '../../store/useAuthStore';

export function useMarketingCta() {
  const { user, hasHydrated } = useAuthStore();
  const isLoggedIn = hasHydrated && !!user;
  const startHref = isLoggedIn ? '/dashboard' : '/login?mode=signup';
  return { isLoggedIn, startHref };
}
