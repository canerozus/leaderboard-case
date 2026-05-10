// backend/src/features/score/score.model.ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const ScoreSchema = new Schema({
  userId:  { type: String, required: true },
  day:     { type: String, required: true },
  weekId:  { type: Number, required: true },
  total:   { type: Number, required: true, default: 0 },
  count:   { type: Number, required: true, default: 0 },
  firstAt: { type: Date,   required: true },
  lastAt:  { type: Date,   required: true },
}, { collection: 'scores', timestamps: false, versionKey: false });

ScoreSchema.index({ day: 1, userId: 1 }, { unique: true });
ScoreSchema.index({ weekId: 1, userId: 1 });
ScoreSchema.index({ weekId: 1, total: -1 });

export type ScoreDoc = InferSchemaType<typeof ScoreSchema>;
export const ScoreModel = mongoose.model('Score', ScoreSchema);
