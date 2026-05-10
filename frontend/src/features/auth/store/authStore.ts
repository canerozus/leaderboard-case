import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PublicUser } from '@/shared/types/api.types';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  login: (token: string, user: PublicUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login:  (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      isAuthenticated: () => get().token !== null,
    }),
    {
      name: 'leaderboard-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);
