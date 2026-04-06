/**
 * Escrow Service
 *
 * Supports both mock (development) and on-chain (production) escrow.
 * Set ESCROW_PROVIDER=onchain and configure contract address for production.
 */

import { prisma } from './database';
import { createPublicClient, http, parseAbi, stringToHex, keccak256, encodePacked } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { calculatePlatformFee } from './fees';
import { getSignerProvider } from './signer';

// Contract ABI (minimal subset for escrow operations)
const ESCROW_ABI = parseAbi([
  'function deposit(bytes32 escrowId, bytes32 taskId, uint256 amount) external',
  'function assignWorker(bytes32 escrowId, address worker) external',
  'function accept(bytes32 escrowId) external',
  'function release(bytes32 escrowId) external',
  'function refund(bytes32 escrowId) external',
  'function openDispute(bytes32 escrowId) external',
  'function resolveDispute(bytes32 escrowId, uint8 workerShare) external',
  'function getEscrowStatus(bytes32 escrowId) external view returns (uint8)',
  'event Deposited(bytes32 indexed escrowId, bytes32 indexed taskId, address indexed requester, uint256 amount)',
  'event Released(bytes32 indexed escrowId, address indexed worker, uint256 amount, uint256 fee)',
  'event Refunded(bytes32 indexed escrowId, address indexed requester, uint256 amount)',
  'event DisputeResolved(bytes32 indexed escrowId, address indexed winner, uint256 winnerAmount, uint256 loserAmount)',
]);

// USDC contract ABI for approval
const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

export interface EscrowResult {
  success: boolean;
  escrowId?: string;
  txHash?: string;
  error?: string;
}

export interface EscrowProvider {
  createEscrow(taskId: string, amount: number, currency: string, requesterId: string): Promise<EscrowResult>;
  releaseToWorker(taskId: string, workerId: string, workerAddress?: string): Promise<EscrowResult>;
  refundToRequester(taskId: string): Promise<EscrowResult>;
  splitPayment(taskId: string, workerId: string, workerAddress: string | undefined, workerPercentage: number): Promise<EscrowResult>;
  getStatus(taskId: string): Promise<{ status: string; amount: number; currency: string } | null>;
}

/**
 * Mock Escrow Provider
 * Tracks escrow state in database without actual fund movement.
 * For development and testing. Replace with OnChainEscrowProvider for production.
 */
