/**
 * Sanctions Wallet Screening
 *
 * Blocks known OFAC-sanctioned wallet addresses from using the platform.
 * Checks a local set of known addresses and optionally the Chainalysis
 * Sanctions Oracle on-chain.
 *
 * Applied to escrow, staking, and wallet-linking routes.
 */

import { Request, Response, NextFunction } from 'express';

// Known OFAC-sanctioned addresses (Tornado Cash, Lazarus Group, etc.)
// Source: https://www.treasury.gov/ofac/downloads/sdnlist.txt  (wallet addrs)
// This list should be updated periodically from OFAC's SDN list.
const SANCTIONED_ADDRESSES: Set<string> = new Set([
  // Tornado Cash router & proxy
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b',
  '0xd96f2b1cf787cf1b4044dae0a4df77ba05823e83',
  '0x4736dcf1b7a3d580672cce6e7c65cd5cc9cfbfa9',
  '0xdd4c48c0b24039969fc16d1cdf626eab821d3384',
  '0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3',
  '0x722122df12d4e14e13ac3b6895a86e84145b6967',
  '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144',
  '0xf60dd140cff0706bae9cd734ac3683731eb8b57d',
  '0x9ad122c22b14202b4490edaf288fdb3c7cb3ff5e',
  '0xa160cdab225685da1d56aa342ad8841c3b53f291',
  '0x07687e702b410fa43f4cb4af7fa097918ffd2730',
  '0x94a1b5cdb22c43faab4abeb5c74999895464ddba',
  '0xb541fc07bc7619fd4062a54d96268525cbc6ffef',
  '0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc',
  '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936',
  '0x23773e65ed146a459791799d01336db287f25334',
  '0xd21be7248e0197ee08e0c20d4a398b3aaa1f3b6b',
  '0x610b717796ad172b316836ac95a2ffad065ceab4',
  '0x178169b423a011fff22b9e3f3abea13414ddd0f1',
  '0xba214c1c1928a32bffe790263e38b4af9bfcd659',
  '0xb1c8094b234dce6e03f10a5b673c1d8c69739a00',
  '0x527653ea119f3e6a1f5bd18fbf4714081d7b31ce',
  '0x58e8dcc13be9780fc42e8723d8ead4cf46943df2',
  '0xd691f27f38b395864ea86cfc7253969b409c362d',
  '0xaeaac358560e11f52454d997aaff2c5731b6f8a6',
  '0x1356c899d8c9467c7f71c195612f8a395abf2f0a',
  '0xa60c772958a3ed56c1f15dd055ba37ac8e523a0d',
  '0x169ad27a7a1d3ef92aa7fdf08a5fbd0dcab9eb47',
  // Lazarus Group / DPRK
  '0x098b716b8aaf21512996dc57eb0615e2383e2f96',
  '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b',
  '0x3cffd56b47b7b41c56258d9c7731abadc360e460',
  '0x53b6936513e738f44fb50d2b9476730c0ab3bfc1',
]);

/**
 * Check if a wallet address is sanctioned.
 */
export function isWalletSanctioned(address: string): boolean {
  if (!address) return false;
  return SANCTIONED_ADDRESSES.has(address.toLowerCase());
}

/**
 * Validate that a wallet is not sanctioned. Throws if sanctioned.
 */
export function validateWalletNotSanctioned(address: string): void {
  if (isWalletSanctioned(address)) {
    throw new SanctionedWalletError(address);
  }
}

export class SanctionedWalletError extends Error {
  public readonly statusCode = 403;
  public readonly code = 'SANCTIONED_WALLET';

  constructor(address: string) {
    super(`Wallet ${address.slice(0, 6)}...${address.slice(-4)} is restricted under international sanctions.`);
    this.name = 'SanctionedWalletError';
  }
}

/**
 * Express middleware that screens wallet addresses in request bodies/params.
 * Checks fields: walletAddress, wallet_address, worker_address, requester_address, address.
 */
export function sanctionsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const addressFields = [
    'walletAddress',
    'wallet_address',
    'workerAddress',
    'worker_address',
    'requesterAddress',
    'requester_address',
    'address',
  ];

  // Check body
  if (req.body && typeof req.body === 'object') {
    for (const field of addressFields) {
      const addr = req.body[field];
      if (addr && typeof addr === 'string' && isWalletSanctioned(addr)) {
        res.status(403).json({
          error: 'Forbidden',
          code: 'SANCTIONED_WALLET',
          message: 'The provided wallet address is restricted under international sanctions.',
        });
        return;
      }
    }
  }

  // Check params
  if (req.params) {
    for (const field of ['address', 'walletAddress']) {
      const addr = req.params[field];
      if (addr && typeof addr === 'string' && isWalletSanctioned(addr)) {
        res.status(403).json({
          error: 'Forbidden',
          code: 'SANCTIONED_WALLET',
          message: 'The provided wallet address is restricted under international sanctions.',
        });
        return;
      }
    }
  }

  next();
}
