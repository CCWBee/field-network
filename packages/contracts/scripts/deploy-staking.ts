import { ethers } from "hardhat";

/**
 * WorkerStaking Deployment Script
 *
 * Deploys the WorkerStaking contract for Field Network.
 *
 * Supports:
 * - Local (Hardhat): Deploys with mock USDC
 * - Base Sepolia: Uses test USDC
 * - Base Mainnet: Uses real USDC
 *
 * Usage:
 *   npx hardhat run scripts/deploy-staking.ts --network base-sepolia
 *   npx hardhat run scripts/deploy-staking.ts --network base
 *
 * Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   PLATFORM_RECIPIENT - Address to receive slashed stakes (optional, defaults to deployer)
 *   BASE_STAKE_BPS - Base stake percentage in basis points (optional, defaults to 1500 = 15%)
 *   MIN_STAKE_BPS - Minimum stake for high-rep workers (optional, defaults to 500 = 5%)
 *   MAX_STAKE_BPS - Maximum stake for repeat offenders (optional, defaults to 3000 = 30%)
 *   DRY_RUN - Set to "true" to estimate gas without deploying
 */

// USDC contract addresses by chain ID
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
  31337: "0x0000000000000000000000000000000000000000", // Local - will deploy mock
};

// Network names for logging
const NETWORK_NAMES: Record<number, string> = {
  8453: "Base Mainnet",
  84532: "Base Sepolia (Testnet)",
  31337: "Hardhat Local",
};

