import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ReactNode } from 'react';
import { Button } from '@/shared/components/Button';
import { cn } from '@/shared/lib/cn';

const LoginSchema = z.object({
  username: z.string().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

const RegisterSchema = z.object({
  username:    z.string().min(3, 'min 3 characters').max(32).regex(/^[a-zA-Z0-9_]+$/, 'letters, digits and _ only'),
  password:    z.string().min(8, 'min 8 characters').max(128),
  displayName: z.string().min(1, 'required').max(64),
  country:     z.string().length(2, 'two-letter code').optional().or(z.literal('').transform(() => undefined)),
});

type LoginValues    = z.infer<typeof LoginSchema>;
type RegisterValues = z.infer<typeof RegisterSchema>;

// Single shape used by react-hook-form so register('displayName') type-checks in
// either mode. The active zod schema decides what's actually required.
interface FormValues {
  username: string;
  password: string;
  displayName: string;
  country: string;
}

export interface AuthFormProps {
  mode: 'login' | 'register';
  onSubmit: (values: LoginValues | RegisterValues) => Promise<void> | void;
  pending?: boolean;
  errorMessage?: string;
}

export function AuthForm({ mode, onSubmit, pending, errorMessage }: AuthFormProps) {
  const isLogin = mode === 'login';
  const form = useForm<FormValues>({
    resolver: zodResolver(isLogin ? LoginSchema : RegisterSchema) as never,
    defaultValues: { username: '', password: '', displayName: '', country: '' },
  });

  const handle = (values: FormValues) => {
    if (isLogin) {
      return onSubmit({ username: values.username, password: values.password });
    }
    const payload: RegisterValues = {
      username: values.username,
      password: values.password,
      displayName: values.displayName,
      ...(values.country ? { country: values.country } : {}),
    };
    return onSubmit(payload);
  };

  return (
    <form onSubmit={form.handleSubmit(handle)} className="space-y-4" noValidate>
      <Field label="Username" htmlFor="username" error={form.formState.errors.username?.message}>
        <input
          id="username" type="text" autoComplete="username"
          className={inputClass(!!form.formState.errors.username)}
          {...form.register('username')}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={form.formState.errors.password?.message}>
        <input
          id="password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'}
          className={inputClass(!!form.formState.errors.password)}
          {...form.register('password')}
        />
      </Field>

      {!isLogin && (
        <>
          <Field label="Display name" htmlFor="displayName" error={form.formState.errors.displayName?.message}>
            <input
              id="displayName" type="text" autoComplete="nickname"
              className={inputClass(!!form.formState.errors.displayName)}
              {...form.register('displayName')}
            />
          </Field>
          <Field label="Country (2-letter code, optional)" htmlFor="country" error={form.formState.errors.country?.message}>
            <input
              id="country" type="text" maxLength={2} autoComplete="country"
              className={inputClass(!!form.formState.errors.country) + ' uppercase'}
              {...form.register('country')}
            />
          </Field>
        </>
      )}

      {errorMessage && (
        <p role="alert" className="text-sm text-red-400">{errorMessage}</p>
      )}

      <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
        {isLogin ? 'Sign in' : 'Create account'}
      </Button>
    </form>
  );
}

function Field({ label, htmlFor, error, children }: { label: string; htmlFor: string; error?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm text-zinc-400 mb-1.5 block">{label}</span>
      {children}
      {error && <span className="text-xs text-red-400 mt-1 block">{error}</span>}
    </label>
  );
}

function inputClass(hasError: boolean): string {
  return cn(
    'w-full rounded-lg bg-canvas-200 px-3.5 py-2.5 text-zinc-100 outline-none placeholder:text-zinc-500',
    'ring-1 ring-white/5 focus:ring-2 focus:ring-accent-500/60 transition',
    hasError && 'ring-red-500/60 focus:ring-red-500/80',
  );
}
