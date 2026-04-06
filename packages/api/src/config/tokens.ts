/**
 * Token Configuration
 *
 * Centralized configuration for supported tokens across different networks.
 * Currently supports USDC on Base Mainnet and Base Sepolia.
 */

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  address: `0x${string}`;
  coingeckoId?: string;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  isTestnet: boolean;
  tokens: Record<string, TokenConfig>;
}

/**
 * USDC Token Addresses
 *
 * Official USDC addresses from Circle:
 * - Base Mainnet: https://www.circle.com/en/usdc-multichain/base
 * - Base Sepolia: Circle test USDC faucet
 */
export const USDC_ADDRESSES = {
  // Base Mainnet - Official Circle USDC
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const,

  // Base Sepolia - Circle Test USDC
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,

  // Local development (deployed mock)
  31337: '0x0000000000000000000000000000000000000000' as const,
} as const;

/**
 * Chain Configurations
 */
export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Base Mainnet
  8453: {
    chainId: 8453,
    name: 'Base',
    shortName: 'base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    explorerApiUrl: 'https://api.basescan.org/api',
    isTestnet: false,
    tokens: {
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        address: USDC_ADDRESSES[8453],
        coingeckoId: 'usd-coin',
      },
    },
  },

  // Base Sepolia (Testnet)
  84532: {
    chainId: 84532,
    name: 'Base Sepolia',
    shortName: 'base-sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    explorerApiUrl: 'https://api-sepolia.basescan.org/api',
    isTestnet: true,
    tokens: {
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin (Test)',
        decimals: 6,
        address: USDC_ADDRESSES[84532],
      },
    },
  },

  // Local Hardhat
  31337: {
    chainId: 31337,
    name: 'Hardhat Local',
    shortName: 'localhost',
    rpcUrl: 'http://127.0.0.1:8545',
    explorerUrl: '',
    explorerApiUrl: '',
    isTestnet: true,
    tokens: {
      USDC: {
        symbol: 'USDC',
        name: 'USD Coin (Mock)',
        decimals: 6,
        address: USDC_ADDRESSES[31337],
      },
    },
  },
};

/**
 * Get current chain configuration based on environment
 */
export function getCurrentChainConfig(): ChainConfig {
  const chainId = parseInt(process.env.CHAIN_ID || '84532');
  const config = CHAIN_CONFIGS[chainId];

  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${Object.keys(CHAIN_CONFIGS).join(', ')}`);
  }

  return config;
}

/**
 * Get USDC address for current chain
 */
export function getUsdcAddress(): `0x${string}` {
  const envAddress = process.env.USDC_ADDRESS;
  if (envAddress) {
    return envAddress as `0x${string}`;
  }

  const chainId = parseInt(process.env.CHAIN_ID || '84532');
  const address = USDC_ADDRESSES[chainId as keyof typeof USDC_ADDRESSES];

  if (!address || address === '0x0000000000000000000000000000000000000000') {
    throw new Error(`No USDC address configured for chain ${chainId}. Set USDC_ADDRESS environment variable.`);
  }

  return address;
}

/**
 * Get USDC token configuration for current chain
 */
export function getUsdcConfig(): TokenConfig {
  const config = getCurrentChainConfig();
  return config.tokens.USDC;
}

/**
 * Format USDC amount for display (6 decimals)
 */
export function formatUsdc(amount: bigint | number): string {
  const value = typeof amount === 'number' ? BigInt(Math.round(amount * 1_000_000)) : amount;
  const whole = value / 1_000_000n;
  const decimal = value % 1_000_000n;
  const decimalStr = decimal.toString().padStart(6, '0').replace(/0+$/, '');

  if (decimalStr === '') {
    return whole.toString();
  }

  return `${whole}.${decimalStr}`;
}

/**
 * Parse USDC amount from string to smallest unit (6 decimals)
 */
export function parseUsdc(amount: string): bigint {
  const [whole, decimal = ''] = amount.split('.');
  const paddedDecimal = decimal.slice(0, 6).padEnd(6, '0');
  return BigInt(whole) * 1_000_000n + BigInt(paddedDecimal);
}

/**
 * Convert USDC amount to database-friendly number (float with 6 decimal precision)
 */
export function usdcToDbAmount(usdcAmount: bigint): number {
  return Number(usdcAmount) / 1_000_000;
}

/**
 * Convert database amount to USDC smallest unit
 */
export function dbAmountToUsdc(dbAmount: number): bigint {
  return BigInt(Math.round(dbAmount * 1_000_000));
}

/**
 * Validate USDC amount
 */
export function isValidUsdcAmount(amount: number): boolean {
  // Must be positive
  if (amount <= 0) return false;

  // Must have at most 6 decimal places
  const decimals = (amount.toString().split('.')[1] || '').length;
  if (decimals > 6) return false;

  // Must be within reasonable bounds
  const MAX_AMOUNT = 1_000_000_000; // 1 billion USDC
  if (amount > MAX_AMOUNT) return false;

  return true;
}

/**
 * Get explorer URL for transaction
 */
export function getExplorerTxUrl(txHash: string): string {
  const config = getCurrentChainConfig();
  if (!config.explorerUrl) return '';
  return `${config.explorerUrl}/tx/${txHash}`;
}

/**
 * Get explorer URL for address
 */
export function getExplorerAddressUrl(address: string): string {
  const config = getCurrentChainConfig();
  if (!config.explorerUrl) return '';
  return `${config.explorerUrl}/address/${address}`;
}

// Export type for chain IDs
export type SupportedChainId = keyof typeof USDC_ADDRESSES;
