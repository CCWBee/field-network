import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { GroundTruthEscrow, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("GroundTruthEscrow", function () {
  // Constants
  const PLATFORM_FEE_BPS = 250n; // 2.5%
  const AUTO_RELEASE_DELAY = 24n * 60n * 60n; // 24 hours in seconds
  const USDC_DECIMALS = 6;
  const ONE_USDC = 10n ** 6n; // 1 USDC = 1_000_000
  const BOUNTY_AMOUNT = 100n * ONE_USDC; // 100 USDC

  // Role hashes
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const DISPUTE_RESOLVER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISPUTE_RESOLVER_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  // Helper to generate unique escrow IDs
  let escrowCounter = 0;
  function generateEscrowId(): string {
    escrowCounter++;
    return ethers.keccak256(ethers.toUtf8Bytes(`escrow-${escrowCounter}-${Date.now()}`));
  }

  function generateTaskId(): string {
    return ethers.keccak256(ethers.toUtf8Bytes(`task-${Date.now()}-${Math.random()}`));
  }

  // Fixture for deploying contracts
  async function deployFixture() {
    const [owner, operator, disputeResolver, requester, worker, feeRecipient, other] =
      await ethers.getSigners();

    // Deploy MockERC20 as USDC (6 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", USDC_DECIMALS);
    await usdc.waitForDeployment();

    // Deploy GroundTruthEscrow
    const EscrowFactory = await ethers.getContractFactory("GroundTruthEscrow");
    const escrow = await EscrowFactory.deploy(
      await usdc.getAddress(),
      feeRecipient.address,
      PLATFORM_FEE_BPS,
      AUTO_RELEASE_DELAY
    );
    await escrow.waitForDeployment();

    // Grant roles
    await escrow.grantRole(OPERATOR_ROLE, operator.address);
    await escrow.grantRole(DISPUTE_RESOLVER_ROLE, disputeResolver.address);

    // Mint USDC to requester
    await usdc.mint(requester.address, 10000n * ONE_USDC);

    // Approve escrow contract to spend requester's USDC
    await usdc.connect(requester).approve(await escrow.getAddress(), ethers.MaxUint256);

    return { escrow, usdc, owner, operator, disputeResolver, requester, worker, feeRecipient, other };
  }

  // Fixture with a funded escrow
  async function fundedEscrowFixture() {
    const base = await loadFixture(deployFixture);
    const escrowId = generateEscrowId();
    const taskId = generateTaskId();

    await base.escrow.connect(base.requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);

    return { ...base, escrowId, taskId };
  }

  // Fixture with worker assigned
  async function workerAssignedFixture() {
    const base = await loadFixture(fundedEscrowFixture);
    await base.escrow.connect(base.operator).assignWorker(base.escrowId, base.worker.address);
    return base;
  }

  // Fixture with accepted escrow
  async function acceptedEscrowFixture() {
    const base = await loadFixture(workerAssignedFixture);
    await base.escrow.connect(base.operator).accept(base.escrowId);
    return base;
  }

  // Fixture with disputed escrow
  async function disputedEscrowFixture() {
    const base = await loadFixture(acceptedEscrowFixture);
    await base.escrow.connect(base.requester).openDispute(base.escrowId);
    return base;
  }

  // ==================== DEPLOYMENT TESTS ====================
  describe("Deployment", function () {
    it("should set the correct USDC token address", async function () {
      const { escrow, usdc } = await loadFixture(deployFixture);
      expect(await escrow.usdc()).to.equal(await usdc.getAddress());
    });

    it("should set the correct fee recipient", async function () {
      const { escrow, feeRecipient } = await loadFixture(deployFixture);
      expect(await escrow.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("should set the correct platform fee", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.platformFeeBps()).to.equal(PLATFORM_FEE_BPS);
    });

    it("should set the correct auto-release delay", async function () {
      const { escrow } = await loadFixture(deployFixture);
      expect(await escrow.autoReleaseDelay()).to.equal(AUTO_RELEASE_DELAY);
    });

    it("should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      expect(await escrow.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("should grant OPERATOR_ROLE to deployer", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      expect(await escrow.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
    });

    it("should grant DISPUTE_RESOLVER_ROLE to deployer", async function () {
      const { escrow, owner } = await loadFixture(deployFixture);
      expect(await escrow.hasRole(DISPUTE_RESOLVER_ROLE, owner.address)).to.be.true;
    });
  });

  // ==================== DEPOSIT TESTS ====================
  describe("Deposit", function () {
    it("should create escrow with correct data", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.taskId).to.equal(taskId);
      expect(escrowData.requester).to.equal(requester.address);
      expect(escrowData.worker).to.equal(ethers.ZeroAddress);
      expect(escrowData.amount).to.equal(BOUNTY_AMOUNT);
      expect(escrowData.status).to.equal(1n); // Funded
    });

    it("should calculate platform fee correctly", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);

      const escrowData = await escrow.getEscrow(escrowId);
      const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
      expect(escrowData.platformFee).to.equal(expectedFee);
    });

    it("should transfer USDC from requester to contract", async function () {
      const { escrow, usdc, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      const balanceBefore = await usdc.balanceOf(requester.address);
      await escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);
      const balanceAfter = await usdc.balanceOf(requester.address);

      expect(balanceBefore - balanceAfter).to.equal(BOUNTY_AMOUNT);
      expect(await usdc.balanceOf(await escrow.getAddress())).to.equal(BOUNTY_AMOUNT);
    });

    it("should emit Deposited event", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await expect(escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT))
        .to.emit(escrow, "Deposited")
        .withArgs(escrowId, taskId, requester.address, BOUNTY_AMOUNT);
    });

    it("should revert on zero amount", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await expect(escrow.connect(requester).deposit(escrowId, taskId, 0n))
        .to.be.revertedWithCustomError(escrow, "InvalidAmount");
    });

    it("should revert if escrow ID already exists", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);

      await expect(escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should revert when contract is paused", async function () {
      const { escrow, owner, requester } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();

      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await expect(escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT))
        .to.be.revertedWithCustomError(escrow, "EnforcedPause");
    });
  });

  // ==================== ASSIGN WORKER TESTS ====================
  describe("Assign Worker", function () {
    it("should assign worker to escrow", async function () {
      const { escrow, operator, worker, escrowId } = await loadFixture(fundedEscrowFixture);

      await escrow.connect(operator).assignWorker(escrowId, worker.address);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.worker).to.equal(worker.address);
    });

    it("should emit WorkerAssigned event", async function () {
      const { escrow, operator, worker, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(operator).assignWorker(escrowId, worker.address))
        .to.emit(escrow, "WorkerAssigned")
        .withArgs(escrowId, worker.address);
    });

    it("should revert if caller is not operator", async function () {
      const { escrow, other, worker, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(other).assignWorker(escrowId, worker.address))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should revert if escrow does not exist", async function () {
      const { escrow, operator, worker } = await loadFixture(deployFixture);
      const fakeEscrowId = generateEscrowId();

      await expect(escrow.connect(operator).assignWorker(fakeEscrowId, worker.address))
        .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
    });
  });

  // ==================== ACCEPT TESTS ====================
  describe("Accept", function () {
    it("should set escrow status to Accepted", async function () {
      const { escrow, escrowId } = await loadFixture(workerAssignedFixture);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(2n); // Accepted
    });

    it("should set releaseAfter timestamp", async function () {
      const { escrow, operator, worker, escrowId } = await loadFixture(fundedEscrowFixture);
      await escrow.connect(operator).assignWorker(escrowId, worker.address);

      const tx = await escrow.connect(operator).accept(escrowId);
      const block = await tx.getBlock();
      const expectedReleaseAfter = BigInt(block!.timestamp) + AUTO_RELEASE_DELAY;

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.releaseAfter).to.equal(expectedReleaseAfter);
    });

    it("should emit Accepted event", async function () {
      const { escrow, operator, worker, escrowId } = await loadFixture(fundedEscrowFixture);
      await escrow.connect(operator).assignWorker(escrowId, worker.address);

      await expect(escrow.connect(operator).accept(escrowId))
        .to.emit(escrow, "Accepted");
    });

    it("should revert if caller is not operator", async function () {
      const { escrow, other, escrowId } = await loadFixture(workerAssignedFixture);

      // Reset to funded state for this test
      const base = await loadFixture(fundedEscrowFixture);
      await base.escrow.connect(base.operator).assignWorker(base.escrowId, base.worker.address);

      await expect(base.escrow.connect(other).accept(base.escrowId))
        .to.be.revertedWithCustomError(base.escrow, "AccessControlUnauthorizedAccount");
    });

    it("should revert if worker not assigned", async function () {
      const { escrow, operator, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(operator).accept(escrowId))
        .to.be.revertedWithCustomError(escrow, "UnauthorizedCaller");
    });

    it("should revert if escrow does not exist", async function () {
      const { escrow, operator } = await loadFixture(deployFixture);
      const fakeEscrowId = generateEscrowId();

      await expect(escrow.connect(operator).accept(fakeEscrowId))
        .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
    });
  });

  // ==================== RELEASE TESTS ====================
  describe("Release", function () {
    it("should transfer correct amount to worker (minus fee)", async function () {
      const { escrow, usdc, operator, worker, escrowId } = await loadFixture(acceptedEscrowFixture);

      const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
      const expectedWorkerAmount = BOUNTY_AMOUNT - expectedFee;
      const workerBalanceBefore = await usdc.balanceOf(worker.address);

      await escrow.connect(operator).release(escrowId);

      const workerBalanceAfter = await usdc.balanceOf(worker.address);
      expect(workerBalanceAfter - workerBalanceBefore).to.equal(expectedWorkerAmount);
    });

    it("should transfer platform fee to fee recipient", async function () {
      const { escrow, usdc, operator, feeRecipient, escrowId } = await loadFixture(acceptedEscrowFixture);

      const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
      const feeBalanceBefore = await usdc.balanceOf(feeRecipient.address);

      await escrow.connect(operator).release(escrowId);

      const feeBalanceAfter = await usdc.balanceOf(feeRecipient.address);
      expect(feeBalanceAfter - feeBalanceBefore).to.equal(expectedFee);
    });

    it("should set escrow status to Released", async function () {
      const { escrow, operator, escrowId } = await loadFixture(acceptedEscrowFixture);

      await escrow.connect(operator).release(escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(3n); // Released
    });

    it("should emit Released event with correct amounts", async function () {
      const { escrow, operator, worker, escrowId } = await loadFixture(acceptedEscrowFixture);

      const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
      const expectedWorkerAmount = BOUNTY_AMOUNT - expectedFee;

      await expect(escrow.connect(operator).release(escrowId))
        .to.emit(escrow, "Released")
        .withArgs(escrowId, worker.address, expectedWorkerAmount, expectedFee);
    });

    it("should allow requester to release immediately", async function () {
      const { escrow, usdc, requester, worker, escrowId } = await loadFixture(acceptedEscrowFixture);

      const workerBalanceBefore = await usdc.balanceOf(worker.address);
      await escrow.connect(requester).release(escrowId);
      const workerBalanceAfter = await usdc.balanceOf(worker.address);

      expect(workerBalanceAfter).to.be.greaterThan(workerBalanceBefore);
    });

    it("should allow anyone to release after delay", async function () {
      const { escrow, usdc, other, worker, escrowId } = await loadFixture(acceptedEscrowFixture);

      // Fast forward past the delay
      await time.increase(AUTO_RELEASE_DELAY + 1n);

      const workerBalanceBefore = await usdc.balanceOf(worker.address);
      await escrow.connect(other).release(escrowId);
      const workerBalanceAfter = await usdc.balanceOf(worker.address);

      expect(workerBalanceAfter).to.be.greaterThan(workerBalanceBefore);
    });

    it("should revert if non-authorized caller tries to release before delay", async function () {
      const { escrow, other, escrowId } = await loadFixture(acceptedEscrowFixture);

      await expect(escrow.connect(other).release(escrowId))
        .to.be.revertedWithCustomError(escrow, "ReleaseNotReady");
    });

    it("should revert if escrow not in Accepted status", async function () {
      const { escrow, operator, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(operator).release(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should revert on double release", async function () {
      const { escrow, operator, escrowId } = await loadFixture(acceptedEscrowFixture);

      await escrow.connect(operator).release(escrowId);

      await expect(escrow.connect(operator).release(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should revert if escrow does not exist", async function () {
      const { escrow, operator } = await loadFixture(deployFixture);
      const fakeEscrowId = generateEscrowId();

      await expect(escrow.connect(operator).release(fakeEscrowId))
        .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
    });
  });

  // ==================== REFUND TESTS ====================
  describe("Refund", function () {
    it("should return full amount to requester", async function () {
      const { escrow, usdc, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      const balanceBefore = await usdc.balanceOf(requester.address);
      await escrow.connect(requester).refund(escrowId);
      const balanceAfter = await usdc.balanceOf(requester.address);

      expect(balanceAfter - balanceBefore).to.equal(BOUNTY_AMOUNT);
    });

    it("should set escrow status to Refunded", async function () {
      const { escrow, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      await escrow.connect(requester).refund(escrowId);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.status).to.equal(4n); // Refunded
    });

    it("should emit Refunded event", async function () {
      const { escrow, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(requester).refund(escrowId))
        .to.emit(escrow, "Refunded")
        .withArgs(escrowId, requester.address, BOUNTY_AMOUNT);
    });

    it("should allow operator to refund", async function () {
      const { escrow, usdc, operator, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      const balanceBefore = await usdc.balanceOf(requester.address);
      await escrow.connect(operator).refund(escrowId);
      const balanceAfter = await usdc.balanceOf(requester.address);

      expect(balanceAfter - balanceBefore).to.equal(BOUNTY_AMOUNT);
    });

    it("should revert if caller is not requester or operator", async function () {
      const { escrow, other, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(other).refund(escrowId))
        .to.be.revertedWithCustomError(escrow, "UnauthorizedCaller");
    });

    it("should revert if escrow is not in Funded status", async function () {
      const { escrow, requester, escrowId } = await loadFixture(acceptedEscrowFixture);

      await expect(escrow.connect(requester).refund(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should revert if escrow does not exist", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const fakeEscrowId = generateEscrowId();

      await expect(escrow.connect(requester).refund(fakeEscrowId))
        .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
    });
  });

  // ==================== DISPUTE TESTS ====================
  describe("Disputes", function () {
    describe("openDispute", function () {
      it("should set escrow status to Disputed", async function () {
        const { escrow, requester, escrowId } = await loadFixture(acceptedEscrowFixture);

        await escrow.connect(requester).openDispute(escrowId);

        const escrowData = await escrow.getEscrow(escrowId);
        expect(escrowData.status).to.equal(5n); // Disputed
      });

      it("should emit DisputeOpened event", async function () {
        const { escrow, requester, escrowId } = await loadFixture(acceptedEscrowFixture);

        await expect(escrow.connect(requester).openDispute(escrowId))
          .to.emit(escrow, "DisputeOpened")
          .withArgs(escrowId, requester.address);
      });

      it("should revert if caller is not requester", async function () {
        const { escrow, worker, escrowId } = await loadFixture(acceptedEscrowFixture);

        await expect(escrow.connect(worker).openDispute(escrowId))
          .to.be.revertedWithCustomError(escrow, "UnauthorizedCaller");
      });

      it("should revert if escrow is not in Accepted status", async function () {
        const { escrow, requester, escrowId } = await loadFixture(fundedEscrowFixture);

        await expect(escrow.connect(requester).openDispute(escrowId))
          .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
      });

      it("should revert if escrow does not exist", async function () {
        const { escrow, requester } = await loadFixture(deployFixture);
        const fakeEscrowId = generateEscrowId();

        await expect(escrow.connect(requester).openDispute(fakeEscrowId))
          .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
      });
    });

    describe("resolveDispute", function () {
      it("should split funds according to workerShare (100% to worker)", async function () {
        const { escrow, usdc, disputeResolver, worker, requester, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const netAmount = BOUNTY_AMOUNT - expectedFee;

        const workerBalanceBefore = await usdc.balanceOf(worker.address);
        const requesterBalanceBefore = await usdc.balanceOf(requester.address);

        await escrow.connect(disputeResolver).resolveDispute(escrowId, 100);

        const workerBalanceAfter = await usdc.balanceOf(worker.address);
        const requesterBalanceAfter = await usdc.balanceOf(requester.address);

        expect(workerBalanceAfter - workerBalanceBefore).to.equal(netAmount);
        expect(requesterBalanceAfter - requesterBalanceBefore).to.equal(0n);
      });

      it("should split funds according to workerShare (0% to worker)", async function () {
        const { escrow, usdc, disputeResolver, worker, requester, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const netAmount = BOUNTY_AMOUNT - expectedFee;

        const workerBalanceBefore = await usdc.balanceOf(worker.address);
        const requesterBalanceBefore = await usdc.balanceOf(requester.address);

        await escrow.connect(disputeResolver).resolveDispute(escrowId, 0);

        const workerBalanceAfter = await usdc.balanceOf(worker.address);
        const requesterBalanceAfter = await usdc.balanceOf(requester.address);

        expect(workerBalanceAfter - workerBalanceBefore).to.equal(0n);
        expect(requesterBalanceAfter - requesterBalanceBefore).to.equal(netAmount);
      });

      it("should split funds according to workerShare (50/50 split)", async function () {
        const { escrow, usdc, disputeResolver, worker, requester, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const netAmount = BOUNTY_AMOUNT - expectedFee;
        const halfAmount = netAmount / 2n;

        const workerBalanceBefore = await usdc.balanceOf(worker.address);
        const requesterBalanceBefore = await usdc.balanceOf(requester.address);

        await escrow.connect(disputeResolver).resolveDispute(escrowId, 50);

        const workerBalanceAfter = await usdc.balanceOf(worker.address);
        const requesterBalanceAfter = await usdc.balanceOf(requester.address);

        expect(workerBalanceAfter - workerBalanceBefore).to.equal(halfAmount);
        expect(requesterBalanceAfter - requesterBalanceBefore).to.equal(netAmount - halfAmount);
      });

      it("should transfer platform fee to fee recipient", async function () {
        const { escrow, usdc, disputeResolver, feeRecipient, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const feeBalanceBefore = await usdc.balanceOf(feeRecipient.address);

        await escrow.connect(disputeResolver).resolveDispute(escrowId, 50);

        const feeBalanceAfter = await usdc.balanceOf(feeRecipient.address);
        expect(feeBalanceAfter - feeBalanceBefore).to.equal(expectedFee);
      });

      it("should emit DisputeResolved event with worker as winner (>= 50%)", async function () {
        const { escrow, disputeResolver, worker, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const netAmount = BOUNTY_AMOUNT - expectedFee;
        const workerAmount = (netAmount * 75n) / 100n;
        const requesterAmount = netAmount - workerAmount;

        await expect(escrow.connect(disputeResolver).resolveDispute(escrowId, 75))
          .to.emit(escrow, "DisputeResolved")
          .withArgs(escrowId, worker.address, workerAmount, requesterAmount);
      });

      it("should emit DisputeResolved event with requester as winner (< 50%)", async function () {
        const { escrow, disputeResolver, requester, escrowId } =
          await loadFixture(disputedEscrowFixture);

        const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
        const netAmount = BOUNTY_AMOUNT - expectedFee;
        const workerAmount = (netAmount * 25n) / 100n;
        const requesterAmount = netAmount - workerAmount;

        await expect(escrow.connect(disputeResolver).resolveDispute(escrowId, 25))
          .to.emit(escrow, "DisputeResolved")
          .withArgs(escrowId, requester.address, workerAmount, requesterAmount);
      });

      it("should set escrow status to Released", async function () {
        const { escrow, disputeResolver, escrowId } = await loadFixture(disputedEscrowFixture);

        await escrow.connect(disputeResolver).resolveDispute(escrowId, 50);

        const escrowData = await escrow.getEscrow(escrowId);
        expect(escrowData.status).to.equal(3n); // Released
      });

      it("should revert if caller is not dispute resolver", async function () {
        const { escrow, other, escrowId } = await loadFixture(disputedEscrowFixture);

        await expect(escrow.connect(other).resolveDispute(escrowId, 50))
          .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
      });

      it("should revert if workerShare is greater than 100", async function () {
        const { escrow, disputeResolver, escrowId } = await loadFixture(disputedEscrowFixture);

        await expect(escrow.connect(disputeResolver).resolveDispute(escrowId, 101))
          .to.be.revertedWithCustomError(escrow, "InvalidAmount");
      });

      it("should revert if escrow is not in Disputed status", async function () {
        const { escrow, disputeResolver, escrowId } = await loadFixture(acceptedEscrowFixture);

        await expect(escrow.connect(disputeResolver).resolveDispute(escrowId, 50))
          .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
      });

      it("should revert if escrow does not exist", async function () {
        const { escrow, disputeResolver } = await loadFixture(deployFixture);
        const fakeEscrowId = generateEscrowId();

        await expect(escrow.connect(disputeResolver).resolveDispute(fakeEscrowId, 50))
          .to.be.revertedWithCustomError(escrow, "EscrowNotFound");
      });
    });
  });

  // ==================== ACCESS CONTROL TESTS ====================
  describe("Access Control", function () {
    it("should only allow admin to grant roles", async function () {
      const { escrow, other, worker } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).grantRole(OPERATOR_ROLE, worker.address))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to revoke roles", async function () {
      const { escrow, other, operator } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).revokeRole(OPERATOR_ROLE, operator.address))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to set platform fee", async function () {
      const { escrow, other } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).setPlatformFee(500n))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to set auto-release delay", async function () {
      const { escrow, other } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).setAutoReleaseDelay(48n * 60n * 60n))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to set fee recipient", async function () {
      const { escrow, other, worker } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).setFeeRecipient(worker.address))
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to pause", async function () {
      const { escrow, other } = await loadFixture(deployFixture);

      await expect(escrow.connect(other).pause())
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to unpause", async function () {
      const { escrow, owner, other } = await loadFixture(deployFixture);
      await escrow.connect(owner).pause();

      await expect(escrow.connect(other).unpause())
        .to.be.revertedWithCustomError(escrow, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== ADMIN FUNCTIONS TESTS ====================
  describe("Admin Functions", function () {
    describe("setPlatformFee", function () {
      it("should update platform fee", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);
        const newFee = 500n; // 5%

        await escrow.connect(owner).setPlatformFee(newFee);

        expect(await escrow.platformFeeBps()).to.equal(newFee);
      });

      it("should emit PlatformFeeUpdated event", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);
        const newFee = 500n;

        await expect(escrow.connect(owner).setPlatformFee(newFee))
          .to.emit(escrow, "PlatformFeeUpdated")
          .withArgs(PLATFORM_FEE_BPS, newFee);
      });

      it("should revert if fee exceeds 10%", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);

        await expect(escrow.connect(owner).setPlatformFee(1001n))
          .to.be.revertedWith("Fee too high");
      });

      it("should allow fee of exactly 10%", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);

        await escrow.connect(owner).setPlatformFee(1000n);
        expect(await escrow.platformFeeBps()).to.equal(1000n);
      });

      it("should allow fee of 0%", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);

        await escrow.connect(owner).setPlatformFee(0n);
        expect(await escrow.platformFeeBps()).to.equal(0n);
      });
    });

    describe("setAutoReleaseDelay", function () {
      it("should update auto-release delay", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);
        const newDelay = 48n * 60n * 60n; // 48 hours

        await escrow.connect(owner).setAutoReleaseDelay(newDelay);

        expect(await escrow.autoReleaseDelay()).to.equal(newDelay);
      });

      it("should emit AutoReleaseDelayUpdated event", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);
        const newDelay = 48n * 60n * 60n;

        await expect(escrow.connect(owner).setAutoReleaseDelay(newDelay))
          .to.emit(escrow, "AutoReleaseDelayUpdated")
          .withArgs(AUTO_RELEASE_DELAY, newDelay);
      });
    });

    describe("setFeeRecipient", function () {
      it("should update fee recipient", async function () {
        const { escrow, owner, other } = await loadFixture(deployFixture);

        await escrow.connect(owner).setFeeRecipient(other.address);

        expect(await escrow.feeRecipient()).to.equal(other.address);
      });
    });

    describe("pause/unpause", function () {
      it("should pause the contract", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);

        await escrow.connect(owner).pause();

        expect(await escrow.paused()).to.be.true;
      });

      it("should unpause the contract", async function () {
        const { escrow, owner } = await loadFixture(deployFixture);

        await escrow.connect(owner).pause();
        await escrow.connect(owner).unpause();

        expect(await escrow.paused()).to.be.false;
      });

      it("should prevent deposits when paused", async function () {
        const { escrow, owner, requester } = await loadFixture(deployFixture);
        await escrow.connect(owner).pause();

        const escrowId = generateEscrowId();
        const taskId = generateTaskId();

        await expect(escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT))
          .to.be.revertedWithCustomError(escrow, "EnforcedPause");
      });
    });
  });

  // ==================== EDGE CASES TESTS ====================
  describe("Edge Cases", function () {
    it("should handle minimum deposit amount", async function () {
      const { escrow, usdc, requester } = await loadFixture(deployFixture);
      const minAmount = 1n; // 0.000001 USDC
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, minAmount);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.amount).to.equal(minAmount);
    });

    it("should handle large deposit amounts", async function () {
      const { escrow, usdc, requester } = await loadFixture(deployFixture);
      const largeAmount = 1_000_000n * ONE_USDC; // 1 million USDC

      // Mint more USDC
      await usdc.mint(requester.address, largeAmount);

      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, largeAmount);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.amount).to.equal(largeAmount);
    });

    it("should correctly handle fee calculation with small amounts", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      const smallAmount = 40n; // 0.00004 USDC - fee would be 1 (2.5% of 40)
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, smallAmount);

      const escrowData = await escrow.getEscrow(escrowId);
      const expectedFee = (smallAmount * PLATFORM_FEE_BPS) / 10000n;
      expect(escrowData.platformFee).to.equal(expectedFee);
    });

    it("should handle zero fee when amount is too small", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);
      // With 2.5% fee: 39 * 250 / 10000 = 0 (integer division)
      const tinyAmount = 39n;
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();

      await escrow.connect(requester).deposit(escrowId, taskId, tinyAmount);

      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.platformFee).to.equal(0n);
    });

    it("should prevent double refund", async function () {
      const { escrow, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      await escrow.connect(requester).refund(escrowId);

      await expect(escrow.connect(requester).refund(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should prevent double dispute resolution", async function () {
      const { escrow, disputeResolver, escrowId } = await loadFixture(disputedEscrowFixture);

      await escrow.connect(disputeResolver).resolveDispute(escrowId, 50);

      await expect(escrow.connect(disputeResolver).resolveDispute(escrowId, 50))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should not allow releasing a refunded escrow", async function () {
      const { escrow, operator, worker, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      // Refund the escrow
      await escrow.connect(requester).refund(escrowId);

      // Create new funded escrow, assign worker and accept
      const newEscrowId = generateEscrowId();
      const newTaskId = generateTaskId();
      await escrow.connect(requester).deposit(newEscrowId, newTaskId, BOUNTY_AMOUNT);

      // Try to release the refunded escrow
      await expect(escrow.connect(operator).release(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should not allow opening dispute on non-accepted escrow", async function () {
      const { escrow, requester, escrowId } = await loadFixture(fundedEscrowFixture);

      await expect(escrow.connect(requester).openDispute(escrowId))
        .to.be.revertedWithCustomError(escrow, "InvalidEscrowStatus");
    });

    it("should handle dispute with 0% worker share", async function () {
      const { escrow, usdc, disputeResolver, worker, requester, feeRecipient, escrowId } =
        await loadFixture(disputedEscrowFixture);

      const expectedFee = (BOUNTY_AMOUNT * PLATFORM_FEE_BPS) / 10000n;
      const netAmount = BOUNTY_AMOUNT - expectedFee;

      const workerBalanceBefore = await usdc.balanceOf(worker.address);
      const requesterBalanceBefore = await usdc.balanceOf(requester.address);
      const feeBalanceBefore = await usdc.balanceOf(feeRecipient.address);

      await escrow.connect(disputeResolver).resolveDispute(escrowId, 0);

      expect(await usdc.balanceOf(worker.address) - workerBalanceBefore).to.equal(0n);
      expect(await usdc.balanceOf(requester.address) - requesterBalanceBefore).to.equal(netAmount);
      expect(await usdc.balanceOf(feeRecipient.address) - feeBalanceBefore).to.equal(expectedFee);
    });

    it("should return correct escrow status for non-existent escrow", async function () {
      const { escrow } = await loadFixture(deployFixture);
      const fakeEscrowId = generateEscrowId();

      // Non-existent escrows return status 0 (Pending)
      const status = await escrow.getEscrowStatus(fakeEscrowId);
      expect(status).to.equal(0n);
    });

    it("should allow multiple escrows from same requester", async function () {
      const { escrow, requester } = await loadFixture(deployFixture);

      const escrowId1 = generateEscrowId();
      const escrowId2 = generateEscrowId();
      const taskId1 = generateTaskId();
      const taskId2 = generateTaskId();

      await escrow.connect(requester).deposit(escrowId1, taskId1, BOUNTY_AMOUNT);
      await escrow.connect(requester).deposit(escrowId2, taskId2, BOUNTY_AMOUNT);

      const escrowData1 = await escrow.getEscrow(escrowId1);
      const escrowData2 = await escrow.getEscrow(escrowId2);

      expect(escrowData1.requester).to.equal(requester.address);
      expect(escrowData2.requester).to.equal(requester.address);
      expect(escrowData1.taskId).to.not.equal(escrowData2.taskId);
    });

    it("should work with 0% platform fee", async function () {
      const { escrow, usdc, owner, operator, worker, requester, feeRecipient } =
        await loadFixture(deployFixture);

      // Set fee to 0
      await escrow.connect(owner).setPlatformFee(0n);

      // Create and fund escrow
      const escrowId = generateEscrowId();
      const taskId = generateTaskId();
      await escrow.connect(requester).deposit(escrowId, taskId, BOUNTY_AMOUNT);

      // Verify no fee calculated
      const escrowData = await escrow.getEscrow(escrowId);
      expect(escrowData.platformFee).to.equal(0n);

      // Complete the flow
      await escrow.connect(operator).assignWorker(escrowId, worker.address);
      await escrow.connect(operator).accept(escrowId);

      const workerBalanceBefore = await usdc.balanceOf(worker.address);
      const feeBalanceBefore = await usdc.balanceOf(feeRecipient.address);

      await escrow.connect(operator).release(escrowId);

      // Worker gets full amount
      expect(await usdc.balanceOf(worker.address) - workerBalanceBefore).to.equal(BOUNTY_AMOUNT);
      // Fee recipient gets nothing
      expect(await usdc.balanceOf(feeRecipient.address) - feeBalanceBefore).to.equal(0n);
    });
  });

  // ==================== VIEW FUNCTIONS TESTS ====================
  describe("View Functions", function () {
    it("getEscrow should return correct escrow data", async function () {
      const { escrow, requester, escrowId, taskId } = await loadFixture(fundedEscrowFixture);

      const escrowData = await escrow.getEscrow(escrowId);

      expect(escrowData.taskId).to.equal(taskId);
      expect(escrowData.requester).to.equal(requester.address);
      expect(escrowData.status).to.equal(1n); // Funded
    });

    it("getEscrowStatus should return correct status", async function () {
      const { escrow, escrowId } = await loadFixture(fundedEscrowFixture);

      expect(await escrow.getEscrowStatus(escrowId)).to.equal(1n); // Funded
    });

    it("should return different statuses throughout lifecycle", async function () {
      const { escrow, operator, requester, worker, escrowId } =
        await loadFixture(fundedEscrowFixture);

      // Funded
      expect(await escrow.getEscrowStatus(escrowId)).to.equal(1n);

      // Assign worker (still Funded)
      await escrow.connect(operator).assignWorker(escrowId, worker.address);
      expect(await escrow.getEscrowStatus(escrowId)).to.equal(1n);

      // Accept -> Accepted
      await escrow.connect(operator).accept(escrowId);
      expect(await escrow.getEscrowStatus(escrowId)).to.equal(2n);

      // Open dispute -> Disputed
      await escrow.connect(requester).openDispute(escrowId);
      expect(await escrow.getEscrowStatus(escrowId)).to.equal(5n);
    });
  });
});
