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
    onMutate: async () => {
      // Cancel any in-flight /me poll so a stale pre-tap response can't race
      // ahead of the optimistic update and clear it on arrival.
      await qc.cancelQueries({ queryKey: lbKeys.me() });
      addPending(DELTA);
      return { delta: DELTA };
    },
    onSuccess: async (_data, _vars, context) => {
      // Wait for the post-mutation /me refetch to land *before* draining the
      // optimistic delta — otherwise the score would briefly drop back to the
      // pre-tap value while the new fetch is in flight.
      await qc.invalidateQueries({ queryKey: lbKeys.me() });
      if (context) rollbackPending(context.delta);
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
