import { createPublicClient, http, parseAbiItem, Log, decodeEventLog } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { prisma } from './database';

// Escrow contract ABI events
const ESCROW_EVENTS = {
  Deposited: parseAbiItem('event Deposited(bytes32 indexed escrowId, bytes32 indexed taskId, address indexed requester, uint256 amount)'),
  WorkerAssigned: parseAbiItem('event WorkerAssigned(bytes32 indexed escrowId, address indexed worker)'),
  Accepted: parseAbiItem('event Accepted(bytes32 indexed escrowId, uint256 releaseAfter)'),
  Released: parseAbiItem('event Released(bytes32 indexed escrowId, address indexed worker, uint256 amount, uint256 fee)'),
  Refunded: parseAbiItem('event Refunded(bytes32 indexed escrowId, address indexed requester, uint256 amount)'),
  DisputeOpened: parseAbiItem('event DisputeOpened(bytes32 indexed escrowId, address indexed opener)'),
  DisputeResolved: parseAbiItem('event DisputeResolved(bytes32 indexed escrowId, address indexed winner, uint256 winnerAmount, uint256 loserAmount)'),
} as const;

// Full ABI for event decoding
const ESCROW_ABI = [
  ESCROW_EVENTS.Deposited,
  ESCROW_EVENTS.WorkerAssigned,
  ESCROW_EVENTS.Accepted,
  ESCROW_EVENTS.Released,
  ESCROW_EVENTS.Refunded,
  ESCROW_EVENTS.DisputeOpened,
  ESCROW_EVENTS.DisputeResolved,
];

