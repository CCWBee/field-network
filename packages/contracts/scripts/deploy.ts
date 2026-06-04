import { ethers } from "hardhat";

/**
 * FieldNetworkEscrow Deployment Script
 *
 * Supports:
 * - Local (Hardhat): Deploys mock USDC
 * - Base Sepolia: Uses test USDC
 * - Base Mainnet: Uses real USDC
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network base-sepolia
 *   npx hardhat run scripts/deploy.ts --network base
 *
 * Environment Variables:
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment
 *   FEE_RECIPIENT - Address to receive platform fees (optional, defaults to deployer)
 *   PLATFORM_FEE_BPS - Platform fee in basis points (optional, defaults to 250 = 2.5%)
 *   AUTO_RELEASE_HOURS - Auto-release delay in hours (optional, defaults to 24)
 *   MULTISIG_ADDRESS - REQUIRED for live deployments. Receives DEFAULT_ADMIN_ROLE
 *                      and DISPUTE_RESOLVER_ROLE; deployer renounces admin.
 *                      Without this, the deployer EOA retains godmode over the
 *                      contract. Pass a Safe (Gnosis) multisig address.
 *   OPERATOR_WALLET - Address granted OPERATOR_ROLE (the API's hot wallet).
 *                     Defaults to deployer if unset (local dev only).
 *   ALLOW_DEPLOYER_ADMIN - Set to "true" to skip the multisig handoff for
 *                          local testing. Required to be unset/false on live nets.
 *   DRY_RUN - Set to "true" to estimate gas without deploying
 */

