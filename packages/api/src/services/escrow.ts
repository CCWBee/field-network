/**
 * Escrow Service
 *
 * Supports both mock (development) and on-chain (production) escrow.
 * Set ESCROW_PROVIDER=onchain and configure contract address for production.
 */

import { prisma } from './database';
import { createPublicClient, createWalletClient, http, parseAbi, stringToHex, keccak256, encodePacked } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Contract ABI (minimal subset for escrow operations)
const ESCROW_ABI = parseAbi([
  'function deposit(bytes32 escrowId, bytes32 taskId, uint256 amount) external',
  'function assignWorker(bytes32 escrowId, address worker) external',
  'function accept(bytes32 escrowId) external',
  'function release(bytes32 escrowId) external',
  'function refund(bytes32 escrowId) external',
  'function getEscrowStatus(bytes32 escrowId) external view returns (uint8)',
  'event Deposited(bytes32 indexed escrowId, bytes32 indexed taskId, address indexed requester, uint256 amount)',
  'event Released(bytes32 indexed escrowId, address indexed worker, uint256 amount, uint256 fee)',
  'event Refunded(bytes32 indexed escrowId, address indexed requester, uint256 amount)',
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
      });

      if (!escrow) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      // Platform fee (5%)
      const platformFee = escrow.amount * 0.05;
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
    const chainId = process.env.CHAIN_ID === '8453' ? 'mainnet' : 'sepolia';
    const chain = chainId === 'mainnet' ? base : baseSepolia;
    const rpcUrl = process.env.BASE_RPC_URL || (chainId === 'mainnet'
      ? 'https://mainnet.base.org'
      : 'https://sepolia.base.org');

    this.contractAddress = (process.env.ESCROW_CONTRACT_ADDRESS || '0x0') as `0x${string}`;
    this.usdcAddress = (process.env.USDC_ADDRESS || (chainId === 'mainnet'
      ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base mainnet USDC
      : '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    )) as `0x${string}`;

    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Create wallet client for operator transactions
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

  async releaseToWorker(taskId: string, workerId: string, workerAddress?: string): Promise<EscrowResult> {
    try {
      if (!this.walletClient) {
        return { success: false, error: 'Operator wallet not configured' };
      }

      const escrow = await prisma.escrow.findFirst({
        where: { taskId, status: 'funded' },
      });

      if (!escrow || !escrow.providerRef) {
        return { success: false, error: 'No funded escrow found for task' };
      }

      const escrowIdBytes = escrow.providerRef as `0x${string}`;

      // First assign worker if needed
      if (workerAddress) {
        await this.walletClient.writeContract({
          address: this.contractAddress,
          abi: ESCROW_ABI,
          functionName: 'assignWorker',
          args: [escrowIdBytes, workerAddress as `0x${string}`],
        });
      }

      // Mark as accepted on-chain
      const acceptTxHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ESCROW_ABI,
        functionName: 'accept',
        args: [escrowIdBytes],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: acceptTxHash });

      // Release funds
      const releaseTxHash = await this.walletClient.writeContract({
        address: this.contractAddress,
        abi: ESCROW_ABI,
        functionName: 'release',
        args: [escrowIdBytes],
      });

      // Wait for confirmation
      await this.publicClient.waitForTransactionReceipt({ hash: releaseTxHash });

      // Update database
      const platformFee = escrow.amount * 0.025; // 2.5% on-chain fee
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
