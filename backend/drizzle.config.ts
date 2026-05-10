// backend/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/shared/db/postgres.schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.POSTGRES_URL ?? 'postgres://leaderboard:leaderboard@localhost:5432/leaderboard' },
});
