# Testnet Deployment Guide

This document describes the process for deploying and testing the GroundTruthEscrow contract on Base Sepolia testnet.

## Prerequisites

### Environment Setup
```bash
# Required environment variables
export DEPLOYER_PRIVATE_KEY="0x..."  # Testnet deployer wallet
export BASESCAN_API_KEY="..."        # For contract verification
export BASE_SEPOLIA_RPC="https://sepolia.base.org"
```

### Wallet Requirements
- Deployer wallet with at least 0.1 ETH on Base Sepolia
- Get testnet ETH from: https://www.base.org/faucet

### Test USDC
Base Sepolia test USDC address: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

To get test USDC:
1. Visit Sepolia USDC faucet (Circle provides test tokens)
2. Or deploy MockERC20 contract for unlimited test tokens

---

## Deployment Steps

### Step 1: Compile Contracts

```bash
cd packages/contracts
npm run compile

# Verify compilation
ls artifacts/contracts/GroundTruthEscrow.sol/
```

### Step 2: Run Local Tests

```bash
npm test

# Expected output:
# GroundTruthEscrow
#   Deployment
#     [pass] Should deploy with correct parameters
#   Deposits
#     [pass] Should allow deposits
#     [pass] Should reject zero amount deposits
#   Releases
#     [pass] Should release to worker after acceptance
#   ...
```

### Step 3: Deploy to Testnet

```bash
npx hardhat run scripts/deploy.ts --network base-sepolia

# Expected output:
# Deploying contracts with account: 0x...
# Chain ID: 84532
# Deploying GroundTruthEscrow...
# GroundTruthEscrow deployed to: 0x...
#
# Deployment summary:
# -------------------
# USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
# Escrow: 0x...
# Platform fee: 2.5%
# Auto-release delay: 24 hours
# Fee recipient: 0x...
```

**Record the deployed address** in `.env.staging`:
```
ESCROW_CONTRACT_ADDRESS=0x...deployed_address...
```

### Step 4: Verify Contract

```bash
npx hardhat verify --network base-sepolia \
  0x...deployed_address... \
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" \
  "0x...fee_recipient..." \
  "250" \
  "86400"
```

Verify on Basescan: https://sepolia.basescan.org/address/0x...

---

## Soak Test Procedure

The soak test validates contract behavior over an extended period (7 days) with realistic transaction patterns.

### Soak Test Goals
1. Validate all escrow state transitions
2. Test edge cases under realistic timing
3. Verify gas consumption patterns
4. Test auto-release mechanism
5. Test dispute resolution flow
6. Monitor for unexpected reverts

### Automated Soak Test Script

Create file `scripts/soak-test.ts`:

