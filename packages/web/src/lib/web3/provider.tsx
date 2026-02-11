'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type State } from 'wagmi';
import { useState, type ReactNode } from 'react';
import { config } from './config';

interface Web3ProviderProps {
  children: ReactNode;
  initialState?: State;
}

export function Web3Provider({ children, initialState }: Web3ProviderProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
