'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to detect if we're on the client side and wagmi is ready.
 * Use this to guard wagmi hook usage during SSR.
 */
export function useWagmiReady() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure WagmiProvider has mounted
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return isReady;
}
