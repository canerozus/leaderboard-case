// backend/tests/integration/helpers/containers.ts
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import IORedis from 'ioredis';

export interface Stack {
  postgres: StartedPostgreSqlContainer;
  mongo: StartedTestContainer;
  redis: StartedTestContainer;
  postgresUrl: string;
  mongoUrl: string;
  redisUrl: string;
  redisHost: string;
  redisPort: number;
  stop: () => Promise<void>;
}

export async function startStack(): Promise<Stack> {
  const [postgres, mongo, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('leaderboard').withUsername('leaderboard').withPassword('leaderboard').start(),
    new GenericContainer('mongo:7').withExposedPorts(27017).start(),
    new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
  ]);

  // citext extension
  const pgClient = new (await import('pg')).Client({ connectionString: postgres.getConnectionUri() });
  await pgClient.connect();
  await pgClient.query('CREATE EXTENSION IF NOT EXISTS citext');
  await pgClient.end();

  // Apply drizzle migrations
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: postgres.getConnectionUri() });
  const { drizzle } = await import('drizzle-orm/node-postgres');
  await migrate(drizzle(pool), { migrationsFolder: 'migrations' });
  await pool.end();

  return {
    postgres, mongo, redis,
    postgresUrl: postgres.getConnectionUri(),
    mongoUrl:    `mongodb://${mongo.getHost()}:${mongo.getMappedPort(27017)}/leaderboard-test`,
    redisUrl:    `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
    redisHost:   redis.getHost(),
    redisPort:   redis.getMappedPort(6379),
    stop: async () => { await Promise.all([postgres.stop(), mongo.stop(), redis.stop()]); },
  };
}

/** Set process.env so the singleton config + db modules pick up the test stack. */
export function pointEnvAtStack(stack: Stack): void {
  process.env.POSTGRES_URL = stack.postgresUrl;
  process.env.MONGO_URL    = stack.mongoUrl;
  process.env.REDIS_URL    = stack.redisUrl;
  process.env.JWT_SECRET   = 'test-secret-at-least-32-characters-long-yes';
  process.env.NODE_ENV     = 'test';
  process.env.LOG_LEVEL    = 'warn';
  process.env.BCRYPT_COST  = '4';
}

export function makeRawRedis(stack: Stack): IORedis {
  return new IORedis({
    host: stack.redisHost, port: stack.redisPort,
    maxRetriesPerRequest: 1, enableOfflineQueue: false,
  });
}
