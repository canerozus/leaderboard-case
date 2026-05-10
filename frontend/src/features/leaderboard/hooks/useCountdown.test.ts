import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from './useCountdown';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(()  => { vi.useRealTimers(); });

describe('useCountdown', () => {
  test('decrements every second', () => {
    const { result } = renderHook(() => useCountdown(10));
    expect(result.current).toBe(10);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(9);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBe(6);
  });

  test('clamps to zero', () => {
    const { result } = renderHook(() => useCountdown(2));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(0);
  });

  test('resets when initial seconds prop changes', () => {
    const { result, rerender } = renderHook(({ s }) => useCountdown(s), { initialProps: { s: 10 } });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBe(7);
    rerender({ s: 100 });
    expect(result.current).toBe(100);
  });
});
