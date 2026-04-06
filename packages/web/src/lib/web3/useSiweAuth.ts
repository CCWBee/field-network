'use client';

import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { useState, useCallback } from 'react';
import { SiweMessage } from 'siwe';
import { api } from '../api';
import { useAuthStore } from '../store';

interface UseSiweAuthOptions {
  onSuccess?: (data: { user: any; token: string }) => void;
  onError?: (error: Error) => void;
}

export function useSiweAuth(options: UseSiweAuthOptions = {}) {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { setAuth, clearAuth } = useAuthStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address || !chainId) {
      setError('Wallet not connected');
      return;
    }

    setIsAuthenticating(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const { nonce } = await api.getSiweNonce();

      // 2. Create SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to Field Network',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
      });

      const messageString = message.prepareMessage();

      // 3. Sign message with wallet
      const signature = await signMessageAsync({ message: messageString });

      // 4. Verify with backend
      const result = await api.verifySiwe({
        message: messageString,
        signature,
      });

      // 5. Store auth state
      setAuth(result.token, result.refreshToken, result.user);

      options.onSuccess?.(result);

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed';
      setError(errorMessage);
      options.onError?.(err instanceof Error ? err : new Error(errorMessage));
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, chainId, signMessageAsync, setAuth, options]);

  const signOut = useCallback(() => {
    clearAuth();
    disconnect();
  }, [clearAuth, disconnect]);

  return {
    address,
    isConnected,
    chainId,
    isAuthenticating,
    error,
    signIn,
    signOut,
  };
}
