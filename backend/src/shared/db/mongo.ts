// backend/src/shared/db/mongo.ts
import mongoose from 'mongoose';
import { loadConfig } from '../../config.js';
import { logger } from '../lib/logger.js';

let connected = false;

export async function connectMongo(): Promise<typeof mongoose> {
  if (connected) return mongoose;
  mongoose.set('strictQuery', true);
  await mongoose.connect(loadConfig().MONGO_URL, { serverSelectionTimeoutMS: 5_000 });
  connected = true;
  logger.info('mongo connected');
  return mongoose;
}

export async function closeMongo(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
