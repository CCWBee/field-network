import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

// ENS resolution happens on mainnet regardless of which chain we use for escrow
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'),
});

interface ENSProfile {
  name: string | null;
  avatar: string | null;
}

/**
 * Resolve ENS name for a wallet address
 */
export async function resolveENSName(address: string): Promise<string | null> {
  try {
    const ensName = await publicClient.getEnsName({
      address: address as `0x${string}`,
    });
    return ensName;
  } catch (error) {
    console.error('ENS name resolution failed:', error);
    return null;
  }
}

/**
 * Resolve ENS avatar for a wallet address or ENS name
 */
export async function resolveENSAvatar(
  addressOrName: string
): Promise<string | null> {
  try {
    const avatar = await publicClient.getEnsAvatar({
      name: addressOrName.endsWith('.eth')
        ? normalize(addressOrName)
        : await publicClient.getEnsName({
            address: addressOrName as `0x${string}`,
          }).then(n => n ? normalize(n) : null) || '',
    });
    return avatar;
  } catch (error) {
    console.error('ENS avatar resolution failed:', error);
    return null;
  }
}

/**
 * Resolve address from ENS name
 */
export async function resolveENSAddress(name: string): Promise<string | null> {
  try {
    const address = await publicClient.getEnsAddress({
      name: normalize(name),
    });
    return address;
  } catch (error) {
    console.error('ENS address resolution failed:', error);
    return null;
  }
}

/**
 * Get full ENS profile (name + avatar) for a wallet address
 */
export async function getENSProfile(address: string): Promise<ENSProfile> {
  const name = await resolveENSName(address);
  let avatar: string | null = null;

  if (name) {
    avatar = await resolveENSAvatar(name);
  }

  return { name, avatar };
}

/**
 * Suggest username from ENS name (removes .eth suffix)
 */
export function suggestUsernameFromENS(ensName: string): string {
  return ensName.replace(/\.eth$/i, '');
}

/**
 * Check if a string is a valid ENS name format
 */
export function isValidENSName(name: string): boolean {
  // Basic ENS name validation
  return /^[a-z0-9-]+\.eth$/i.test(name);
}
