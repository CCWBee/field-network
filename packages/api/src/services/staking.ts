/**
 * Worker Staking Service
 *
 * Workers must stake a percentage of bounty when claiming tasks.
 * Supports both mock (development) and on-chain (production) staking.
 *
 * Stake flow:
 * 1. Worker claims task -> stake required
 * 2. Good submission -> stake returned + bounty paid
 * 3. Rejected (no dispute) -> stake returned (benefit of doubt)
 * 4. Dispute lost by worker -> stake slashed
 *
 * Stake percentage varies by:
 * - Base rate: 10-20% of bounty
 * - Strike penalty: +2% per strike
 * - Reputation discount: -5% for high-rep workers (>90 score)
 */

import { prisma } from './database';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodePacked } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract ABI (minimal subset for staking operations)
const STAKING_ABI = parseAbi([
  'function calculateRequiredStake(uint256 bountyAmount, uint256 strikeCount, uint256 reputationScore) external view returns (uint256)',
  'function stake(bytes32 taskId, uint256 bountyAmount, uint256 strikeCount, uint256 reputationScore) external',
  'function stakeFor(address worker, bytes32 taskId, uint256 bountyAmount, uint256 strikeCount, uint256 reputationScore) external',
  'function releaseStake(bytes32 taskId, address worker) external',
  'function slashStake(bytes32 taskId, address worker, address requester, uint256 requesterShareBps) external',
  'function partialSlash(bytes32 taskId, address worker, address requester, uint256 workerReturnBps, uint256 requesterShareBps) external',
  'function getStake(bytes32 taskId, address worker) external view returns ((bytes32 taskId, address worker, uint256 amount, uint256 bountyAmount, uint8 status, uint256 createdAt, uint256 releasedAt))',
  'function getWorkerStrikes(address worker) external view returns (uint256)',
  'event Staked(bytes32 indexed stakeId, bytes32 indexed taskId, address indexed worker, uint256 amount, uint256 bountyAmount)',
  'event StakeReleased(bytes32 indexed stakeId, address indexed worker, uint256 amount)',
  'event StakeSlashed(bytes32 indexed stakeId, address indexed worker, uint256 workerAmount, uint256 requesterAmount, uint256 platformAmount, address requester)',
]);

// USDC ABI for approval
const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

// Default stake configuration
const DEFAULT_CONFIG = {
  baseStakeBps: 1500,        // 15% base stake
  minStakeBps: 500,          // 5% minimum (for high-rep workers)
  maxStakeBps: 3000,         // 30% maximum (for repeat offenders)
  strikeIncrementBps: 200,   // +2% per strike
  highReputationThreshold: 90, // 90/100 for discount
  reputationDiscountBps: 500, // -5% for high-rep
  platformSlashShareBps: 5000, // 50% of slash to platform
};

export interface StakeResult {
  success: boolean;
  stakeId?: string;
  amount?: number;
  txHash?: string;
  error?: string;
}

export interface StakeInfo {
  taskId: string;
  workerId: string;
  amount: number;
  bountyAmount: number;
  status: 'pending' | 'held' | 'released' | 'slashed';
  stakePercentage: number;
  strikeCount: number;
  reputationScore: number;
  createdAt: Date;
  releasedAt?: Date;
  slashedAt?: Date;
}

export interface StakingProvider {
  /**
   * Calculate required stake amount for a worker
   */
  calculateRequiredStake(
    bountyAmount: number,
    strikeCount: number,
    reputationScore: number
  ): Promise<{ amount: number; percentage: number }>;

  /**
   * Create and hold stake when worker claims task
   */
  createStake(
    taskId: string,
    workerId: string,
    bountyAmount: number,
    workerAddress?: string
  ): Promise<StakeResult>;

  /**
   * Release stake back to worker (successful submission or rejection)
   */
  releaseStake(taskId: string, workerId: string): Promise<StakeResult>;

