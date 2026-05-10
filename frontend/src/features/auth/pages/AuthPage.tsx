import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { AuthForm } from '../components/AuthForm';
import { useAuthStore } from '../store/authStore';
import { useLogin, useRegister } from '../hooks/useAuth';
import { ApiHttpError } from '@/shared/api';
import { cn } from '@/shared/lib/cn';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const login = useLogin();
  const register = useRegister();

  if (isAuthed) return <Navigate to="/leaderboard" replace />;

  const active = mode === 'login' ? login : register;
  const errorMessage = active.error instanceof ApiHttpError
    ? (active.error.body as { message?: string } | null)?.message ?? active.error.message
    : active.error instanceof Error ? active.error.message : undefined;

  return (
    <div className="min-h-screen bg-canvas-50 bg-grid grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <Trophy className="text-accent-400" />
          <h1 className="text-2xl font-display font-semibold tracking-tight">Leaderboard Case</h1>
        </div>

        <div className="bg-canvas-100 rounded-2xl shadow-elevate ring-1 ring-white/5 p-6">
          <div className="grid grid-cols-2 mb-6 rounded-lg bg-canvas-200 p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'py-2 text-sm font-medium rounded-md transition',
                  mode === m ? 'bg-canvas-50 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200',
                )}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <AuthForm
            mode={mode}
            pending={active.isPending}
            errorMessage={errorMessage}
            onSubmit={async (values) => {
              if (mode === 'login') await login.mutateAsync(values as never);
              else                  await register.mutateAsync(values as never);
            }}
          />
        </div>

        <p className="text-center text-xs text-zinc-500 mt-6">
          Demo: <code className="text-zinc-300">caner</code> / <code className="text-zinc-300">leaderboard</code>
        </p>
      </div>
    </div>
  );
}
