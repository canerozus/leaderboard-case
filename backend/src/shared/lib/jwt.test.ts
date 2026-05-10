// backend/src/shared/lib/jwt.test.ts
import { describe, test, expect } from 'vitest';
import { signToken, verifyToken } from './jwt.js';

const SECRET = 'a'.repeat(32);

describe('jwt', () => {
  test('round-trip encodes and decodes payload', () => {
    const token = signToken({ sub: 'user-123' }, SECRET, '1h');
    const decoded = verifyToken(token, SECRET);
    expect(decoded.sub).toBe('user-123');
  });
  test('verify throws on tampered token', () => {
    const token = signToken({ sub: 'user-123' }, SECRET, '1h');
    expect(() => verifyToken(token + 'x', SECRET)).toThrow();
  });
  test('verify throws when secret differs', () => {
    const token = signToken({ sub: 'user-123' }, SECRET, '1h');
    expect(() => verifyToken(token, 'b'.repeat(32))).toThrow();
  });
});
