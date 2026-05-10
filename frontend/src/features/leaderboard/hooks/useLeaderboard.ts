import { useQuery } from '@tanstack/react-query';
import { leaderboardApi } from '../api/leaderboardApi';

export const lbKeys = {
  all:      ['leaderboard'] as const,
  top:      () => [...lbKeys.all, 'top']      as const,
  me:       () => [...lbKeys.all, 'me']       as const,
  state:    () => [...lbKeys.all, 'state']    as const,
  profile:  () => [...lbKeys.all, 'profile']  as const,
};

const TOP_ME_INTERVAL_MS = 7_000;
const STATE_INTERVAL_MS  = 5_000;

export function useTop() {
  return useQuery({
    queryKey: lbKeys.top(),
    queryFn:  leaderboardApi.top,
    refetchInterval: TOP_ME_INTERVAL_MS,
  });
}

export function useMe() {
  return useQuery({
    queryKey: lbKeys.me(),
    queryFn:  leaderboardApi.me,
    refetchInterval: TOP_ME_INTERVAL_MS,
  });
}

export function useLbState() {
  return useQuery({
    queryKey: lbKeys.state(),
    queryFn:  leaderboardApi.state,
    refetchInterval: STATE_INTERVAL_MS,
  });
}

export function useMeProfile() {
  return useQuery({
    queryKey: lbKeys.profile(),
    queryFn:  leaderboardApi.meProfile,
    staleTime: 30_000,
    refetchInterval: TOP_ME_INTERVAL_MS,
  });
}
