// backend/src/shared/db/postgres.schema.ts
import { pgTable, uuid, text, integer, bigint, timestamp, primaryKey, numeric, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  username:     citext('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName:  text('display_name').notNull(),
  country:      text('country'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const weeklyHistory = pgTable('weekly_history', {
  weekId:     integer('week_id').notNull(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  finalRank:  integer('final_rank').notNull(),
  finalScore: bigint('final_score', { mode: 'number' }).notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.weekId, t.userId] }) }));

export const payouts = pgTable('payouts', {
  weekId:  integer('week_id').notNull(),
  userId:  uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rank:    integer('rank').notNull(),
  amount:  numeric('amount', { precision: 20, scale: 2 }).notNull(),
  paidAt:  timestamp('paid_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({ pk: primaryKey({ columns: [t.weekId, t.userId] }) }));
