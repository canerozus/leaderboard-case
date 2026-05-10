// backend/seed/seed.ts
import bcrypt from 'bcrypt';
import seedrandom from 'seedrandom';
import { loadConfig } from '../src/config.js';
import { logger } from '../src/shared/lib/logger.js';
import { connectMongo, closeMongo } from '../src/shared/db/mongo.js';
import { getDb, schema, closePostgres } from '../src/shared/db/postgres.js';
import { closeRedis, getRedis } from '../src/shared/db/redis.js';
import { CacheService } from '../src/shared/cache/cache.service.js';
import { ScoreModel } from '../src/features/score/score.model.js';
import { currentWeekId, dayKey } from '../src/shared/lib/weekId.js';

const COUNT = Number(process.env.SEED_COUNT ?? 100_000);
const COUNTRIES = ['US', 'TR', 'DE', 'BR', 'IN', 'GB', 'JP', 'KR', 'FR', 'ES'];
const NAMES = ['Asha', 'Mateo', 'Yuki', 'Ada', 'Kai', 'Nora', 'Eren', 'Zara', 'Leo', 'Mei'];
const KNOWN_USERNAME = 'caner';
const KNOWN_PASSWORD = 'leaderboard';
const KNOWN_TARGET_RANK = 5_000;

async function main() {
  loadConfig();
  await connectMongo();
  const cache = new CacheService(getRedis(), logger);
  const db = getDb();
  const rng = seedrandom('leaderboard-2026');
  const passwordHash = await bcrypt.hash(KNOWN_PASSWORD, 4);
  const weekId = currentWeekId();
  const day = dayKey();
  const now = new Date();

  // Power-law distribution: rank^-1.2 then scaled
  const scoreFor = (rank: number) => Math.floor(1_000_000 * Math.pow(rank, -1.2));

  logger.info({ count: COUNT }, 'seeding users');

  const BATCH = 1000;
  const userInserts: { username: string; passwordHash: string; displayName: string; country: string }[] = [];
  for (let i = 1; i <= COUNT; i += 1) {
    const username = i === KNOWN_TARGET_RANK ? KNOWN_USERNAME : `player_${String(i).padStart(6, '0')}`;
    userInserts.push({
      username,
      passwordHash,
      displayName: NAMES[Math.floor(rng() * NAMES.length)] + '_' + i,
      country: COUNTRIES[Math.floor(rng() * COUNTRIES.length)]!,
    });
  }

  const insertedIds: { id: string; rank: number }[] = [];
  for (let i = 0; i < userInserts.length; i += BATCH) {
    const slice = userInserts.slice(i, i + BATCH);
    const rows = await db.insert(schema.users).values(slice).returning({ id: schema.users.id });
    rows.forEach((r, j) => insertedIds.push({ id: r.id, rank: i + j + 1 }));
    if (i % 10_000 === 0) logger.info({ done: i + slice.length }, 'users inserted');
  }

  logger.info('seeding scores into mongo daily buckets');
  for (let i = 0; i < insertedIds.length; i += BATCH) {
    const slice = insertedIds.slice(i, i + BATCH);
    await ScoreModel.insertMany(slice.map((u) => ({
      userId: u.id, day, weekId,
      total: scoreFor(u.rank), count: 1, firstAt: now, lastAt: now,
    })), { ordered: false });
    if (i % 10_000 === 0) logger.info({ done: i + slice.length }, 'scores inserted');
  }

  logger.info('warming redis cache (best-effort)');
  const { inArray } = await import('drizzle-orm');
  for (let i = 0; i < insertedIds.length; i += BATCH) {
    const slice = insertedIds.slice(i, i + BATCH);
    await cache.bulkZAdd(`lb:${weekId}`, slice.map((u) => ({ userId: u.id, score: scoreFor(u.rank) })));
    const pipe = getRedis().pipeline();
    const userRows = await db.select({ id: schema.users.id, displayName: schema.users.displayName, country: schema.users.country })
      .from(schema.users).where(inArray(schema.users.id, slice.map((s) => s.id)));
    for (const u of userRows) pipe.hset(`user:${u.id}`, { displayName: u.displayName, country: u.country ?? '' });
    try { await pipe.exec(); } catch (err) { logger.warn({ err }, 'profile hash warm failed'); }
  }

  const totalEarnings = insertedIds.reduce((s, u) => s + scoreFor(u.rank), 0);
  await cache.setPrizePool(weekId, totalEarnings * 0.02);

  logger.info({ knownUsername: KNOWN_USERNAME, password: KNOWN_PASSWORD, targetRank: KNOWN_TARGET_RANK }, 'seed complete');
  await closeMongo(); await closePostgres(); await closeRedis();
}

main().catch((err) => { logger.fatal({ err }, 'seed failed'); process.exit(1); });
