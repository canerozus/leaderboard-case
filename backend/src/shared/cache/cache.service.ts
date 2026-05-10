// backend/src/shared/cache/cache.service.ts
import type Redis from 'ioredis';
import type { Logger } from '../lib/logger.js';
import type { LbEntry } from '../types/api.types.js';

const TOP_TTL_SEC = 1;
const TOP_KEY  = (w: number) => `top:${w}`;
const LB_KEY   = (w: number) => `lb:${w}`;
const POOL_KEY = (w: number) => `pool:${w}`;
const USER_KEY = (u: string) => `user:${u}`;
const RL_KEY   = (u: string) => `ratelimit:earn:${u}`;
const REHY_KEY = (w: number) => `rehydrate:${w}`;

export class CacheService {
  constructor(private redis: Redis, private logger: Logger) {}

  /** Hit → entries. Cold/empty → null. Redis down → null. Caller cannot distinguish cold from down (intentional). */
  async getTopHundred(weekId: number): Promise<LbEntry[] | null> {
    try {
      const cached = await this.redis.get(TOP_KEY(weekId));
      if (cached) return JSON.parse(cached) as LbEntry[];
      const flat = await this.redis.zrevrange(LB_KEY(weekId), 0, 99, 'WITHSCORES');
      if (flat.length === 0) return null;
      const entries = await this.hydrate(flat, 0);
      await this.redis.set(TOP_KEY(weekId), JSON.stringify(entries), 'EX', TOP_TTL_SEC);
      return entries;
    } catch (err) {
      this.logger.warn({ err, weekId }, 'cache.getTopHundred failed');
      return null;
    }
  }

  async getRankAndScore(userId: string, weekId: number): Promise<{ rank: number | null; score: number } | null> {
    try {
      const [rank, score] = await Promise.all([
        this.redis.zrevrank(LB_KEY(weekId), userId),
        this.redis.zscore(LB_KEY(weekId), userId),
      ]);
      return { rank, score: score ? Number(score) : 0 };
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.getRankAndScore failed');
      return null;
    }
  }

  async getNeighbors(userId: string, weekId: number, rank: number): Promise<LbEntry[] | null> {
    try {
      const start = Math.max(rank - 3, 100);
      const end   = rank + 2;
      const flat  = await this.redis.zrevrange(LB_KEY(weekId), start, end, 'WITHSCORES');
      if (flat.length === 0) return [];
      const entries = await this.hydrate(flat, start);
      return entries.map((e) => ({ ...e, isMe: e.userId === userId }));
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.getNeighbors failed');
      return null;
    }
  }

  async getPrizePool(weekId: number): Promise<number | null> {
    try {
      const v = await this.redis.get(POOL_KEY(weekId));
      return v === null ? 0 : Number(v);
    } catch (err) {
      this.logger.warn({ err, weekId }, 'cache.getPrizePool failed');
      return null;
    }
  }

  async incrementScore(userId: string, weekId: number, delta: number): Promise<number | null> {
    try {
      const next = await this.redis.zincrby(LB_KEY(weekId), delta, userId);
      return Number(next);
    } catch (err) {
      this.logger.warn({ err, userId, weekId }, 'cache.incrementScore failed');
      return null;
    }
  }

  async incrementPrizePool(weekId: number, amount: number): Promise<number | null> {
    try {
      const next = await this.redis.incrbyfloat(POOL_KEY(weekId), amount);
      return Number(next);
    } catch (err) {
      this.logger.warn({ err, weekId, amount }, 'cache.incrementPrizePool failed');
      return null;
    }
  }

  async setPrizePool(weekId: number, value: number): Promise<void | null> {
    try { await this.redis.set(POOL_KEY(weekId), String(value)); }
    catch (err) { this.logger.warn({ err, weekId, value }, 'cache.setPrizePool failed'); return null; }
  }

  async warmTopJson(weekId: number, entries: LbEntry[]): Promise<void | null> {
    try { await this.redis.set(TOP_KEY(weekId), JSON.stringify(entries), 'EX', TOP_TTL_SEC); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.warmTopJson failed'); return null; }
  }

  async deleteWeekData(weekId: number): Promise<void | null> {
    try { await this.redis.del(LB_KEY(weekId), POOL_KEY(weekId), TOP_KEY(weekId)); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.deleteWeekData failed'); return null; }
  }

  async acquireRateLimit(userId: string, ttlSec: number): Promise<boolean | null> {
    try {
      const ok = await this.redis.set(RL_KEY(userId), '1', 'EX', ttlSec, 'NX');
      return ok === 'OK';
    } catch (err) {
      this.logger.warn({ err, userId }, 'cache.acquireRateLimit failed');
      return null;
    }
  }

  async acquireRehydrateLock(weekId: number, ttlSec: number): Promise<boolean | null> {
    try {
      const ok = await this.redis.set(REHY_KEY(weekId), '1', 'EX', ttlSec, 'NX');
      return ok === 'OK';
    } catch (err) {
      this.logger.warn({ err, weekId }, 'cache.acquireRehydrateLock failed');
      return null;
    }
  }

  async releaseRehydrateLock(weekId: number): Promise<void | null> {
    try { await this.redis.del(REHY_KEY(weekId)); }
    catch (err) { this.logger.warn({ err, weekId }, 'cache.releaseRehydrateLock failed'); return null; }
  }

  async setUserProfile(userId: string, displayName: string, country?: string): Promise<void | null> {
    try {
      await this.redis.hset(USER_KEY(userId), { displayName, country: country ?? '' });
    } catch (err) {
      this.logger.warn({ err, userId }, 'cache.setUserProfile failed');
      return null;
    }
  }

  async bulkZAdd(key: string, members: Array<{ userId: string; score: number }>): Promise<void | null> {
    if (members.length === 0) return;
    try {
      const args: (string | number)[] = [];
      for (const m of members) { args.push(m.score, m.userId); }
      await this.redis.zadd(key, ...args as [string, string, ...string[]]);
    } catch (err) {
      this.logger.warn({ err, key, count: members.length }, 'cache.bulkZAdd failed');
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try { return (await this.redis.ping()) === 'PONG'; } catch { return false; }
  }

  /** flat = ['userId1', 'score1', 'userId2', 'score2', ...]; startRank = 0-indexed rank of first entry. */
  private async hydrate(flat: string[], startRank: number): Promise<LbEntry[]> {
    const ids: string[] = [];
    const scores: number[] = [];
    for (let i = 0; i < flat.length; i += 2) { ids.push(flat[i]!); scores.push(Number(flat[i + 1])); }
    if (ids.length === 0) return [];
    const pipe = this.redis.pipeline();
    for (const id of ids) pipe.hmget(USER_KEY(id), 'displayName', 'country');
    const results = await pipe.exec();
    return ids.map((userId, i) => {
      const [, fields] = (results?.[i] ?? [null, [null, null]]) as [unknown, [string | null, string | null]];
      return {
        rank:        startRank + i + 1,
        userId,
        displayName: fields?.[0] ?? userId,
        country:     fields?.[1] ?? undefined,
        score:       scores[i]!,
      };
    });
  }
}
