import { api } from '@/shared/api';
import type { AuthSuccess } from '@/shared/types/api.types';

export interface RegisterInput {
  username: string;
  password: string;
  displayName: string;
  country?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export const authApi = {
  register: (body: RegisterInput): Promise<AuthSuccess> => api.post('/auth/register', body),
  login:    (body: LoginInput):    Promise<AuthSuccess> => api.post('/auth/login', body),
};