  /**
   * Slash stake when worker loses dispute
   */
  slashStake(
    taskId: string,
    workerId: string,
    requesterAddress: string,
    reason: string,
    requesterShareBps?: number
  ): Promise<StakeResult>;

  /**
   * Partial slash with some return to worker
   */
  partialSlash(
    taskId: string,
    workerId: string,
    requesterAddress: string,
    workerReturnBps: number,
    requesterShareBps: number
  ): Promise<StakeResult>;

  /**
   * Get stake info for a task/worker
   */
  getStake(taskId: string, workerId: string): Promise<StakeInfo | null>;

  /**
   * Check if worker has sufficient allowance for stake
   */
  checkAllowance(workerAddress: string, amount: number): Promise<boolean>;
}

/**
 * Get worker's strike count and reputation score
 */
async function getWorkerStakingData(workerId: string): Promise<{
  strikeCount: number;
  reputationScore: number;
}> {
  const [workerProfile, userStats] = await Promise.all([
    prisma.workerProfile.findUnique({ where: { userId: workerId } }),
    prisma.userStats.findUnique({ where: { userId: workerId } }),
  ]);

  return {
    strikeCount: workerProfile?.strikes ?? 0,
    reputationScore: userStats?.reliabilityScore ?? 100,
  };
}

/**
 * Calculate stake percentage based on strikes and reputation
 */
function calculateStakePercentage(
  strikeCount: number,
  reputationScore: number,
  config = DEFAULT_CONFIG
): number {
  let stakeBps = config.baseStakeBps;

  // Add strike penalty
  stakeBps += strikeCount * config.strikeIncrementBps;

  // Apply reputation discount for high-rep workers
  if (reputationScore >= config.highReputationThreshold) {
    stakeBps -= config.reputationDiscountBps;
  }

  // Clamp to min/max
  stakeBps = Math.max(config.minStakeBps, Math.min(config.maxStakeBps, stakeBps));

  return stakeBps / 100; // Return as percentage (e.g., 15 for 15%)
}

/**
 * Mock Staking Provider
 * Tracks stake state in database without actual fund movement.
 */
class MockStakingProvider implements StakingProvider {
  async calculateRequiredStake(
    bountyAmount: number,
    strikeCount: number,
    reputationScore: number
  ): Promise<{ amount: number; percentage: number }> {
    const percentage = calculateStakePercentage(strikeCount, reputationScore);
    const amount = Math.round((bountyAmount * percentage) / 100 * 100) / 100;
    return { amount, percentage };
  }

  async createStake(
    taskId: string,
    workerId: string,
    bountyAmount: number,
    _workerAddress?: string
  ): Promise<StakeResult> {
    try {
      // Check for existing stake
      const existingStake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (existingStake) {
        return { success: false, error: 'Stake already exists for this task' };
      }

      // Get worker data
      const { strikeCount, reputationScore } = await getWorkerStakingData(workerId);
      const { amount, percentage } = await this.calculateRequiredStake(
        bountyAmount,
        strikeCount,
        reputationScore
      );

      const mockTxHash = `mock_stake_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const stake = await prisma.stake.create({
        data: {
          taskId,
          workerId,
          provider: 'mock',
          providerRef: mockTxHash,
          amount,
          bountyAmount,
          strikeCount,
          reputationScore,
          stakePercentage: percentage,
          status: 'held',
          stakeTxHash: mockTxHash,
          heldAt: new Date(),
        },
      });

      // Create ledger entry for stake
      await prisma.ledgerEntry.create({
        data: {
          taskId,
          entryType: 'stake',
          amount,
          currency: 'USDC',
          direction: 'credit',
          counterpartyId: workerId,
          txHash: mockTxHash,
          metadata: JSON.stringify({
            stake_id: stake.id,
            strike_count: strikeCount,
            reputation_score: reputationScore,
            stake_percentage: percentage,
          }),
        },
      });

      return {
        success: true,
        stakeId: stake.id,
        amount,
        txHash: mockTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create stake',
      };
    }
  }

  async releaseStake(taskId: string, workerId: string): Promise<StakeResult> {
    try {
      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be released (status: ${stake.status})` };
      }

