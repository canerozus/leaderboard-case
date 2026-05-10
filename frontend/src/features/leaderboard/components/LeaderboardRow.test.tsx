import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeaderboardRow } from './LeaderboardRow';
import type { LbEntry } from '@/shared/types/api.types';

const baseEntry: LbEntry = { rank: 7, userId: 'u', displayName: 'Asha', score: 12345, country: 'TR' };

describe('LeaderboardRow', () => {
  test('renders rank, name, score with formatting', () => {
    render(<LeaderboardRow entry={baseEntry} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(screen.getByText('12,345')).toBeInTheDocument();
  });

  test('applies "me" highlight when entry.isMe', () => {
    render(<LeaderboardRow entry={{ ...baseEntry, isMe: true }} />);
    expect(screen.getByTestId('lb-row')).toHaveClass('bg-you-glow');
  });

  test('shows country code when present', () => {
    render(<LeaderboardRow entry={baseEntry} />);
    expect(screen.getByText('TR')).toBeInTheDocument();
  });
});
