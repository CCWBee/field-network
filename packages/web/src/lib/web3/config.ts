import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// WalletConnect project ID - users should replace with their own
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// Lazily build the wagmi config. WalletConnect's connector initializer
// touches indexedDB at construction time, so we must avoid creating it
// at module load (which would happen during SSR bundling).
let cachedConfig: ReturnType<typeof createConfig> | null = null;

export function getConfig() {
  if (cachedConfig) return cachedConfig;
  cachedConfig = createConfig({
    chains: [base, baseSepolia],
    connectors: [
      injected(),
      coinbaseWallet({ appName: 'Field Network', preference: 'all' }),
      walletConnect({ projectId }),
    ],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });
  return cachedConfig;
}
