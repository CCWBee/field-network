'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, State, Config } from 'wagmi';
import { useState, useEffect, type ReactNode } from 'react';

interface Web3ProviderProps {
  children: ReactNode;
  initialState?: State;
}

export function Web3Provider({ children, initialState }: Web3ProviderProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  const [wagmiConfig, setWagmiConfig] = useState<Config | null>(null);

  // Prevent hydration issues by only loading web3 config after mount
  useEffect(() => {
    // Dynamically import config only on client side
    import('./config').then(({ config }) => {
      setWagmiConfig(config);
      setMounted(true);
    });
  }, []);

  // During SSR and initial hydration, just render children without web3 context
  if (!mounted || !wagmiConfig) {
    return <>{children}</>;
  }

  return (
    // @ts-expect-error Wagmi config type mismatch with createConfig return type
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        {/* @ts-expect-error React 19 type incompatibility with @tanstack/react-query */}
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
