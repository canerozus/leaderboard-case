import { api } from '@/shared/api';
import type {
  MeProfileResponse, MeResponse, StateResponse, TopResponse,
} from '@/shared/types/api.types';

export const leaderboardApi = {
  top:        (): Promise<TopResponse>      => api.get('/leaderboard/top'),
  me:         (): Promise<MeResponse>       => api.get('/leaderboard/me'),
  state:      (): Promise<StateResponse>    => api.get('/leaderboard/state'),
  meProfile:  (): Promise<MeProfileResponse> => api.get('/me'),
  submit:     (delta: number): Promise<null> => api.post('/score/submit', { delta }),
};