export class ChainIndexer {
  private client;
  private chainId: number;
  private contractAddress: `0x${string}`;
  private pollInterval: number;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(options: {
    chainId: number;
    contractAddress: string;
    rpcUrl?: string;
    pollInterval?: number;
  }) {
    this.chainId = options.chainId;
    this.contractAddress = options.contractAddress as `0x${string}`;
    this.pollInterval = options.pollInterval || 12000; // 12 seconds (Base block time)

    const chain = this.chainId === 8453 ? base : baseSepolia;
    const rpcUrl = options.rpcUrl || (this.chainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

    this.client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[ChainIndexer] Starting indexer for chain ${this.chainId}`);
    console.log(`[ChainIndexer] Contract: ${this.contractAddress}`);

    // Initialize cursor if needed
    await this.initializeCursor();

    // Start polling
    this.poll();
    this.intervalId = setInterval(() => this.poll(), this.pollInterval);
  }

  stop(): void {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log(`[ChainIndexer] Stopped`);
  }

  private async initializeCursor(): Promise<void> {
    const existing = await prisma.chainCursor.findUnique({
      where: { chainId: this.chainId },
    });

    if (!existing) {
      // Start from current block - 1000 (or contract deployment block)
      const currentBlock = await this.client.getBlockNumber();
      const startBlock = Math.max(0, Number(currentBlock) - 1000);

      await prisma.chainCursor.create({
        data: {
          chainId: this.chainId,
          lastBlock: startBlock,
        },
      });

      console.log(`[ChainIndexer] Initialized cursor at block ${startBlock}`);
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const cursor = await prisma.chainCursor.findUnique({
        where: { chainId: this.chainId },
      });

      if (!cursor) return;

      const currentBlock = await this.client.getBlockNumber();
      const fromBlock = BigInt(cursor.lastBlock + 1);
      const toBlock = currentBlock;

      if (fromBlock > toBlock) return;

      console.log(`[ChainIndexer] Fetching logs from ${fromBlock} to ${toBlock}`);

      // Fetch all escrow events
      const logs = await this.client.getLogs({
        address: this.contractAddress,
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        console.log(`[ChainIndexer] Found ${logs.length} events`);
        await this.processLogs(logs);
      }

      // Update cursor
      await prisma.chainCursor.update({
        where: { chainId: this.chainId },
        data: { lastBlock: Number(toBlock) },
      });
    } catch (error) {
      console.error('[ChainIndexer] Poll error:', error);
    }
  }

  private async processLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        // Store raw event
        const existingEvent = await prisma.chainEvent.findUnique({
          where: {
            chainId_txHash_logIndex: {
              chainId: this.chainId,
              txHash: log.transactionHash!,
              logIndex: log.logIndex!,
            },
          },
        });

        if (existingEvent) continue;

        // Decode event
        let decoded;
        let eventName = 'Unknown';
        try {
          decoded = decodeEventLog({
            abi: ESCROW_ABI,
            data: log.data,
            topics: log.topics,
          });
          eventName = decoded.eventName;
        } catch {
          console.warn(`[ChainIndexer] Could not decode event in tx ${log.transactionHash}`);
          continue;
        }

        // Store event
        await prisma.chainEvent.create({
          data: {
            chainId: this.chainId,
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash!,
            logIndex: log.logIndex!,
            contractAddress: log.address,
            eventName,
            eventData: JSON.stringify(decoded.args),
          },
        });

        // Process event
        await this.handleEvent(eventName, decoded.args, log);
      } catch (error) {
        console.error(`[ChainIndexer] Error processing log:`, error);
      }
    }

    // Mark processed events
    await prisma.chainEvent.updateMany({
      where: {
        chainId: this.chainId,
        processed: false,
      },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  }

  private async handleEvent(eventName: string, args: any, log: Log): Promise<void> {
    const escrowIdHex = args.escrowId as string;
    // Convert bytes32 to UUID format if needed (or use as-is for lookup)
    const escrowIdLookup = this.bytes32ToUuid(escrowIdHex);

    switch (eventName) {
      case 'Deposited': {
        const taskIdHex = args.taskId as string;
        const taskId = this.bytes32ToUuid(taskIdHex);
        const requester = (args.requester as string).toLowerCase();
        const amount = Number(args.amount) / 1e6; // USDC has 6 decimals

        // Update or create escrow record
        const escrow = await prisma.escrow.findFirst({
          where: { taskId },
        });

        if (escrow) {
          await prisma.escrow.update({
            where: { id: escrow.id },
            data: {
              status: 'funded',
              depositTxHash: log.transactionHash,
              depositBlock: Number(log.blockNumber),
              requesterWallet: requester,
              fundedAt: new Date(),
            },
          });

          // Create ledger entry
          await prisma.ledgerEntry.create({
            data: {
              taskId,
              entryType: 'fund',
              amount,
              currency: 'USDC',
              direction: 'credit',
              walletAddress: requester,
              txHash: log.transactionHash,
              blockNumber: Number(log.blockNumber),
              chainId: this.chainId,
            },
          });

          console.log(`[ChainIndexer] Deposited: Task ${taskId}, Amount ${amount} USDC`);
        }
        break;
      }

      case 'Released': {
        const worker = (args.worker as string).toLowerCase();
        const amount = Number(args.amount) / 1e6;
        const fee = Number(args.fee) / 1e6;

        // Match by escrowId from event
        let escrow = await prisma.escrow.findFirst({
          where: { id: escrowIdLookup },
        });
        // Fallback: match by providerRef (on-chain escrow ID)
        if (!escrow) {
          escrow = await prisma.escrow.findFirst({
            where: { providerRef: escrowIdHex },
          });
        }
        if (!escrow) {
          console.warn(`[ChainIndexer] Released: No escrow found for escrowId ${escrowIdLookup} (hex: ${escrowIdHex})`);
          break;
        }

        if (escrow) {
          await prisma.escrow.update({
            where: { id: escrow.id },
            data: {
              status: 'released',
              releaseTxHash: log.transactionHash,
              workerWallet: worker,
              releasedAt: new Date(),
            },
          });

          // Create ledger entries
          await prisma.ledgerEntry.createMany({
            data: [
              {
                taskId: escrow.taskId,
                entryType: 'release',
                amount,
                currency: 'USDC',
                direction: 'debit',
                walletAddress: worker,
                txHash: log.transactionHash,
                blockNumber: Number(log.blockNumber),
                chainId: this.chainId,
              },
              {
                taskId: escrow.taskId,
                entryType: 'fee',
                amount: fee,
                currency: 'USDC',
                direction: 'debit',
                txHash: log.transactionHash,
                blockNumber: Number(log.blockNumber),
                chainId: this.chainId,
              },
            ],
          });

          console.log(`[ChainIndexer] Released: ${amount} USDC to ${worker}`);
        }
        break;
      }

      case 'Refunded': {
        const requester = (args.requester as string).toLowerCase();
        const amount = Number(args.amount) / 1e6;

        // Match by escrowId from event
        let escrow = await prisma.escrow.findFirst({
          where: { id: escrowIdLookup },
        });
        if (!escrow) {
          escrow = await prisma.escrow.findFirst({
            where: { providerRef: escrowIdHex },
          });
        }
        if (!escrow) {
          console.warn(`[ChainIndexer] Refunded: No escrow found for escrowId ${escrowIdLookup} (hex: ${escrowIdHex})`);
          break;
        }

        if (escrow) {
          await prisma.escrow.update({
            where: { id: escrow.id },
            data: {
              status: 'refunded',
              refundTxHash: log.transactionHash,
              refundedAt: new Date(),
            },
          });

          await prisma.ledgerEntry.create({
            data: {
              taskId: escrow.taskId,
              entryType: 'refund',
              amount,
              currency: 'USDC',
              direction: 'debit',
              walletAddress: requester,
              txHash: log.transactionHash,
              blockNumber: Number(log.blockNumber),
              chainId: this.chainId,
            },
          });

          console.log(`[ChainIndexer] Refunded: ${amount} USDC to ${requester}`);
        }
        break;
      }

      case 'DisputeOpened': {
        const opener = (args.opener as string).toLowerCase();

        // Match by escrowId from event
        let disputeEscrow = await prisma.escrow.findFirst({
          where: { id: escrowIdLookup },
        });
        if (!disputeEscrow) {
          disputeEscrow = await prisma.escrow.findFirst({
            where: { providerRef: escrowIdHex },
          });
        }

        if (disputeEscrow) {
          await prisma.escrow.update({
            where: { id: disputeEscrow.id },
            data: { status: 'disputed' },
          });
          console.log(`[ChainIndexer] Dispute opened by ${opener} for escrow ${disputeEscrow.id}`);
        } else {
          console.warn(`[ChainIndexer] DisputeOpened: No escrow found for escrowId ${escrowIdLookup}`);
        }
        break;
      }

      case 'DisputeResolved': {
        const winner = (args.winner as string).toLowerCase();
        const winnerAmount = Number(args.winnerAmount) / 1e6;
        const loserAmount = Number(args.loserAmount) / 1e6;

        // Match by escrowId from event
        let resolvedEscrow = await prisma.escrow.findFirst({
          where: { id: escrowIdLookup },
        });
        if (!resolvedEscrow) {
          resolvedEscrow = await prisma.escrow.findFirst({
            where: { providerRef: escrowIdHex },
          });
        }

        if (resolvedEscrow) {
          await prisma.escrow.update({
            where: { id: resolvedEscrow.id },
            data: {
              status: 'released',
              releaseTxHash: log.transactionHash,
              releasedAt: new Date(),
            },
          });

          // Create ledger entries for dispute resolution
          const entries: any[] = [];
          if (winnerAmount > 0) {
            entries.push({
              taskId: resolvedEscrow.taskId,
              entryType: 'dispute_resolution',
              amount: winnerAmount,
              currency: 'USDC',
              direction: 'debit' as const,
              walletAddress: winner,
              txHash: log.transactionHash,
              blockNumber: Number(log.blockNumber),
              chainId: this.chainId,
            });
          }
          if (entries.length > 0) {
            await prisma.ledgerEntry.createMany({ data: entries });
          }

          console.log(`[ChainIndexer] Dispute resolved: ${winner} wins ${winnerAmount} USDC`);
        } else {
          console.warn(`[ChainIndexer] DisputeResolved: No escrow found for escrowId ${escrowIdLookup}`);
        }
        break;
      }
    }
  }

  private bytes32ToUuid(bytes32: string): string {
    // Remove 0x prefix if present
    const hex = bytes32.startsWith('0x') ? bytes32.slice(2) : bytes32;
    // Format as UUID: 8-4-4-4-12
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
}

// Singleton instance
let indexerInstance: ChainIndexer | null = null;

export function getChainIndexer(): ChainIndexer | null {
  return indexerInstance;
}

export function startChainIndexer(options: {
  chainId: number;
  contractAddress: string;
  rpcUrl?: string;
}): ChainIndexer {
  if (indexerInstance) {
    indexerInstance.stop();
  }

  indexerInstance = new ChainIndexer(options);
  indexerInstance.start();
  return indexerInstance;
}

export function stopChainIndexer(): void {
  if (indexerInstance) {
    indexerInstance.stop();
    indexerInstance = null;
  }
}
