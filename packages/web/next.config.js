/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ground-truth/shared'],
  // Enable standalone output for Docker deployments
  output: 'standalone',
  // Skip type checking during build (already done in CI)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Skip ESLint during build (already done in CI)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Experimental settings to handle SSR issues with web3 libraries
  experimental: {
    // Don't fail build on pre-rendering errors - some pages use client-only features
    workerThreads: false,
    cpus: 1,
  },
  webpack: (config) => {
    // Ignore optional wagmi connector dependencies we don't use
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'porto': false,
      'porto/internal': false,
      '@base-org/account': false,
      '@coinbase/wallet-sdk': false,
      '@gemini-wallet/core': false,
      '@metamask/sdk': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
    };
    return config;
  },
};

module.exports = nextConfig;
