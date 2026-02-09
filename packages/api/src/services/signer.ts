/**
 * Signer Provider
 *
 * Abstracts the operator wallet behind a provider interface so we can swap
 * between env-based keys (dev/staging) and KMS-backed keys (production)
 * without changing any calling code.
 */

import { createWalletClient, http, type WalletClient, type Chain } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

export interface SignerProvider {
  getWalletClient(): WalletClient;
  getAddress(): `0x${string}`;
}

/**
 * Reads OPERATOR_PRIVATE_KEY from environment.
 * Suitable for development and staging.
 */
class EnvKeySignerProvider implements SignerProvider {
  private account: PrivateKeyAccount;
  private walletClient: WalletClient;

  constructor() {
    const key = process.env.OPERATOR_PRIVATE_KEY;
    if (!key) {
      throw new Error(
        'OPERATOR_PRIVATE_KEY must be set when using env signer provider.'
      );
    }

    this.account = privateKeyToAccount(key as `0x${string}`);

    const chain = getChain();
    const rpcUrl = getRpcUrl(chain);

    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    });
  }

  getWalletClient(): WalletClient {
    return this.walletClient;
  }

  getAddress(): `0x${string}` {
    return this.account.address;
  }
}

/**
 * Placeholder for AWS KMS integration.
 * In production, this would use @aws-sdk/client-kms to sign transactions
 * without exposing the private key to the application runtime.
 */
class KmsSignerProvider implements SignerProvider {
  constructor() {
    throw new Error(
      'KMS signer provider is not yet implemented. ' +
      'Set SIGNER_PROVIDER=env to use the environment key provider.'
    );
  }

  getWalletClient(): WalletClient {
    throw new Error('Not implemented');
  }

  getAddress(): `0x${string}` {
    throw new Error('Not implemented');
  }
}

// Helpers
function getChain(): Chain {
  return process.env.CHAIN_ID === '8453' ? base : baseSepolia;
}

function getRpcUrl(chain: Chain): string {
  return (
    process.env.BASE_RPC_URL ||
    (chain.id === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org')
  );
}

// Singleton
let _provider: SignerProvider | null = null;

export function getSignerProvider(): SignerProvider {
  if (!_provider) {
    const kind = process.env.SIGNER_PROVIDER || 'env';
    if (kind === 'kms') {
      _provider = new KmsSignerProvider();
    } else {
      _provider = new EnvKeySignerProvider();
    }
  }
  return _provider;
}

/** Reset for tests */
export function resetSignerProvider(): void {
  _provider = null;
}