async function main() {
  const isDryRun = process.env.DRY_RUN === "true";
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("WorkerStaking Deployment");
  console.log("=".repeat(60));
  console.log("");
  console.log("Deployer address:", deployer.address);

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkName = NETWORK_NAMES[chainId] || `Unknown (${chainId})`;

  console.log("Network:", networkName);
  console.log("Chain ID:", chainId);

  // Check deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceEth = ethers.formatEther(balance);
  console.log("Deployer balance:", balanceEth, "ETH");

  if (balance === 0n) {
    console.error("\nERROR: Deployer has no ETH for gas!");
    process.exitCode = 1;
    return;
  }

  // Warn if mainnet deployment
  if (chainId === 8453) {
    console.log("");
    console.log("*** MAINNET DEPLOYMENT ***");
    console.log("This will deploy to Base Mainnet with REAL funds.");
    console.log("");

    if (!isDryRun) {
      console.log("Waiting 5 seconds... (Ctrl+C to cancel)");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Determine USDC address
  let usdcAddress = USDC_ADDRESSES[chainId];

  // Deploy mock USDC for local testing
  if (chainId === 31337 || !usdcAddress) {
    if (isDryRun) {
      console.log("\n[DRY RUN] Would deploy MockERC20 for local testing");
      usdcAddress = "0x0000000000000000000000000000000000000001";
    } else {
      console.log("\nDeploying MockERC20 for local testing...");
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
      await mockUSDC.waitForDeployment();
      usdcAddress = await mockUSDC.getAddress();
      console.log("Mock USDC deployed to:", usdcAddress);
    }
  }

  // Configuration
  const baseStakeBps = parseInt(process.env.BASE_STAKE_BPS || "1500"); // 15%
  const minStakeBps = parseInt(process.env.MIN_STAKE_BPS || "500");    // 5%
  const maxStakeBps = parseInt(process.env.MAX_STAKE_BPS || "3000");   // 30%
  const platformRecipient = process.env.PLATFORM_RECIPIENT || deployer.address;

  // Validate configuration
  if (minStakeBps > baseStakeBps) {
    console.error("\nERROR: Min stake must be <= base stake");
    process.exitCode = 1;
    return;
  }

  if (baseStakeBps > maxStakeBps) {
    console.error("\nERROR: Base stake must be <= max stake");
    process.exitCode = 1;
    return;
  }

  if (maxStakeBps > 5000) {
    console.error("\nERROR: Max stake cannot exceed 50% (5000 bps)");
    process.exitCode = 1;
    return;
  }

  console.log("\nConfiguration:");
  console.log("-".repeat(40));
  console.log("USDC Address:", usdcAddress);
  console.log("Platform Recipient:", platformRecipient);
  console.log("Base Stake:", baseStakeBps / 100, "% (" + baseStakeBps + " bps)");
  console.log("Min Stake:", minStakeBps / 100, "% (" + minStakeBps + " bps)");
  console.log("Max Stake:", maxStakeBps / 100, "% (" + maxStakeBps + " bps)");
  console.log("");

  // Estimate gas
  console.log("Estimating deployment gas...");
  const Staking = await ethers.getContractFactory("WorkerStaking");
  const deployTx = await Staking.getDeployTransaction(
    usdcAddress,
    platformRecipient,
    baseStakeBps,
    minStakeBps,
    maxStakeBps
  );

  const gasEstimate = await ethers.provider.estimateGas({
    ...deployTx,
    from: deployer.address,
  });

  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice || 0n;
  const maxFeePerGas = feeData.maxFeePerGas || gasPrice;
  const estimatedCost = gasEstimate * maxFeePerGas;

  console.log("\nGas Estimation:");
  console.log("-".repeat(40));
  console.log("Estimated gas:", gasEstimate.toString());
  console.log("Gas price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");
  console.log("Max fee per gas:", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("Estimated cost:", ethers.formatEther(estimatedCost), "ETH");
  console.log("");

  // Check balance
  if (balance < estimatedCost) {
    console.error("ERROR: Insufficient balance for deployment!");
    console.error("  Required:", ethers.formatEther(estimatedCost), "ETH");
    console.error("  Available:", balanceEth, "ETH");
    process.exitCode = 1;
    return;
  }

  if (isDryRun) {
    console.log("[DRY RUN] Deployment simulation complete. No contracts deployed.");
    console.log("");
    console.log("To deploy for real, remove DRY_RUN=true and run again.");
    return;
  }

  // Deploy
  console.log("Deploying WorkerStaking...");
  const staking = await Staking.deploy(
    usdcAddress,
    platformRecipient,
    baseStakeBps,
    minStakeBps,
    maxStakeBps
  );

  console.log("Transaction hash:", staking.deploymentTransaction()?.hash);
  console.log("Waiting for confirmation...");

  await staking.waitForDeployment();

  const stakingAddress = await staking.getAddress();

  console.log("");
  console.log("=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(60));
  console.log("");
  console.log("Contract Address:", stakingAddress);
  console.log("");
  console.log("Add to your .env file:");
  console.log(`  STAKING_CONTRACT_ADDRESS=${stakingAddress}`);
  console.log(`  CHAIN_ID=${chainId}`);
  console.log("");

  // Verify on explorer if not local
  if (chainId !== 31337) {
    const networkFlag = chainId === 8453 ? "base" : "base-sepolia";
    console.log("To verify on Basescan, run:");
    console.log("");
    console.log(`  npx hardhat verify --network ${networkFlag} \\`);
    console.log(`    ${stakingAddress} \\`);
    console.log(`    "${usdcAddress}" \\`);
    console.log(`    "${platformRecipient}" \\`);
    console.log(`    "${baseStakeBps}" \\`);
    console.log(`    "${minStakeBps}" \\`);
    console.log(`    "${maxStakeBps}"`);
    console.log("");
  }

  // Post-deployment checklist
  console.log("");
  console.log("Post-Deployment Checklist:");
  console.log("-".repeat(40));
  console.log("[ ] Verify contract on Basescan");
  console.log("[ ] Grant OPERATOR_ROLE to API operator wallet");
  console.log("[ ] Grant DISPUTE_RESOLVER_ROLE to dispute resolver address");
  console.log("[ ] Update API environment variables");
  console.log("[ ] Test stake/release/slash flow");
  console.log("[ ] Monitor first few transactions");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
