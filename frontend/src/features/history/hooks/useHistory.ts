import { useQuery } from '@tanstack/react-query';
import { historyApi } from '../api/historyApi';

export function useHistory(limit = 10) {
  return useQuery({
    queryKey: ['history', limit],
    queryFn:  () => historyApi.list(limit),
    staleTime: 60_000,
  });
}
