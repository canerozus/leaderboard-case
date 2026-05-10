import { api } from '@/shared/api';
import type { HistoryResponse } from '@/shared/types/api.types';

export const historyApi = {
  list: (limit = 10): Promise<HistoryResponse> => api.get(`/history?limit=${limit}`),
};
