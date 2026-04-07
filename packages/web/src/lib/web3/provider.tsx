'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, type State } from 'wagmi';
import { useState, useEffect, type ReactNode } from 'react';

interface Web3ProviderProps {
  children: ReactNode;
  initialState?: State;
}

export function Web3Provider({ children, initialState }: Web3ProviderProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [config, setConfig] = useState<Awaited<ReturnType<typeof import('./config').getConfig>> | null>(null);

  // Lazy-load wagmi config on client only — WalletConnect's initializer
  // touches indexedDB, which crashes during SSR.
  useEffect(() => {
    let cancelled = false;
    import('./config').then(({ getConfig }) => {
      if (!cancelled) setConfig(getConfig());
    });
    return () => { cancelled = true; };
  }, []);

  if (!config) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