```typescript
/**
 * Soak Test Script
 *
 * Runs automated transactions against testnet contract for 7 days.
 * Execute with: npx ts-node scripts/soak-test.ts
 */

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS!;
const RPC_URL = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
const SOAK_DURATION_HOURS = 168; // 7 days

const ESCROW_ABI = [
  'function deposit(bytes32 escrowId, bytes32 taskId, uint256 amount) external',
  'function assignWorker(bytes32 escrowId, address worker) external',
  'function accept(bytes32 escrowId) external',
  'function release(bytes32 escrowId) external',
  'function refund(bytes32 escrowId) external',
  'function getEscrow(bytes32 escrowId) external view returns (tuple(bytes32,address,address,uint256,uint256,uint8,uint256,uint256,uint256))',
];

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

interface SoakTestStats {
  depositsAttempted: number;
  depositsSucceeded: number;
  releasesAttempted: number;
  releasesSucceeded: number;
  refundsAttempted: number;
  refundsSucceeded: number;
  disputesAttempted: number;
  disputesResolved: number;
  errors: string[];
  startTime: Date;
}

async function runSoakTest() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
  const escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, wallet);
  const usdc = new ethers.Contract(
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    USDC_ABI,
    wallet
  );

  const stats: SoakTestStats = {
    depositsAttempted: 0,
    depositsSucceeded: 0,
    releasesAttempted: 0,
    releasesSucceeded: 0,
    refundsAttempted: 0,
    refundsSucceeded: 0,
    disputesAttempted: 0,
    disputesResolved: 0,
    errors: [],
    startTime: new Date(),
  };

  console.log('Starting soak test...');
  console.log(`Contract: ${ESCROW_ADDRESS}`);
  console.log(`Duration: ${SOAK_DURATION_HOURS} hours`);
  console.log(`Wallet: ${wallet.address}`);

  // Check USDC balance
  const balance = await usdc.balanceOf(wallet.address);
  console.log(`USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);

  if (balance < ethers.parseUnits('100', 6)) {
    console.error('Insufficient USDC for soak test. Need at least 100 USDC.');
    return;
  }

  // Approve USDC spending
  console.log('Approving USDC...');
  const approveTx = await usdc.approve(ESCROW_ADDRESS, ethers.MaxUint256);
  await approveTx.wait();
  console.log('USDC approved');

  const endTime = Date.now() + SOAK_DURATION_HOURS * 60 * 60 * 1000;
  let cycleCount = 0;

  while (Date.now() < endTime) {
    cycleCount++;
    console.log(`\n--- Cycle ${cycleCount} ---`);

    try {
      // Test 1: Standard deposit -> accept -> release flow
      await testStandardFlow(escrow, wallet, stats);

      // Test 2: Deposit -> refund flow (every 5th cycle)
      if (cycleCount % 5 === 0) {
        await testRefundFlow(escrow, wallet, stats);
      }

      // Test 3: Edge case - minimum amount
      if (cycleCount % 10 === 0) {
        await testMinimumAmount(escrow, wallet, stats);
      }

      // Log progress
      console.log(`Stats: ${JSON.stringify({
        deposits: `${stats.depositsSucceeded}/${stats.depositsAttempted}`,
        releases: `${stats.releasesSucceeded}/${stats.releasesAttempted}`,
        refunds: `${stats.refundsSucceeded}/${stats.refundsAttempted}`,
        errors: stats.errors.length,
      })}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.errors.push(`Cycle ${cycleCount}: ${message}`);
      console.error(`Cycle ${cycleCount} error:`, message);
    }

    // Wait between cycles (random 30-60 minutes)
    const waitMinutes = 30 + Math.random() * 30;
    console.log(`Waiting ${waitMinutes.toFixed(0)} minutes until next cycle...`);
    await sleep(waitMinutes * 60 * 1000);
  }

  // Final report
  console.log('\n=== SOAK TEST COMPLETE ===');
  console.log(`Duration: ${SOAK_DURATION_HOURS} hours`);
  console.log(`Cycles completed: ${cycleCount}`);
  console.log(`Deposits: ${stats.depositsSucceeded}/${stats.depositsAttempted}`);
  console.log(`Releases: ${stats.releasesSucceeded}/${stats.releasesAttempted}`);
  console.log(`Refunds: ${stats.refundsSucceeded}/${stats.refundsAttempted}`);
  console.log(`Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors encountered:');
    stats.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  // Success criteria
  const successRate =
    (stats.depositsSucceeded + stats.releasesSucceeded + stats.refundsSucceeded) /
    (stats.depositsAttempted + stats.releasesAttempted + stats.refundsAttempted);

  if (successRate >= 0.99 && stats.errors.length < 5) {
    console.log('\n[PASS] Soak test passed!');
    process.exit(0);
  } else {
    console.log('\n[FAIL] Soak test failed!');
    process.exit(1);
  }
}

async function testStandardFlow(
  escrow: ethers.Contract,
  wallet: ethers.Wallet,
  stats: SoakTestStats
) {
  const escrowId = ethers.keccak256(ethers.toUtf8Bytes(`test-${Date.now()}`));
  const taskId = ethers.keccak256(ethers.toUtf8Bytes(`task-${Date.now()}`));
  const amount = ethers.parseUnits('1', 6); // 1 USDC

  // Deposit
  stats.depositsAttempted++;
  console.log('Depositing...');
  const depositTx = await escrow.deposit(escrowId, taskId, amount);
  await depositTx.wait();
  stats.depositsSucceeded++;
  console.log('Deposit successful');

  // Assign worker (self for testing)
  console.log('Assigning worker...');
  const assignTx = await escrow.assignWorker(escrowId, wallet.address);
  await assignTx.wait();
  console.log('Worker assigned');

  // Accept
  console.log('Accepting...');
  const acceptTx = await escrow.accept(escrowId);
  await acceptTx.wait();
  console.log('Accepted');

  // Release
  stats.releasesAttempted++;
  console.log('Releasing...');
  const releaseTx = await escrow.release(escrowId);
  await releaseTx.wait();
  stats.releasesSucceeded++;
  console.log('Released');
}

async function testRefundFlow(
  escrow: ethers.Contract,
  wallet: ethers.Wallet,
  stats: SoakTestStats
) {
  const escrowId = ethers.keccak256(ethers.toUtf8Bytes(`refund-${Date.now()}`));
  const taskId = ethers.keccak256(ethers.toUtf8Bytes(`task-refund-${Date.now()}`));
  const amount = ethers.parseUnits('1', 6);

  // Deposit
  stats.depositsAttempted++;
  console.log('Depositing for refund test...');
  const depositTx = await escrow.deposit(escrowId, taskId, amount);
  await depositTx.wait();
  stats.depositsSucceeded++;

  // Refund (no worker assigned)
  stats.refundsAttempted++;
  console.log('Refunding...');
  const refundTx = await escrow.refund(escrowId);
  await refundTx.wait();
  stats.refundsSucceeded++;
  console.log('Refunded');
}

async function testMinimumAmount(
  escrow: ethers.Contract,
  wallet: ethers.Wallet,
  stats: SoakTestStats
) {
  const escrowId = ethers.keccak256(ethers.toUtf8Bytes(`min-${Date.now()}`));
  const taskId = ethers.keccak256(ethers.toUtf8Bytes(`task-min-${Date.now()}`));
  const amount = ethers.parseUnits('0.01', 6); // 0.01 USDC (minimum)

  stats.depositsAttempted++;
  console.log('Testing minimum amount...');
  const depositTx = await escrow.deposit(escrowId, taskId, amount);
  await depositTx.wait();
  stats.depositsSucceeded++;
  console.log('Minimum amount deposit successful');

  // Refund it back
  stats.refundsAttempted++;
  const refundTx = await escrow.refund(escrowId);
  await refundTx.wait();
  stats.refundsSucceeded++;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

runSoakTest().catch(console.error);
```

### Running the Soak Test

```bash
# Start soak test (runs for 7 days)
cd packages/contracts
npx ts-node scripts/soak-test.ts

# Or run in background with logging
nohup npx ts-node scripts/soak-test.ts > soak-test.log 2>&1 &
```

### Monitoring During Soak Test

1. **Transaction Monitor**: Check Basescan for wallet activity
2. **Log Review**: `tail -f soak-test.log`
3. **Balance Check**: Ensure ETH for gas and USDC for deposits

---

## Success Criteria

The testnet deployment and soak test pass if:

- [ ] Contract deploys successfully
- [ ] Contract verifies on Basescan
- [ ] All unit tests pass before deployment
- [ ] 7-day soak test completes with >99% success rate
- [ ] No unexpected reverts or errors
- [ ] Gas consumption within expected ranges
- [ ] Auto-release timer works correctly
- [ ] All escrow states transition correctly

---

## Post-Soak Test Review

After the soak test completes:

1. **Export transaction history** from Basescan
2. **Analyze gas usage** patterns
3. **Review any errors** and determine root causes
4. **Document findings** in deployment ticket
5. **Get sign-off** before mainnet deployment

---

## Troubleshooting

### "Insufficient ETH for gas"
- Fund deployer wallet from Base Sepolia faucet
- Check gas price: `npx hardhat run --network base-sepolia scripts/check-gas.ts`

### "USDC transfer failed"
- Ensure USDC approval is set
- Check USDC balance
- Verify USDC contract address is correct

### "Invalid escrow status"
- Check escrow state before operation
- Ensure proper sequence: deposit -> assign -> accept -> release

### "Transaction underpriced"
- Increase gas price in hardhat.config.ts
- Wait for network congestion to clear
