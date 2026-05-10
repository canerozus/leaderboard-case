import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiHttpError, UnauthorizedError } from '@/shared/api';

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => {
          if (error instanceof UnauthorizedError) return false;
          if (error instanceof ApiHttpError && error.status >= 400 && error.status < 500) return false;
          return count < 2;
        },
        staleTime: 1_000,
        refetchOnWindowFocus: true,
        refetchIntervalInBackground: false,
      },
      mutations: { retry: false },
    },
  }));

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
