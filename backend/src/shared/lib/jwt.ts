// backend/src/shared/lib/jwt.ts
import jwt, { type SignOptions } from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: { sub: string }, secret: string, expiresIn: SignOptions['expiresIn']): string {
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub) throw new Error('invalid token payload');
  return decoded as JwtPayload;
}
