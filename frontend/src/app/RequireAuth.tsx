import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store/authStore';

export function RequireAuth() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  if (!isAuthed) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
