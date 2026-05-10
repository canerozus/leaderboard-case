// backend/src/shared/db/mongo.ts
import mongoose from 'mongoose';
import { loadConfig } from '../../config.js';
import { logger } from '../lib/logger.js';

let connected = false;
// Single-flight: concurrent first-callers share one in-flight connect promise
// instead of each firing their own underlying mongoose.connect().
let connecting: Promise<typeof mongoose> | null = null;

export async function connectMongo(): Promise<typeof mongoose> {
  if (connected) return mongoose;
  if (connecting) return connecting;
  mongoose.set('strictQuery', true);
  connecting = mongoose
    .connect(loadConfig().MONGO_URL, { serverSelectionTimeoutMS: 5_000 })
    .then(() => {
      connected = true;
      logger.info('mongo connected');
      return mongoose;
    })
    .finally(() => { connecting = null; });
  return connecting;
}

export async function closeMongo(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
