import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  plan: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  setSessionFromToken: (token: string) => boolean;
  logout: () => void;
  clearError: () => void;
  upgradePlan: (newPlan: string) => Promise<boolean>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const networkErrorMessage = (err: unknown, fallback: string) => {
  const msg = err instanceof Error ? err.message || fallback : fallback;
  if (msg === 'Failed to fetch' || msg.includes('fetch failed') || msg.includes('NetworkError')) {
    return 'Cannot connect to the backend server. Please verify the API service is running and try again.';
  }
  return msg;
};

// Decodes the (already-server-verified) JWT's claims payload client-side so
// we can populate `user` without an extra round trip. This does NOT verify
// the signature — every subsequent API call still goes through the backend's
// AuthMiddleware/VerifyToken, so a tampered token just fails there instead.
function decodeTokenClaims(token: string): User | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    const claims = JSON.parse(json);
    return { id: claims.id, email: claims.email, name: claims.name, plan: claims.plan };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoading: false,
      error: null,
      hasHydrated: false,

      setHasHydrated: (v) => set({ hasHydrated: v }),
      clearError: () => set({ error: null }),

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Invalid credentials');
          }

          const data = await res.json();
          set({ token: data.token, user: data.user, isLoading: false });
          return true;
        } catch (err: unknown) {
          set({ error: networkErrorMessage(err, 'Login failed'), isLoading: false });
          return false;
        }
      },

      signup: async (name, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_URL}/api/auth/signup`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password }),
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText || 'Signup failed');
          }

          // Auto login after signup
          set({ isLoading: false });
          return get().login(email, password);
        } catch (err: unknown) {
          set({ error: networkErrorMessage(err, 'Signup failed'), isLoading: false });
          return false;
        }
      },

      setSessionFromToken: (token) => {
        const user = decodeTokenClaims(token);
        if (!user) return false;
        set({ token, user, error: null });
        return true;
      },

      logout: () => {
        set({ token: null, user: null, error: null });
      },

      upgradePlan: async (newPlan) => {
        const token = get().token;
        if (!token) return false;
        try {
          const res = await fetch(`${API_URL}/api/auth/upgrade`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ plan: newPlan }),
          });

          if (!res.ok) {
            throw new Error('Failed to upgrade plan');
          }

          const data = await res.json();
          set({ token: data.token, user: data.user });
          return true;
        } catch (err: unknown) {
          console.error("Upgrade error", err);
          return false;
        }
      },
    }),
    {
      name: 'infracanvas-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
