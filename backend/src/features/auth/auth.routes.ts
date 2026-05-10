// backend/src/features/auth/auth.routes.ts
import { Router } from 'express';
import { authController } from './auth.controller.js';

export const authRoutes: Router = Router();
authRoutes.post('/register', authController.register);
authRoutes.post('/login',    authController.login);
