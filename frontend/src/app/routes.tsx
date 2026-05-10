import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AuthPage } from '@/features/auth/pages/AuthPage';
import { LeaderboardPage } from '@/features/leaderboard/pages/LeaderboardPage';
import { RequireAuth } from './RequireAuth';

export const router = createBrowserRouter([
  { path: '/auth', element: <AuthPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <Navigate to="/leaderboard" replace /> },
      { path: 'leaderboard', element: <LeaderboardPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/leaderboard" replace /> },
]);