// USDC contract addresses by chain ID
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet (official USDC)
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (test USDC)
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
  console.log("FieldNetworkEscrow Deployment");
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
    console.log("Make sure you have completed:");
    console.log("  1. Testnet soak test (7 days)");
    console.log("  2. Security audit review");
    console.log("  3. Deployment checklist");
    console.log("");

    if (!isDryRun) {
      // Add 5 second delay for mainnet
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
      usdcAddress = "0x0000000000000000000000000000000000000001"; // Placeholder
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
  const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || "250");
  const autoReleaseHours = parseInt(process.env.AUTO_RELEASE_HOURS || "24");
  const autoReleaseDelay = autoReleaseHours * 60 * 60;
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;

  // Validate configuration
  if (platformFeeBps > 1000) {
    console.error("\nERROR: Platform fee cannot exceed 10% (1000 bps)");
    process.exitCode = 1;
    return;
  }

  if (autoReleaseHours < 1 || autoReleaseHours > 168) {
    console.error("\nERROR: Auto-release delay must be between 1 and 168 hours");
    process.exitCode = 1;
    return;
  }

  console.log("\nConfiguration:");
  console.log("-".repeat(40));
  console.log("USDC Address:", usdcAddress);
  console.log("Fee Recipient:", feeRecipient);
  console.log("Platform Fee:", platformFeeBps / 100, "% (" + platformFeeBps + " bps)");
  console.log("Auto-Release Delay:", autoReleaseHours, "hours");
  console.log("");

  // Estimate gas
  console.log("Estimating deployment gas...");
  const Escrow = await ethers.getContractFactory("FieldNetworkEscrow");
  const deployTx = await Escrow.getDeployTransaction(
    usdcAddress,
    feeRecipient,
    platformFeeBps,
    autoReleaseDelay
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

  // Check if deployer has enough balance
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
  console.log("Deploying FieldNetworkEscrow...");
  const escrow = await Escrow.deploy(
    usdcAddress,
    feeRecipient,
    platformFeeBps,
    autoReleaseDelay
  );

  console.log("Transaction hash:", escrow.deploymentTransaction()?.hash);
  console.log("Waiting for confirmation...");

  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();

  console.log("");
  console.log("=".repeat(60));
  console.log("DEPLOYMENT SUCCESSFUL");
  console.log("=".repeat(60));
  console.log("");
  console.log("Contract Address:", escrowAddress);
  console.log("");
  console.log("Add to your .env file:");
  console.log(`  ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
  console.log(`  CHAIN_ID=${chainId}`);
  console.log("");

  // Verify on explorer if not local
  if (chainId !== 31337) {
    const networkFlag = chainId === 8453 ? "base" : "base-sepolia";
    console.log("To verify on Basescan, run:");
    console.log("");
    console.log(`  npx hardhat verify --network ${networkFlag} \\`);
    console.log(`    ${escrowAddress} \\`);
    console.log(`    "${usdcAddress}" \\`);
    console.log(`    "${feeRecipient}" \\`);
    console.log(`    "${platformFeeBps}" \\`);
    console.log(`    "${autoReleaseDelay}"`);
    console.log("");
    console.log("Or run the verify script:");
    console.log(`  npx hardhat run scripts/verify.ts --network ${networkFlag}`);
  }

  // Role handoff: transfer admin to multisig, grant operator role, then renounce
  // the deployer's admin role. This eliminates the centralisation risk of the
  // deployer EOA retaining godmode after deployment.
  const isLiveNetwork = chainId !== 31337;
  const allowDeployerAdmin = process.env.ALLOW_DEPLOYER_ADMIN === "true";
  const multisigAddress = process.env.MULTISIG_ADDRESS;
  const operatorWallet = process.env.OPERATOR_WALLET || deployer.address;

  if (isLiveNetwork && !multisigAddress && !allowDeployerAdmin) {
    console.error("");
    console.error("ERROR: MULTISIG_ADDRESS is required for live deployments.");
    console.error("Set MULTISIG_ADDRESS=<safe-address> to hand admin to a multisig,");
    console.error("or set ALLOW_DEPLOYER_ADMIN=true to explicitly accept deployer-as-admin.");
    console.error("");
    console.error("Without a multisig handoff, the deployer EOA can:");
    console.error("  - drain the contract via self-opened disputes");
    console.error("  - pause it indefinitely");
    console.error("  - replace the fee recipient");
    process.exitCode = 1;
    return;
  }

  if (multisigAddress) {
    console.log("");
    console.log("Role handoff:");
    console.log("-".repeat(40));
    console.log("Multisig admin:", multisigAddress);
    console.log("Operator wallet:", operatorWallet);

    const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
    const operatorRole = await escrow.OPERATOR_ROLE();
    const resolverRole = await escrow.DISPUTE_RESOLVER_ROLE();

    console.log("Granting DEFAULT_ADMIN_ROLE to multisig...");
    await (await escrow.grantRole(adminRole, multisigAddress)).wait();

    console.log("Granting DISPUTE_RESOLVER_ROLE to multisig...");
    await (await escrow.grantRole(resolverRole, multisigAddress)).wait();

    if (operatorWallet !== deployer.address) {
      console.log("Granting OPERATOR_ROLE to operator wallet...");
      await (await escrow.grantRole(operatorRole, operatorWallet)).wait();
    }

    console.log("Renouncing deployer roles...");
    await (await escrow.renounceRole(resolverRole, deployer.address)).wait();
    if (operatorWallet !== deployer.address) {
      await (await escrow.renounceRole(operatorRole, deployer.address)).wait();
    }
    // Renounce admin LAST so we can still grant other roles above.
    await (await escrow.renounceRole(adminRole, deployer.address)).wait();

    // Read back to confirm
    const deployerStillAdmin = await escrow.hasRole(adminRole, deployer.address);
    const multisigIsAdmin = await escrow.hasRole(adminRole, multisigAddress);
    console.log("");
    console.log("Post-handoff state:");
    console.log("  Deployer admin:", deployerStillAdmin, "(want false)");
    console.log("  Multisig admin:", multisigIsAdmin, "(want true)");
    if (deployerStillAdmin || !multisigIsAdmin) {
      console.error("ERROR: Role handoff did not produce the expected state. Investigate before using this contract.");
      process.exitCode = 1;
      return;
    }
  }

  // Post-deployment checklist
  console.log("");
  console.log("Post-Deployment Checklist:");
  console.log("-".repeat(40));
  console.log("[ ] Verify contract on Basescan");
  if (!multisigAddress) {
    console.log("[ ] DEPLOYER STILL HAS ADMIN — handoff to multisig before mainnet use");
  }
  console.log("[ ] Update API environment variables");
  console.log("[ ] Test deposit/release flow");
  console.log("[ ] Monitor first few transactions");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