      const releaseTxHash = `mock_release_${Date.now()}`;

      await prisma.$transaction([
        prisma.stake.update({
          where: { id: stake.id },
          data: {
            status: 'released',
            releaseTxHash,
            releasedAt: new Date(),
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'stake_release',
            amount: stake.amount,
            currency: 'USDC',
            direction: 'debit',
            counterpartyId: workerId,
            txHash: releaseTxHash,
            metadata: JSON.stringify({ stake_id: stake.id }),
          },
        }),
      ]);

      return {
        success: true,
        stakeId: stake.id,
        amount: stake.amount,
        txHash: releaseTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to release stake',
      };
    }
  }

  async slashStake(
    taskId: string,
    workerId: string,
    _requesterAddress: string,
    reason: string,
    requesterShareBps: number = 5000 // Default 50% to requester
  ): Promise<StakeResult> {
    try {
      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be slashed (status: ${stake.status})` };
      }

      // Calculate split
      const requesterShare = Math.round((stake.amount * requesterShareBps) / 10000 * 100) / 100;
      const platformShare = Math.round((stake.amount - requesterShare) * 100) / 100;

      const slashTxHash = `mock_slash_${Date.now()}`;

      await prisma.$transaction([
        // Update stake
        prisma.stake.update({
          where: { id: stake.id },
          data: {
            status: 'slashed',
            slashTxHash,
            slashedAt: new Date(),
            slashReason: reason,
            requesterShare,
            platformShare,
            workerReturn: 0,
          },
        }),
        // Increment worker strikes
        prisma.workerProfile.updateMany({
          where: { userId: workerId },
          data: { strikes: { increment: 1 } },
        }),
        // Ledger entries
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'stake_slash',
            amount: stake.amount,
            currency: 'USDC',
            direction: 'debit',
            counterpartyId: workerId,
            txHash: slashTxHash,
            metadata: JSON.stringify({
              stake_id: stake.id,
              reason,
              requester_share: requesterShare,
              platform_share: platformShare,
            }),
          },
        }),
      ]);

      return {
        success: true,
        stakeId: stake.id,
        amount: stake.amount,
        txHash: slashTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to slash stake',
      };
    }
  }

  async partialSlash(
    taskId: string,
    workerId: string,
    _requesterAddress: string,
    workerReturnBps: number,
    requesterShareBps: number
  ): Promise<StakeResult> {
    try {
      if (workerReturnBps + requesterShareBps > 10000) {
        return { success: false, error: 'Total share cannot exceed 100%' };
      }

      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be slashed (status: ${stake.status})` };
      }

      // Calculate split
      const workerReturn = Math.round((stake.amount * workerReturnBps) / 10000 * 100) / 100;
      const requesterShare = Math.round((stake.amount * requesterShareBps) / 10000 * 100) / 100;
      const platformShare = Math.round((stake.amount - workerReturn - requesterShare) * 100) / 100;

      const slashTxHash = `mock_partial_slash_${Date.now()}`;

      await prisma.$transaction([
        prisma.stake.update({
          where: { id: stake.id },
          data: {
            status: 'slashed',
            slashTxHash,
            slashedAt: new Date(),
            slashReason: 'partial_dispute_loss',
            requesterShare,
            platformShare,
            workerReturn,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'stake_partial_slash',
            amount: stake.amount,
            currency: 'USDC',
            direction: 'debit',
            counterpartyId: workerId,
            txHash: slashTxHash,
            metadata: JSON.stringify({
              stake_id: stake.id,
              worker_return: workerReturn,
              requester_share: requesterShare,
              platform_share: platformShare,
            }),
          },
        }),
      ]);

      return {
        success: true,
        stakeId: stake.id,
        amount: stake.amount,
        txHash: slashTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to partial slash stake',
      };
    }
  }

  async getStake(taskId: string, workerId: string): Promise<StakeInfo | null> {
    const stake = await prisma.stake.findUnique({
      where: { taskId_workerId: { taskId, workerId } },
    });

    if (!stake) return null;

    return {
      taskId: stake.taskId,
      workerId: stake.workerId,
      amount: stake.amount,
      bountyAmount: stake.bountyAmount,
      status: stake.status as StakeInfo['status'],
      stakePercentage: stake.stakePercentage,
      strikeCount: stake.strikeCount,
      reputationScore: stake.reputationScore,
      createdAt: stake.createdAt,
      releasedAt: stake.releasedAt ?? undefined,
      slashedAt: stake.slashedAt ?? undefined,
    };
  }

  async checkAllowance(_workerAddress: string, _amount: number): Promise<boolean> {
    // Mock always returns true
    return true;
  }
}

