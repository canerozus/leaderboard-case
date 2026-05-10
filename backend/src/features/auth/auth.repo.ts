// backend/src/features/auth/auth.repo.ts
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../shared/db/postgres.js';

export const authRepo = {
  async findByUsername(username: string) {
    const rows = await getDb().select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return rows[0] ?? null;
  },
  async findById(id: string) {
    const rows = await getDb().select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async create(input: { username: string; passwordHash: string; displayName: string; country?: string }) {
    const rows = await getDb().insert(schema.users).values(input).returning();
    return rows[0]!;
  },
};
