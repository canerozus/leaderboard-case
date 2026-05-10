// backend/src/shared/db/postgres.ts
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadConfig } from '../../config.js';
import * as schema from './postgres.schema.js';

let pool: pg.Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;
let closed = false;

export function getPool(): pg.Pool {
  if (closed) throw new Error('postgres pool is closed — create a new process to reconnect');
  if (pool) return pool;
  pool = new pg.Pool({ connectionString: loadConfig().POSTGRES_URL, max: 20 });
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (closed) throw new Error('postgres pool is closed — create a new process to reconnect');
  if (db) return db;
  db = drizzle(getPool(), { schema });
  return db;
}

export async function closePostgres(): Promise<void> {
  if (pool) { await pool.end(); pool = null; db = null; }
  closed = true;
}

export { schema };
