import { run, ethers } from "hardhat";

/**
 * Contract Verification Script
 *
 * Verifies the GroundTruthEscrow contract on Basescan.
 *
 * Usage:
 *   npx hardhat run scripts/verify.ts --network base-sepolia
 *   npx hardhat run scripts/verify.ts --network base
 *
 * Environment Variables:
 *   ESCROW_CONTRACT_ADDRESS - Deployed contract address (required)
 *   BASESCAN_API_KEY - Basescan API key (required)
 *   FEE_RECIPIENT - Fee recipient address used in deployment
 *   PLATFORM_FEE_BPS - Platform fee in basis points (default: 250)
 *   AUTO_RELEASE_HOURS - Auto-release delay in hours (default: 24)
 */

// USDC contract addresses by chain ID
const USDC_ADDRESSES: Record<number, string> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

async function main() {
  const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;

  if (!contractAddress) {
    console.error("ERROR: ESCROW_CONTRACT_ADDRESS environment variable is required");
    console.error("  Set it to the deployed contract address you want to verify");
    process.exitCode = 1;
    return;
  }

  if (!process.env.BASESCAN_API_KEY) {
    console.error("ERROR: BASESCAN_API_KEY environment variable is required");
    console.error("  Get one from: https://basescan.org/apis");
    process.exitCode = 1;
    return;
  }

  // Get network info
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("=".repeat(60));
  console.log("Contract Verification");
  console.log("=".repeat(60));
  console.log("");
  console.log("Contract Address:", contractAddress);
  console.log("Chain ID:", chainId);

  // Determine USDC address
  const usdcAddress = USDC_ADDRESSES[chainId];
  if (!usdcAddress) {
    console.error(`ERROR: No USDC address configured for chain ID ${chainId}`);
    process.exitCode = 1;
    return;
  }

  // Get constructor arguments (must match deployment)
  const [deployer] = await ethers.getSigners();
  const feeRecipient = process.env.FEE_RECIPIENT || deployer.address;
  const platformFeeBps = parseInt(process.env.PLATFORM_FEE_BPS || "250");
  const autoReleaseHours = parseInt(process.env.AUTO_RELEASE_HOURS || "24");
  const autoReleaseDelay = autoReleaseHours * 60 * 60;

  console.log("");
  console.log("Constructor Arguments:");
  console.log("-".repeat(40));
  console.log("1. USDC Address:", usdcAddress);
  console.log("2. Fee Recipient:", feeRecipient);
  console.log("3. Platform Fee (bps):", platformFeeBps);
  console.log("4. Auto-Release Delay (s):", autoReleaseDelay);
  console.log("");

  // Verify the contract exists
  const code = await ethers.provider.getCode(contractAddress);
  if (code === "0x") {
    console.error("ERROR: No contract found at address", contractAddress);
    console.error("  Make sure the contract is deployed and the address is correct");
    process.exitCode = 1;
    return;
  }

  console.log("Contract bytecode found. Starting verification...");
  console.log("");

  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: [
        usdcAddress,
        feeRecipient,
        platformFeeBps,
        autoReleaseDelay,
      ],
    });

    console.log("");
    console.log("=".repeat(60));
    console.log("VERIFICATION SUCCESSFUL");
    console.log("=".repeat(60));
    console.log("");

    const explorerUrl = chainId === 8453
      ? `https://basescan.org/address/${contractAddress}#code`
      : `https://sepolia.basescan.org/address/${contractAddress}#code`;

    console.log("View verified contract:");
    console.log("  ", explorerUrl);
    console.log("");

  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Already Verified")) {
      console.log("");
      console.log("Contract is already verified!");

      const explorerUrl = chainId === 8453
        ? `https://basescan.org/address/${contractAddress}#code`
        : `https://sepolia.basescan.org/address/${contractAddress}#code`;

      console.log("View contract:");
      console.log("  ", explorerUrl);

    } else if (error instanceof Error && error.message.includes("does not have bytecode")) {
      console.error("");
      console.error("ERROR: Contract not found at the specified address.");
      console.error("  Make sure ESCROW_CONTRACT_ADDRESS is correct.");
      process.exitCode = 1;

    } else if (error instanceof Error && error.message.includes("constructor arguments")) {
      console.error("");
      console.error("ERROR: Constructor arguments do not match.");
      console.error("  Make sure FEE_RECIPIENT, PLATFORM_FEE_BPS, and AUTO_RELEASE_HOURS");
      console.error("  match the values used during deployment.");
      console.error("");
      console.error("If you used different values, set them as environment variables:");
      console.error("  FEE_RECIPIENT=0x... PLATFORM_FEE_BPS=250 AUTO_RELEASE_HOURS=24");
      process.exitCode = 1;

    } else {
      console.error("");
      console.error("Verification failed:");
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
