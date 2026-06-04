/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // transpilePackages references the legacy @ground-truth/shared package name;
  // kept commented as a reminder that the shared package was renamed to
  // @field-network/shared and no longer needs transpilation here.
  // transpilePackages: ['@field-network/shared'],
  //
  // output: 'standalone' was removed because it forces static export of the
  // synthetic /_error fallback, which fails with React error #31 in CI on
  // Linux when the root layout includes the wagmi Web3Provider. Re-add it
  // when the wagmi + React 19 SSR composition is fixed (upstream issue).
  // output: 'standalone',
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
