import { afterEach, describe, expect, test } from 'vitest';
import { useAuthStore } from './authStore';

afterEach(() => {
  useAuthStore.setState({ token: null, user: null });
  localStorage.clear();
});

describe('authStore', () => {
  test('starts logged out', () => {
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  test('login sets token + user and isAuthenticated returns true', () => {
    useAuthStore.getState().login('tok', { id: 'u', username: 'u', displayName: 'U' });
    const s = useAuthStore.getState();
    expect(s.token).toBe('tok');
    expect(s.user?.username).toBe('u');
    expect(s.isAuthenticated()).toBe(true);
  });

  test('logout clears state', () => {
    useAuthStore.getState().login('tok', { id: 'u', username: 'u', displayName: 'U' });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
  });

  test('persists token + user to localStorage', () => {
    useAuthStore.getState().login('tok', { id: 'u', username: 'u', displayName: 'U' });
    const raw = localStorage.getItem('leaderboard-auth');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.token).toBe('tok');
  });
});
