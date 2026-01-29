'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';

// Lazy import wagmi hooks to avoid SSR issues
function LoginContent() {
  const router = useRouter();
  const { login, isLoading: isEmailLoading, error: emailError, clearError } = useAuthStore();

  // These imports are only executed on the client
  const { useConnect, useAccount, useDisconnect } = require('wagmi');
  const { useSiweAuth } = require('@/lib/web3/useSiweAuth');

  // Wallet connection
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signIn, isAuthenticating, error: walletError } = useSiweAuth({
    onSuccess: () => {
      router.push('/dashboard');
    },
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      // Error is handled by store
    }
  };

  const handleWalletConnect = async (connector: any) => {
    if (connector) {
      connect({ connector });
    }
  };

  const handleWalletSignIn = async () => {
    try {
      await signIn();
    } catch {
      // Error handled by hook
    }
  };

  const error = emailError || walletError;
  const isLoading = isEmailLoading || isConnecting || isAuthenticating;

  // Find MetaMask connector
  const metamaskConnector = connectors.find((c: any) => c.name === 'MetaMask');
  const walletConnectConnector = connectors.find((c: any) => c.name === 'WalletConnect');

  return (
    <>
      <h2 className="text-center text-2xl font-bold text-slate-800 mb-6">
        Sign in to your account
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Wallet Authentication */}
      <div className="space-y-3">
        {isConnected ? (
          <div className="space-y-3">
            <div className="p-3 bg-field-500/20 border border-field-500/50 rounded-lg">
              <p className="text-sm text-field-600">
                Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>
            <button
              onClick={handleWalletSignIn}
              disabled={isAuthenticating}
              className="w-full flex justify-center py-3 px-4 rounded-lg text-sm font-medium text-slate-800 bg-field-500 hover:bg-field-400 disabled:opacity-50 transition-colors glow-sm"
            >
              {isAuthenticating ? 'Signing in...' : 'Sign Message to Continue'}
            </button>
            <button
              onClick={() => disconnect()}
              className="w-full flex justify-center py-2 px-4 text-sm text-slate-500 hover:text-slate-600 transition-colors"
            >
              Disconnect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {metamaskConnector && (
              <button
                onClick={() => handleWalletConnect(metamaskConnector)}
                disabled={isConnecting}
                className="w-full flex items-center justify-center py-3 px-4 glass-light rounded-lg text-sm font-medium text-slate-800 hover:bg-field-50 disabled:opacity-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 40 40" fill="none">
                  <path d="M36.4 4L22.2 14.6l2.6-6.2L36.4 4z" fill="#E17726" />
                  <path d="M3.6 4l14 10.7-2.4-6.3L3.6 4z" fill="#E27625" />
                  <path d="M31.2 27.4l-3.8 5.8 8 2.2 2.3-7.8-6.5-.2z" fill="#E27625" />
                  <path d="M2.3 27.6l2.3 7.8 8-2.2-3.8-5.8-6.5.2z" fill="#E27625" />
                  <path d="M12.1 17.4l-2.2 3.4 8 .4-.3-8.6-5.5 4.8z" fill="#E27625" />
                  <path d="M27.9 17.4l-5.6-4.9-.2 8.7 8-.4-2.2-3.4z" fill="#E27625" />
                  <path d="M12.6 33.2l4.8-2.4-4.2-3.2-.6 5.6z" fill="#E27625" />
                  <path d="M22.6 30.8l4.8 2.4-.6-5.6-4.2 3.2z" fill="#E27625" />
                </svg>
                {isConnecting ? 'Connecting...' : 'Connect with MetaMask'}
              </button>
            )}

            {walletConnectConnector && (
              <button
                onClick={() => handleWalletConnect(walletConnectConnector)}
                disabled={isConnecting}
                className="w-full flex items-center justify-center py-3 px-4 glass-light rounded-lg text-sm font-medium text-slate-800 hover:bg-field-50 disabled:opacity-50 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 40 40" fill="none">
                  <path d="M10 14.6c5.5-5.4 14.5-5.4 20 0l.7.6c.3.3.3.7 0 1l-2.3 2.2c-.1.2-.4.2-.5 0l-.9-.9c-3.9-3.8-10.1-3.8-14 0l-1 .9c-.1.2-.4.2-.5 0l-2.3-2.2c-.3-.3-.3-.7 0-1l.8-.6zm24.7 4.6l2 2c.3.3.3.7 0 1l-9.2 9c-.3.3-.7.3-1 0l-6.5-6.4c-.1-.1-.2-.1-.3 0l-6.5 6.4c-.3.3-.7.3-1 0l-9.2-9c-.3-.3-.3-.7 0-1l2-2c.3-.3.7-.3 1 0l6.5 6.4c.1.1.2.1.3 0l6.5-6.4c.3-.3.7-.3 1 0l6.5 6.4c.1.1.2.1.3 0l6.5-6.4c.3-.3.7-.3 1 0z" fill="#3B99FC" />
                </svg>
                {isConnecting ? 'Connecting...' : 'Connect with WalletConnect'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <button
            onClick={() => setShowEmailForm(!showEmailForm)}
            className="px-3 py-1 bg-surface-50 text-slate-500 hover:text-slate-600 rounded transition-colors"
          >
            {showEmailForm ? 'Hide email login' : 'Or sign in with email'}
          </button>
        </div>
      </div>

      {/* Email/Password Form (collapsed by default) */}
      {showEmailForm && (
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-600">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-100 border border-surface-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-600">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-surface-100 border border-surface-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 rounded-lg text-sm font-medium text-slate-800 bg-field-500 hover:bg-field-400 disabled:opacity-50 transition-colors"
          >
            {isEmailLoading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        Don't have an account?{' '}
        <Link href="/register" className="text-field-600 hover:text-field-600 transition-colors">
          Register here
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-field-500"></div>
      </div>
    );
  }

  return <LoginContent />;
}