class MockEscrowProvider implements EscrowProvider {
  async createEscrow(taskId: string, amount: number, currency: string, requesterId: string): Promise<EscrowResult> {
    try {
      const mockTxHash = `mock_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const escrow = await prisma.escrow.create({
        data: {
          taskId,
          createdBy: requesterId,
          provider: 'mock',
          providerRef: mockTxHash,
          amount,
          currency,
          status: 'funded',
          fundedAt: new Date(),
        },
      });

      // Create ledger entry
      await prisma.ledgerEntry.create({
        data: {
          taskId,
          entryType: 'fund',
          amount,
          currency,
          direction: 'credit',
          counterpartyId: requesterId,
          txHash: mockTxHash,
        },
      });

      return {
        success: true,
        escrowId: escrow.id,
        txHash: mockTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create escrow',
      };
    }
  }

  async releaseToWorker(taskId: string, workerId: string, workerAddress?: string): Promise<EscrowResult> {
    try {
      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: 'funded' },
        include: { task: true },
      });

      if (!escrow) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      const { fee: platformFee, rate: platformFeeRate } = await calculatePlatformFee(
        escrow.task.requesterId,
        escrow.amount
      );
      const workerPayout = escrow.amount - platformFee;
      const releaseTxHash = `release_${Date.now()}`;

      await prisma.$transaction([
        // Update escrow status
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'released',
            releasedAt: new Date(),
            releaseTxHash,
            workerWallet: workerAddress,
          },
        }),
        // Create release ledger entry
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'release',
            amount: workerPayout,
            currency: escrow.currency,
            direction: 'debit',
            counterpartyId: workerId,
            walletAddress: workerAddress,
            txHash: releaseTxHash,
          },
        }),
        // Create fee ledger entry
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'fee',
            amount: platformFee,
            currency: escrow.currency,
            direction: 'debit',
            txHash: `fee_${Date.now()}`,
            metadata: JSON.stringify({ fee_rate: platformFeeRate }),
          },
        }),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash: releaseTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to release escrow',
      };
    }
  }

  async refundToRequester(taskId: string): Promise<EscrowResult> {
    try {
      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: 'funded' },
        include: { task: true },
      });

      if (!escrow) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      const refundTxHash = `refund_${Date.now()}`;

      await prisma.$transaction([
        // Update escrow status
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'refunded',
            refundedAt: new Date(),
            refundTxHash,
          },
        }),
        // Create refund ledger entry
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'refund',
            amount: escrow.amount,
            currency: escrow.currency,
            direction: 'debit',
            counterpartyId: escrow.task.requesterId,
            txHash: refundTxHash,
          },
        }),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash: refundTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refund escrow',
      };
    }
  }

  /**
   * Split escrow between worker and requester based on percentage.
   * Used for dispute resolution with partial payment outcome.
   *
   * @param taskId - The task ID
   * @param workerId - The worker's user ID
   * @param workerAddress - The worker's wallet address (optional)
   * @param workerPercentage - Percentage to pay to worker (0-100)
   */
  async splitPayment(
    taskId: string,
    workerId: string,
    workerAddress: string | undefined,
    workerPercentage: number
  ): Promise<EscrowResult> {
    try {
      // Validate percentage
      if (workerPercentage < 0 || workerPercentage > 100) {
        return { success: false, error: 'Worker percentage must be between 0 and 100' };
      }

      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: 'funded' },
        include: { task: true },
      });

      if (!escrow) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      // Calculate split amounts
      // Use Math.floor for worker amount to avoid rounding errors giving more than total
      const workerAmount = Math.floor((escrow.amount * workerPercentage) / 100 * 100) / 100; // Round to 2 decimal places
      const requesterAmount = Math.round((escrow.amount - workerAmount) * 100) / 100; // Round to 2 decimal places

      // Verify amounts sum correctly (within floating point tolerance)
      const total = workerAmount + requesterAmount;
      if (Math.abs(total - escrow.amount) > 0.01) {
        console.error(`Split calculation error: ${workerAmount} + ${requesterAmount} = ${total}, expected ${escrow.amount}`);
        return { success: false, error: 'Split calculation error' };
      }

      const splitTxHash = `split_${Date.now()}`;

      const ledgerEntries: any[] = [];

      // Worker payment entry (if > 0)
      if (workerAmount > 0) {
        ledgerEntries.push({
          taskId,
          entryType: 'release',
          amount: workerAmount,
          currency: escrow.currency,
          direction: 'debit',
          counterpartyId: workerId,
          walletAddress: workerAddress,
          txHash: `${splitTxHash}_worker`,
          metadata: JSON.stringify({
            split_percentage: workerPercentage,
            split_type: 'worker',
            original_amount: escrow.amount,
          }),
        });
      }

      // Requester refund entry (if > 0)
      if (requesterAmount > 0) {
        ledgerEntries.push({
          taskId,
          entryType: 'refund',
          amount: requesterAmount,
          currency: escrow.currency,
          direction: 'debit',
          counterpartyId: escrow.task.requesterId,
          txHash: `${splitTxHash}_requester`,
          metadata: JSON.stringify({
            split_percentage: 100 - workerPercentage,
            split_type: 'requester',
            original_amount: escrow.amount,
          }),
        });
      }

      await prisma.$transaction([
        // Update escrow status
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'released', // Mark as released since funds have been distributed
            releasedAt: new Date(),
            releaseTxHash: splitTxHash,
            workerWallet: workerAddress,
          },
        }),
        // Create ledger entries
        ...ledgerEntries.map(entry => prisma.ledgerEntry.create({ data: entry })),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash: splitTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to split escrow',
      };
    }
  }

  async getStatus(taskId: string): Promise<{ status: string; amount: number; currency: string } | null> {
    const escrow = await prisma.escrow.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    if (!escrow) return null;

    return {
      status: escrow.status,
      amount: escrow.amount,
      currency: escrow.currency,
    };
  }
}

/**
 * On-Chain Escrow Provider
 * Interacts with GroundTruthEscrow.sol contract on Base.
 */
class OnChainEscrowProvider implements EscrowProvider {
  private publicClient;
  private walletClient;
  private contractAddress: `0x${string}`;
  private usdcAddress: `0x${string}`;

  constructor() {
    // Validate required configuration on startup
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;
    if (!contractAddress || contractAddress === '0x0' || contractAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error(
        'ESCROW_CONTRACT_ADDRESS must be set when using onchain escrow provider. ' +
        'Deploy the contract first and set the address in your environment variables.'
      );
    }

    const chainId = process.env.CHAIN_ID === '8453' ? 'mainnet' : 'sepolia';
    const chain = chainId === 'mainnet' ? base : baseSepolia;
    const rpcUrl = process.env.BASE_RPC_URL || (chainId === 'mainnet'
      ? 'https://mainnet.base.org'
      : 'https://sepolia.base.org');

    this.contractAddress = contractAddress as `0x${string}`;
    this.usdcAddress = (process.env.USDC_ADDRESS || (chainId === 'mainnet'
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base mainnet USDC
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    )) as `0x${string}`;

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Use signer provider for operator wallet (supports env key or KMS)
    const signer = getSignerProvider();
    this.walletClient = signer.getWalletClient();

    console.log(`On-chain escrow provider initialized:`);
    console.log(`  Contract: ${this.contractAddress}`);
    console.log(`  Chain: ${chain.name} (${chain.id})`);
    console.log(`  Operator: ${signer.getAddress()}`);
  }

  /**
   * Convert UUID string to bytes32
   */
  private uuidToBytes32(uuid: string): `0x${string}` {
    // Remove dashes and pad to 32 bytes
    const hex = uuid.replace(/-/g, '');
    return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
  }

  async createEscrow(taskId: string, amount: number, currency: string, requesterId: string): Promise<EscrowResult> {
    try {
      // Generate unique escrow ID
      const escrowIdRaw = `${taskId}-${Date.now()}`;
      const escrowIdBytes = keccak256(encodePacked(['string'], [escrowIdRaw]));
      const taskIdBytes = this.uuidToBytes32(taskId);

      // USDC has 6 decimals
      const amountInUsdc = BigInt(Math.round(amount * 1_000_000));

      // Create DB record first
      const escrow = await prisma.escrow.create({
        data: {
          taskId,
          createdBy: requesterId,
          provider: 'onchain',
          providerRef: escrowIdBytes,
          amount,
          currency,
          status: 'pending',
        },
      });

      // NOTE: The deposit transaction must be sent by the requester's wallet
      // from the frontend. This API records the escrow and returns the
      // contract call parameters for the frontend to execute.

      return {
        success: true,
        escrowId: escrow.id,
        txHash: escrowIdBytes, // Return escrow ID for frontend to use
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create escrow',
      };
    }
  }

  /**
   * Release escrow to worker.
   *
   * NOTE: With permissionless contracts:
   * - assignWorker is now permissionless (worker calls directly from frontend)
   * - accept is now requester-only (requester calls from frontend)
   * - release can be called by requester/worker immediately, or anyone after delay
   *
   * This backend function serves as a "release helper" that triggers release
   * after the requester has already accepted on-chain. It can be called
   * by the backend to ensure release happens even if no one triggers it manually.
   */
  async releaseToWorker(taskId: string, workerId: string, workerAddress?: string): Promise<EscrowResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: { in: ['funded', 'accepted'] } },
        include: { task: true },
      });

      if (!escrow || !escrow.providerRef) {
        return { success: false, error: 'No escrow found for task' };
      }

      const escrowIdBytes = escrow.providerRef as `0x${string}`;

      // Try to release (will work if escrow is in Accepted status and delay passed,
      // or if caller is requester/worker)
      const releaseTxHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ESCROW_ABI,
        functionName: 'release',
        args: [escrowIdBytes],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: releaseTxHash });

      // Update database
      const { fee: platformFee, rate: platformFeeRate } = await calculatePlatformFee(
        escrow.task.requesterId,
        escrow.amount
      );
      const workerPayout = escrow.amount - platformFee;

      await prisma.$transaction([
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'released',
            releasedAt: new Date(),
            releaseTxHash,
            workerWallet: workerAddress,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'release',
            amount: workerPayout,
            currency: escrow.currency,
            direction: 'debit',
            counterpartyId: workerId,
            walletAddress: workerAddress,
            txHash: releaseTxHash,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'fee',
            amount: platformFee,
            currency: escrow.currency,
            direction: 'debit',
            txHash: `fee_${releaseTxHash}`,
            metadata: JSON.stringify({ fee_rate: platformFeeRate }),
          },
        }),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash: releaseTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to release escrow',
      };
    }
  }

  async refundToRequester(taskId: string): Promise<EscrowResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: 'funded' },
        include: { task: true },
      });

      if (!escrow || !escrow.providerRef) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      const escrowIdBytes = escrow.providerRef as `0x${string}`;

      // Call refund on contract
      const refundTxHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ESCROW_ABI,
        functionName: 'refund',
        args: [escrowIdBytes],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: refundTxHash });

      // Update database
      await prisma.$transaction([
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'refunded',
            refundedAt: new Date(),
            refundTxHash,
          },
        }),
        prisma.ledgerEntry.create({
          data: {
            taskId,
            entryType: 'refund',
            amount: escrow.amount,
            currency: escrow.currency,
            direction: 'debit',
            counterpartyId: escrow.task.requesterId,
            txHash: refundTxHash,
          },
        }),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash: refundTxHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refund escrow',
      };
    }
  }

  /**
   * Split escrow between worker and requester based on percentage.
   * Calls resolveDispute() on-chain which handles the split natively.
   */
  async splitPayment(
    taskId: string,
    workerId: string,
    workerAddress: string | undefined,
    workerPercentage: number
  ): Promise<EscrowResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      if (!workerAddress) {
        return { success: false, error: 'Worker wallet address required for on-chain split' };
      }

      // Validate percentage
      if (workerPercentage < 0 || workerPercentage > 100) {
        return { success: false, error: 'Worker percentage must be between 0 and 100' };
      }

      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: { in: ['funded', 'disputed'] } },
        include: { task: true },
      });

      if (!escrow || !escrow.providerRef) {
        return { success: false, error: 'No escrow found for task' };
      }

      const escrowIdBytes = escrow.providerRef as `0x${string}`;

      // Call resolveDispute on-chain (workerShare is 0-100)
      const txHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ESCROW_ABI,
        functionName: 'resolveDispute',
        args: [escrowIdBytes, workerPercentage],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Calculate split amounts for DB
      const { fee: platformFee } = await calculatePlatformFee(
        escrow.task.requesterId,
        escrow.amount
      );
      const netAmount = escrow.amount - platformFee;
      const workerAmount = Math.floor((netAmount * workerPercentage) / 100 * 100) / 100;
      const requesterAmount = Math.round((netAmount - workerAmount) * 100) / 100;

      const ledgerEntries: any[] = [];

      if (workerAmount > 0) {
        ledgerEntries.push({
          taskId,
          entryType: 'release',
          amount: workerAmount,
          currency: escrow.currency,
          direction: 'debit',
          counterpartyId: workerId,
          walletAddress: workerAddress,
          txHash,
          metadata: JSON.stringify({
            split_percentage: workerPercentage,
            split_type: 'worker',
            original_amount: escrow.amount,
          }),
        });
      }

      if (requesterAmount > 0) {
        ledgerEntries.push({
          taskId,
          entryType: 'refund',
          amount: requesterAmount,
          currency: escrow.currency,
          direction: 'debit',
          counterpartyId: escrow.task.requesterId,
          txHash: `${txHash}_requester`,
          metadata: JSON.stringify({
            split_percentage: 100 - workerPercentage,
            split_type: 'requester',
            original_amount: escrow.amount,
          }),
        });
      }

      if (platformFee > 0) {
        ledgerEntries.push({
          taskId,
          entryType: 'fee',
          amount: platformFee,
          currency: escrow.currency,
          direction: 'debit',
          txHash: `fee_${txHash}`,
        });
      }

      await prisma.$transaction([
        prisma.escrow.update({
          where: { id: escrow.id },
          data: {
            status: 'released',
            releaseTxHash: txHash,
            releasedAt: new Date(),
            workerWallet: workerAddress,
          },
        }),
        ...ledgerEntries.map(entry => prisma.ledgerEntry.create({ data: entry })),
      ]);

      return {
        success: true,
        escrowId: escrow.id,
        txHash,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to split escrow',
      };
    }
  }

  async getStatus(taskId: string): Promise<{ status: string; amount: number; currency: string } | null> {
    const escrow = await prisma.escrow.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
    });

    if (!escrow) return null;

    // Optionally verify against on-chain state
    if (escrow.providerRef && escrow.provider === 'onchain') {
      try {
        const onChainStatus = await this.publicClient.readContract({
          address: this.contractAddress,
          abi: ESCROW_ABI,
          functionName: 'getEscrowStatus',
          args: [escrow.providerRef as `0x${string}`],
        });

        const statusMap: Record<number, string> = {
          0: 'pending',
          1: 'funded',
          2: 'accepted',
          3: 'released',
          4: 'refunded',
          5: 'disputed',
        };

        return {
          status: statusMap[Number(onChainStatus)] || escrow.status,
          amount: escrow.amount,
          currency: escrow.currency,
        };
      } catch {
        // Fall back to DB state
      }
    }

    return {
      status: escrow.status,
      amount: escrow.amount,
      currency: escrow.currency,
    };
  }
}

/**
 * Select escrow provider based on environment
 */
function createEscrowProvider(): EscrowProvider {
  const providerType = process.env.ESCROW_PROVIDER || 'mock';

  if (providerType === 'onchain') {
    console.log('Using on-chain escrow provider (Base)');
    return new OnChainEscrowProvider();
  }

  console.log('Using mock escrow provider (development)');
  return new MockEscrowProvider();
}

// Export singleton instance
export const escrowProvider: EscrowProvider = createEscrowProvider();

// Helper functions for routes
export async function fundTaskEscrow(taskId: string, amount: number, currency: string, requesterId: string): Promise<EscrowResult> {
  return escrowProvider.createEscrow(taskId, amount, currency, requesterId);
}

export async function releaseEscrow(taskId: string, workerId: string, workerAddress?: string): Promise<EscrowResult> {
  return escrowProvider.releaseToWorker(taskId, workerId, workerAddress);
}

export async function refundEscrow(taskId: string): Promise<EscrowResult> {
  return escrowProvider.refundToRequester(taskId);
}

/**
 * Split escrow between worker and requester based on percentage
 * Used for dispute resolution with partial payment outcome
 */
export async function splitEscrow(
  taskId: string,
  workerId: string,
  workerAddress: string | undefined,
  workerPercentage: number
): Promise<EscrowResult> {
  return escrowProvider.splitPayment(taskId, workerId, workerAddress, workerPercentage);
}
