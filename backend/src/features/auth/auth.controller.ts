// backend/src/features/auth/auth.controller.ts
import type { Request, Response } from 'express';
import { LoginDto, RegisterDto } from './auth.dto.js';
import { AuthError, authService } from './auth.service.js';

export const authController = {
  async register(req: Request, res: Response) {
    const parsed = RegisterDto.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', message: parsed.error.message }); return; }
    try {
      const result = await authService.register(parsed.data);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof AuthError) { res.status(409).json({ error: err.code, message: err.message }); return; }
      throw err;
    }
  },

  async login(req: Request, res: Response) {
    const parsed = LoginDto.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', message: parsed.error.message }); return; }
    try {
      const result = await authService.login(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof AuthError) { res.status(401).json({ error: err.code, message: err.message }); return; }
      throw err;
    }
  },
};