/**
 * On-Chain Staking Provider
 * Interacts with WorkerStaking.sol contract on Base.
 */
class OnChainStakingProvider implements StakingProvider {
  private publicClient;
  private walletClient;
  private contractAddress: `0x${string}`;
  private usdcAddress: `0x${string}`;

  constructor() {
    const chainId = process.env.CHAIN_ID === '8453' ? 'mainnet' : 'sepolia';
    const chain = chainId === 'mainnet' ? base : baseSepolia;
    const rpcUrl = process.env.BASE_RPC_URL || (chainId === 'mainnet'
      ? 'https://mainnet.base.org'
      : 'https://sepolia.base.org');

    this.contractAddress = (process.env.STAKING_CONTRACT_ADDRESS || '0x0') as `0x${string}`;
    this.usdcAddress = (process.env.USDC_ADDRESS || (chainId === 'mainnet'
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    )) as `0x${string}`;

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const operatorKey = process.env.OPERATOR_PRIVATE_KEY;
    if (operatorKey) {
      const account = privateKeyToAccount(operatorKey as `0x${string}`);
      this.walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      });
    }
  }

  private uuidToBytes32(uuid: string): `0x${string}` {
    const hex = uuid.replace(/-/g, '');
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
  }

  async calculateRequiredStake(
    bountyAmount: number,
    strikeCount: number,
    reputationScore: number
  ): Promise<{ amount: number; percentage: number }> {
    try {
      // USDC has 6 decimals
      const bountyInUsdc = BigInt(Math.round(bountyAmount * 1_000_000));
      // Reputation score is 0-100, contract expects 0-10000
      const repScaled = BigInt(Math.round(reputationScore * 100));

      const requiredStake = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: STAKING_ABI,
        functionName: 'calculateRequiredStake',
        args: [bountyInUsdc, BigInt(strikeCount), repScaled],
      });

      const amount = Number(requiredStake) / 1_000_000;
      const percentage = bountyAmount > 0 ? (amount / bountyAmount) * 100 : 0;

      return { amount, percentage };
    } catch {
      // Fall back to local calculation
      const percentage = calculateStakePercentage(strikeCount, reputationScore);
      const amount = Math.round((bountyAmount * percentage) / 100 * 100) / 100;
      return { amount, percentage };
    }
  }

  async createStake(
    taskId: string,
    workerId: string,
    bountyAmount: number,
    workerAddress?: string
  ): Promise<StakeResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      if (!workerAddress) {
        return { success: false, error: 'Worker wallet address required for on-chain stake' };
      }

      // Check for existing stake
      const existingStake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (existingStake) {
        return { success: false, error: 'Stake already exists for this task' };
      }

      // Get worker data
      const { strikeCount, reputationScore } = await getWorkerStakingData(workerId);
      const { amount, percentage } = await this.calculateRequiredStake(
        bountyAmount,
        strikeCount,
        reputationScore
      );

      const taskIdBytes = this.uuidToBytes32(taskId);
      const bountyInUsdc = BigInt(Math.round(bountyAmount * 1_000_000));
      const repScaled = BigInt(Math.round(reputationScore * 100));

      // Create DB record first (pending)
      const stake = await prisma.stake.create({
        data: {
          taskId,
          workerId,
          provider: 'onchain',
          amount,
          bountyAmount,
          strikeCount,
          reputationScore,
          stakePercentage: percentage,
          status: 'pending',
          chainId: parseInt(process.env.CHAIN_ID || '84532'),
          contractAddress: this.contractAddress,
        },
      });

      // Call stakeFor (operator stakes on behalf of worker)
      // Worker must have pre-approved USDC to staking contract
      const txHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: STAKING_ABI,
        functionName: 'stakeFor',
        args: [
          workerAddress as `0x${string}`,
          taskIdBytes,
          bountyInUsdc,
          BigInt(strikeCount),
          repScaled,
        ],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Update stake record
      await prisma.stake.update({
        where: { id: stake.id },
        data: {
          status: 'held',
          stakeTxHash: txHash,
          providerRef: keccak256(encodePacked(['bytes32', 'address'], [taskIdBytes, workerAddress as `0x${string}`])),
          heldAt: new Date(),
        },
      });

      // Create ledger entry
      await prisma.ledgerEntry.create({
        data: {
          taskId,
          entryType: 'stake',
          amount,
          currency: 'USDC',
          direction: 'credit',
          counterpartyId: workerId,
          walletAddress: workerAddress,
          txHash,
          chainId: parseInt(process.env.CHAIN_ID || '84532'),
          metadata: JSON.stringify({
            stake_id: stake.id,
            strike_count: strikeCount,
            reputation_score: reputationScore,
            stake_percentage: percentage,
          }),
        },
      });

      return {
        success: true,
        stakeId: stake.id,
        amount,
        txHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create stake',
      };
    }
  }

  /**
   * Release stake back to worker.
   *
   * NOTE: With permissionless contracts:
   * - Worker can release their own stake immediately
   * - Anyone can release after 24h delay
   *
   * This backend function serves as a "release helper" that can trigger release.
   * Workers should typically call releaseStake directly from the frontend for
   * immediate release, but this can be used as a fallback or for automated release.
   */
  async releaseStake(taskId: string, workerId: string): Promise<StakeResult> {
    try {
      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be released (status: ${stake.status})` };
      }

      // Get worker wallet
      const workerWallet = await prisma.walletLink.findFirst({
        where: { userId: workerId, isPrimary: true },
      });

      if (!workerWallet) {
        return { success: false, error: 'Worker wallet not found' };
      }

      // For on-chain release, we try to call releaseStake
      // This will succeed if: worker calls it, or 24h delay has passed
      if (this.walletClient) {
        try {
          const taskIdBytes = this.uuidToBytes32(taskId);

          const txHash = await this.walletClient.writeContract({
            address: this.contractAddress,
            abi: STAKING_ABI,
            functionName: 'releaseStake',
            args: [taskIdBytes, workerWallet.walletAddress as `0x${string}`],
          });

          await this.publicClient.waitForTransactionReceipt({ hash: txHash });

          await prisma.$transaction([
            prisma.stake.update({
              where: { id: stake.id },
              data: {
                status: 'released',
                releaseTxHash: txHash,
                releasedAt: new Date(),
              },
            }),
            prisma.ledgerEntry.create({
              data: {
                taskId,
                entryType: 'stake_release',
                amount: stake.amount,
                currency: 'USDC',
                direction: 'debit',
                counterpartyId: workerId,
                walletAddress: workerWallet.walletAddress,
                txHash,
                chainId: parseInt(process.env.CHAIN_ID || '84532'),
                metadata: JSON.stringify({ stake_id: stake.id }),
              },
            }),
          ]);

          return {
            success: true,
            stakeId: stake.id,
            amount: stake.amount,
            txHash,
          };
        } catch (error) {
          // If on-chain release fails (e.g., delay not passed and not worker),
          // we mark it for later processing
          console.warn(`On-chain stake release failed, will retry later: ${error}`);
          return {
            success: false,
            error: 'Stake release pending - worker can release immediately from wallet, or anyone after 24h delay',
          };
        }
      }

      // No wallet client - mark as pending release
      return {
        success: false,
        error: 'On-chain release not configured - worker should release directly from frontend',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to release stake',
      };
    }
  }

  async slashStake(
    taskId: string,
    workerId: string,
    requesterAddress: string,
    reason: string,
    requesterShareBps: number = 5000
  ): Promise<StakeResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be slashed (status: ${stake.status})` };
      }

      const workerWallet = await prisma.walletLink.findFirst({
        where: { userId: workerId, isPrimary: true },
      });

      if (!workerWallet) {
        return { success: false, error: 'Worker wallet not found' };
      }

      const taskIdBytes = this.uuidToBytes32(taskId);

      const txHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: STAKING_ABI,
        functionName: 'slashStake',
        args: [
          taskIdBytes,
          workerWallet.walletAddress as `0x${string}`,
          requesterAddress as `0x${string}`,
          BigInt(requesterShareBps),
        ],
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      const requesterShare = Math.round((stake.amount * requesterShareBps) / 10000 * 100) / 100;
      const platformShare = Math.round((stake.amount - requesterShare) * 100) / 100;

      await prisma.$transaction([
        prisma.stake.update({
          where: { id: stake.id },
          data: {
            status: 'slashed',
            slashTxHash: txHash,
            slashedAt: new Date(),
            slashReason: reason,
            requesterShare,
            platformShare,
            workerReturn: 0,
          },
        }),
        prisma.workerProfile.updateMany({
          where: { userId: workerId },
          data: { strikes: { increment: 1 } },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'stake_slash',
            amount: stake.amount,
            currency: 'USDC',
            direction: 'debit',
            counterpartyId: workerId,
            walletAddress: workerWallet.walletAddress,
            txHash,
            chainId: parseInt(process.env.CHAIN_ID || '84532'),
            metadata: JSON.stringify({
              stake_id: stake.id,
              reason,
              requester_share: requesterShare,
              platform_share: platformShare,
            }),
          },
        }),
      ]);

      return {
        success: true,
        stakeId: stake.id,
        amount: stake.amount,
        txHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to slash stake',
      };
    }
  }

  async partialSlash(
    taskId: string,
    workerId: string,
    requesterAddress: string,
    workerReturnBps: number,
    requesterShareBps: number
  ): Promise<StakeResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      if (workerReturnBps + requesterShareBps > 10000) {
        return { success: false, error: 'Total share cannot exceed 100%' };
      }

      const stake = await prisma.stake.findUnique({
        where: { taskId_workerId: { taskId, workerId } },
      });

      if (!stake) {
        return { success: false, error: 'No stake found for task' };
      }

      if (stake.status !== 'held') {
        return { success: false, error: `Stake cannot be slashed (status: ${stake.status})` };
      }

      const workerWallet = await prisma.walletLink.findFirst({
        where: { userId: workerId, isPrimary: true },
      });

      if (!workerWallet) {
        return { success: false, error: 'Worker wallet not found' };
      }

      const taskIdBytes = this.uuidToBytes32(taskId);

      const txHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: STAKING_ABI,
        functionName: 'partialSlash',
        args: [
          taskIdBytes,
          workerWallet.walletAddress as `0x${string}`,
          requesterAddress as `0x${string}`,
          BigInt(workerReturnBps),
          BigInt(requesterShareBps),
        ],
      });

      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      const workerReturn = Math.round((stake.amount * workerReturnBps) / 10000 * 100) / 100;
      const requesterShare = Math.round((stake.amount * requesterShareBps) / 10000 * 100) / 100;
      const platformShare = Math.round((stake.amount - workerReturn - requesterShare) * 100) / 100;

      await prisma.$transaction([
        prisma.stake.update({
          where: { id: stake.id },
          data: {
            status: 'slashed',
            slashTxHash: txHash,
            slashedAt: new Date(),
            slashReason: 'partial_dispute_loss',
            requesterShare,
            platformShare,
            workerReturn,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'stake_partial_slash',
            amount: stake.amount,
            currency: 'USDC',
            direction: 'debit',
            counterpartyId: workerId,
            walletAddress: workerWallet.walletAddress,
            txHash,
            chainId: parseInt(process.env.CHAIN_ID || '84532'),
            metadata: JSON.stringify({
              stake_id: stake.id,
              worker_return: workerReturn,
              requester_share: requesterShare,
              platform_share: platformShare,
            }),
          },
        }),
      ]);

      return {
        success: true,
        stakeId: stake.id,
        amount: stake.amount,
        txHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to partial slash stake',
      };
    }
  }

  async getStake(taskId: string, workerId: string): Promise<StakeInfo | null> {
    const stake = await prisma.stake.findUnique({
      where: { taskId_workerId: { taskId, workerId } },
    });

    if (!stake) return null;

    return {
      taskId: stake.taskId,
      workerId: stake.workerId,
      amount: stake.amount,
      bountyAmount: stake.bountyAmount,
      status: stake.status as StakeInfo['status'],
      stakePercentage: stake.stakePercentage,
      strikeCount: stake.strikeCount,
      reputationScore: stake.reputationScore,
      createdAt: stake.createdAt,
      releasedAt: stake.releasedAt ?? undefined,
      slashedAt: stake.slashedAt ?? undefined,
    };
  }

  async checkAllowance(workerAddress: string, amount: number): Promise<boolean> {
    try {
      const allowance = await this.publicClient.readContract({
        address: this.usdcAddress,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [workerAddress as `0x${string}`, this.contractAddress],
      });

      const amountInUsdc = BigInt(Math.round(amount * 1_000_000));
      return (allowance as bigint) >= amountInUsdc;
    } catch {
      return false;
    }
  }
}

