import { afterEach, describe, expect, test } from 'vitest';
import { useLeaderboardStore } from './leaderboardStore';

afterEach(() => {
  useLeaderboardStore.setState({ pendingDelta: 0, lastKnownRank: null });
});

describe('leaderboardStore', () => {
  test('starts with pendingDelta=0 and lastKnownRank=null', () => {
    const s = useLeaderboardStore.getState();
    expect(s.pendingDelta).toBe(0);
    expect(s.lastKnownRank).toBeNull();
  });

  test('addPendingDelta accumulates', () => {
    useLeaderboardStore.getState().addPendingDelta(2);
    useLeaderboardStore.getState().addPendingDelta(3);
    expect(useLeaderboardStore.getState().pendingDelta).toBe(5);
  });

  test('clearPendingDelta resets to 0', () => {
    useLeaderboardStore.getState().addPendingDelta(7);
    useLeaderboardStore.getState().clearPendingDelta();
    expect(useLeaderboardStore.getState().pendingDelta).toBe(0);
  });

  test('rollbackPending decrements by amount', () => {
    useLeaderboardStore.getState().addPendingDelta(5);
    useLeaderboardStore.getState().rollbackPending(2);
    expect(useLeaderboardStore.getState().pendingDelta).toBe(3);
  });

  test('setLastKnownRank stores the rank', () => {
    useLeaderboardStore.getState().setLastKnownRank(42);
    expect(useLeaderboardStore.getState().lastKnownRank).toBe(42);
  });
});
