// backend/src/features/score/score.dto.ts
import { z } from 'zod';
export const SubmitDto = z.object({ delta: z.number().int().min(1).max(1000) });
export type SubmitDto = z.infer<typeof SubmitDto>;
