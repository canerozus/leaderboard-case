import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { authApi, type LoginInput, type RegisterInput } from '../api/authApi';

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: ({ token, user }) => login(token, user),
  });
}

export function useRegister() {
  const login = useAuthStore((s) => s.login);
  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: ({ token, user }) => login(token, user),
  });
}
