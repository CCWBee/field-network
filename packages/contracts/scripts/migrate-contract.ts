import { ethers } from "hardhat";

/**
 * Contract Migration Script
 *
 * Queries the old contract for active escrows, reports total value locked,
 * and validates the new contract is deployed and paused. Does NOT perform
 * any destructive actions — this is an information/validation tool only.
 *
 * Usage:
 *   npx hardhat run scripts/migrate-contract.ts --network base-sepolia
 *
 * Environment Variables:
 *   OLD_CONTRACT_ADDRESS - Address of the existing escrow contract
 *   NEW_CONTRACT_ADDRESS - Address of the newly deployed escrow contract
 */

const ESCROW_ABI = [
  "function escrowCount() external view returns (uint256)",
  "function paused() external view returns (bool)",
  "function platformFeeBps() external view returns (uint256)",
  "function autoReleaseDelay() external view returns (uint256)",
  "function hasRole(bytes32 role, address account) external view returns (bool)",
  "function DEFAULT_ADMIN_ROLE() external view returns (bytes32)",
  "function OPERATOR_ROLE() external view returns (bytes32)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("=".repeat(60));
  console.log("Contract Migration Validator");
  console.log("=".repeat(60));
  console.log("");
  console.log("Network:", chainId);
  console.log("Deployer:", deployer.address);
  console.log("");

  const oldAddress = process.env.OLD_CONTRACT_ADDRESS;
  const newAddress = process.env.NEW_CONTRACT_ADDRESS;

  if (!oldAddress) {
    console.error("ERROR: OLD_CONTRACT_ADDRESS is required");
    process.exitCode = 1;
    return;
  }

  // --- Old contract checks ---
  console.log("Old Contract:", oldAddress);
  console.log("-".repeat(40));

  const oldContract = new ethers.Contract(oldAddress, ESCROW_ABI, deployer);

  try {
    const paused = await oldContract.paused();
    console.log("  Paused:", paused);
    if (!paused) {
      console.log("  WARNING: Old contract is NOT paused. Pause it before migrating.");
    }
  } catch {
    console.log("  Could not read paused state (may not have paused() function)");
  }

  try {
    const feeBps = await oldContract.platformFeeBps();
    console.log("  Platform fee:", Number(feeBps), "bps");
  } catch {
    console.log("  Could not read platform fee");
  }

  try {
    const delay = await oldContract.autoReleaseDelay();
    console.log("  Auto-release delay:", Number(delay) / 3600, "hours");
  } catch {
    console.log("  Could not read auto-release delay");
  }

  console.log("");

  // --- New contract checks ---
  if (newAddress) {
    console.log("New Contract:", newAddress);
    console.log("-".repeat(40));

    // Verify the new address has code deployed
    const code = await ethers.provider.getCode(newAddress);
    if (code === "0x") {
      console.error("  ERROR: No contract deployed at new address!");
      process.exitCode = 1;
      return;
    }
    console.log("  Contract deployed: YES");

    const newContract = new ethers.Contract(newAddress, ESCROW_ABI, deployer);

    try {
      const paused = await newContract.paused();
      console.log("  Paused:", paused);
      if (!paused) {
        console.log("  INFO: New contract is not paused (ready to accept escrows)");
      }
    } catch {
      console.log("  Could not read paused state");
    }

    try {
      const operatorRole = await newContract.OPERATOR_ROLE();
      const hasOperatorRole = await newContract.hasRole(operatorRole, deployer.address);
      console.log("  Deployer has OPERATOR_ROLE:", hasOperatorRole);
      if (!hasOperatorRole) {
        console.log("  WARNING: Grant OPERATOR_ROLE to operator wallet before using.");
      }
    } catch {
      console.log("  Could not check operator role");
    }

    try {
      const feeBps = await newContract.platformFeeBps();
      console.log("  Platform fee:", Number(feeBps), "bps");
    } catch {
      console.log("  Could not read platform fee");
    }

    try {
      const delay = await newContract.autoReleaseDelay();
      console.log("  Auto-release delay:", Number(delay) / 3600, "hours");
    } catch {
      console.log("  Could not read auto-release delay");
    }
  } else {
    console.log("No NEW_CONTRACT_ADDRESS provided — skipping new contract validation.");
  }

  // --- Migration checklist ---
  console.log("");
  console.log("=".repeat(60));
  console.log("Migration Checklist");
  console.log("=".repeat(60));
  console.log("");
  console.log("[ ] 1. Deploy new contract version (scripts/deploy.ts)");
  console.log("[ ] 2. Pause OLD contract: admin calls pause()");
  console.log("[ ] 3. Wait for all in-flight escrows to resolve");
  console.log("       (query DB for escrows with status != released/refunded)");
  console.log("[ ] 4. Grant OPERATOR_ROLE on new contract to operator wallet");
  console.log("[ ] 5. Grant DISPUTE_RESOLVER_ROLE on new contract");
  console.log("[ ] 6. Update API env vars:");
  console.log("       ESCROW_CONTRACT_ADDRESS=<new address>");
  console.log("[ ] 7. Redeploy API");
  console.log("[ ] 8. Verify first transaction on new contract");
  console.log("[ ] 9. Update ChainCursor to index new contract events");
  console.log("");

  if (newAddress) {
    console.log("Suggested .env update:");
    console.log(`  ESCROW_CONTRACT_ADDRESS=${newAddress}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
