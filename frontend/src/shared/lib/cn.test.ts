import { describe, expect, test } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  test('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });
  test('drops falsy values', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b');
  });
  test('merges conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-zinc-100')).toBe('text-zinc-100');
  });
  test('handles arrays and objects (clsx contract)', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });
});
