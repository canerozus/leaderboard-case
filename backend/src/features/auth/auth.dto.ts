// backend/src/features/auth/auth.dto.ts
import { z } from 'zod';

export const RegisterDto = z.object({
  username:    z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password:    z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
  country:     z.string().length(2).optional(),
});
export type RegisterDto = z.infer<typeof RegisterDto>;

export const LoginDto = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDto>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  country?: string;
}
