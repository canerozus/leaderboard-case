// backend/src/features/auth/auth.service.ts
import bcrypt from 'bcrypt';
import { loadConfig } from '../../config.js';
import type { SignOptions } from 'jsonwebtoken';
import { signToken } from '../../shared/lib/jwt.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { authRepo } from './auth.repo.js';
import type { LoginDto, PublicUser, RegisterDto } from './auth.dto.js';

export class AuthError extends Error {
  constructor(public code: 'username_taken' | 'invalid_credentials', message: string) {
    super(message);
  }
}

function toPublic(u: { id: string; username: string; displayName: string; country: string | null }): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, country: u.country ?? undefined };
}

export function makeAuthService(cache: CacheService) {
  return {
    async register(input: RegisterDto): Promise<{ user: PublicUser; token: string }> {
      const cfg = loadConfig();
      const existing = await authRepo.findByUsername(input.username);
      if (existing) throw new AuthError('username_taken', 'username already taken');
      const passwordHash = await bcrypt.hash(input.password, cfg.BCRYPT_COST);
      const user = await authRepo.create({
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        country: input.country,
      });
      // Warm the user:{id} profile hash so cached leaderboard reads render
      // displayName/country immediately. Best-effort: fail-open if Redis is down.
      await cache.setUserProfile(user.id, user.displayName, user.country ?? undefined);
      const token = signToken({ sub: user.id }, cfg.JWT_SECRET, cfg.JWT_EXPIRES_IN as SignOptions['expiresIn']);
      return { user: toPublic(user), token };
    },

    async login(input: LoginDto): Promise<{ user: PublicUser; token: string }> {
      const cfg = loadConfig();
      const user = await authRepo.findByUsername(input.username);
      if (!user) throw new AuthError('invalid_credentials', 'invalid credentials');
      const ok = await bcrypt.compare(input.password, user.passwordHash);
      if (!ok) throw new AuthError('invalid_credentials', 'invalid credentials');
      const token = signToken({ sub: user.id }, cfg.JWT_SECRET, cfg.JWT_EXPIRES_IN as SignOptions['expiresIn']);
      return { user: toPublic(user), token };
    },
  };
}
