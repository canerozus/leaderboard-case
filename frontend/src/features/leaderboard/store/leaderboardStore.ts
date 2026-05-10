import { create } from 'zustand';

interface LbState {
  pendingDelta: number;
  lastKnownRank: number | null;
  addPendingDelta:    (n: number) => void;
  rollbackPending:    (n: number) => void;
  clearPendingDelta:  () => void;
  setLastKnownRank:   (rank: number | null) => void;
}

export const useLeaderboardStore = create<LbState>((set) => ({
  pendingDelta: 0,
  lastKnownRank: null,
  addPendingDelta:   (n) => set((s) => ({ pendingDelta: s.pendingDelta + n })),
  rollbackPending:   (n) => set((s) => ({ pendingDelta: Math.max(0, s.pendingDelta - n) })),
  clearPendingDelta: ()  => set({ pendingDelta: 0 }),
  setLastKnownRank:  (r) => set({ lastKnownRank: r }),
}));
