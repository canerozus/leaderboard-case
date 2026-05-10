import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leaderboardApi } from '../api/leaderboardApi';
import { useLeaderboardStore } from '../store/leaderboardStore';
import { ApiHttpError } from '@/shared/api';
import { lbKeys } from './useLeaderboard';

const DELTA = 1;

export function useTapToEarn() {
  const qc = useQueryClient();
  const addPending      = useLeaderboardStore((s) => s.addPendingDelta);
  const rollbackPending = useLeaderboardStore((s) => s.rollbackPending);

  return useMutation({
    mutationFn: () => leaderboardApi.submit(DELTA),
    onMutate: () => {
      addPending(DELTA);
      return { delta: DELTA };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: lbKeys.me() });
      void qc.invalidateQueries({ queryKey: lbKeys.top() });
      void qc.invalidateQueries({ queryKey: lbKeys.state() });
    },
    onError: (err, _vars, context) => {
      if (context) rollbackPending(context.delta);
      if (err instanceof ApiHttpError && err.status === 429) {
        return;
      }
    },
  });
}