/**
 * Select staking provider based on environment
 */
function createStakingProvider(): StakingProvider {
  const providerType = process.env.STAKING_PROVIDER || process.env.ESCROW_PROVIDER || 'mock';

  if (providerType === 'onchain') {
    console.log('Using on-chain staking provider (Base)');
    return new OnChainStakingProvider();
  }

  console.log('Using mock staking provider (development)');
  return new MockStakingProvider();
}

// Export singleton instance
export const stakingProvider: StakingProvider = createStakingProvider();

// Helper functions for routes
export async function calculateStakeForTask(
  taskId: string,
  workerId: string
): Promise<{ amount: number; percentage: number; strikeCount: number; reputationScore: number }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { bountyAmount: true },
  });

  if (!task) {
    throw new Error('Task not found');
  }

  const { strikeCount, reputationScore } = await getWorkerStakingData(workerId);
  const { amount, percentage } = await stakingProvider.calculateRequiredStake(
    task.bountyAmount,
    strikeCount,
    reputationScore
  );

  return { amount, percentage, strikeCount, reputationScore };
}

export async function createTaskStake(
  taskId: string,
  workerId: string,
  workerAddress?: string
): Promise<StakeResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { bountyAmount: true },
  });

  if (!task) {
    return { success: false, error: 'Task not found' };
  }

  return stakingProvider.createStake(taskId, workerId, task.bountyAmount, workerAddress);
}

export async function releaseTaskStake(taskId: string, workerId: string): Promise<StakeResult> {
  return stakingProvider.releaseStake(taskId, workerId);
}

export async function slashTaskStake(
  taskId: string,
  workerId: string,
  requesterAddress: string,
  reason: string,
  requesterShareBps?: number
): Promise<StakeResult> {
  return stakingProvider.slashStake(taskId, workerId, requesterAddress, reason, requesterShareBps);
}

export async function getTaskStake(taskId: string, workerId: string): Promise<StakeInfo | null> {
  return stakingProvider.getStake(taskId, workerId);
}
