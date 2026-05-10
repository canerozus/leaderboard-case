// backend/src/features/leaderboard/profile.lookup.ts
import { inArray } from 'drizzle-orm';
import { getDb, schema } from '../../shared/db/postgres.js';
import type { LbEntry } from '../../shared/types/api.types.js';
import type { RankedEntry } from '../score/score.repo.js';

/** Hydrate a list of (userId, total) pairs into LbEntries by joining on Postgres users. */
export async function hydrateRankedEntries(ranked: RankedEntry[], firstRank: number): Promise<LbEntry[]> {
  if (ranked.length === 0) return [];
  const ids = ranked.map((r) => r.userId);
  const rows = await getDb().select({
    id: schema.users.id, displayName: schema.users.displayName, country: schema.users.country,
  }).from(schema.users).where(inArray(schema.users.id, ids));
  const byId = new Map(rows.map((u) => [u.id, u]));
  return ranked.map((r, i) => {
    const u = byId.get(r.userId);
    return {
      rank:        firstRank + i,
      userId:      r.userId,
      displayName: u?.displayName ?? r.userId,
      country:     u?.country ?? undefined,
      score:       r.total,
    };
  });
}
