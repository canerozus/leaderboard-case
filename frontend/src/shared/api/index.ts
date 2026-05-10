import { ApiClient } from './client';
import { useAuthStore } from '@/features/auth/store/authStore';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const api = new ApiClient({
  baseUrl,
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
});

export { ApiHttpError, UnauthorizedError } from './client';
