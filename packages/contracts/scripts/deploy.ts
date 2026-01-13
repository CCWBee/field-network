import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Base USDC addresses
  const USDC_ADDRESSES: Record<number, string> = {
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
    84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia (test USDC)
    31337: "0x0000000000000000000000000000000000000000", // Local - will deploy mock
  };

  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  console.log("Chain ID:", chainId);

  let usdcAddress = USDC_ADDRESSES[chainId];

  // Deploy mock USDC for local testing
  if (chainId === 31337 || !usdcAddress) {
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
    await mockUSDC.waitForDeployment();
    usdcAddress = await mockUSDC.getAddress();
    console.log("Mock USDC deployed to:", usdcAddress);
  }

  // Platform fee: 2.5% (250 basis points)
  const platformFeeBps = 250;

  // Auto-release delay: 24 hours
  const autoReleaseDelay = 24 * 60 * 60;

  // Fee recipient (deployer for now)
  const feeRecipient = deployer.address;

  console.log("Deploying GroundTruthEscrow...");
  const Escrow = await ethers.getContractFactory("GroundTruthEscrow");
  const escrow = await Escrow.deploy(
    usdcAddress,
    feeRecipient,
    platformFeeBps,
    autoReleaseDelay
  );
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("GroundTruthEscrow deployed to:", escrowAddress);

  console.log("\nDeployment summary:");
  console.log("-------------------");
  console.log("USDC:", usdcAddress);
  console.log("Escrow:", escrowAddress);
  console.log("Platform fee:", platformFeeBps / 100, "%");
  console.log("Auto-release delay:", autoReleaseDelay / 3600, "hours");
  console.log("Fee recipient:", feeRecipient);

  // Verify on explorer if not local
  if (chainId !== 31337) {
    console.log("\nTo verify on Basescan, run:");
    console.log(
      `npx hardhat verify --network ${chainId === 8453 ? "base" : "base-sepolia"} ${escrowAddress} ${usdcAddress} ${feeRecipient} ${platformFeeBps} ${autoReleaseDelay}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
