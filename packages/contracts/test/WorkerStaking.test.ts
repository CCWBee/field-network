import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { WorkerStaking, MockERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("WorkerStaking", function () {
  // Constants
  const USDC_DECIMALS = 6;
  const ONE_USDC = 10n ** 6n;
  const BOUNTY_AMOUNT = 100n * ONE_USDC; // 100 USDC

  // Stake configuration
  const BASE_STAKE_BPS = 1000n;     // 10%
  const MIN_STAKE_BPS = 500n;       // 5%
  const MAX_STAKE_BPS = 3000n;      // 30%
  const STRIKE_INCREMENT_BPS = 200n; // +2% per strike
  const HIGH_REP_THRESHOLD = 9000n;  // 90%
  const REP_DISCOUNT_BPS = 500n;     // -5% for high-rep
  const PLATFORM_SLASH_SHARE_BPS = 5000n; // 50%
  const STAKE_RELEASE_DELAY = 24n * 60n * 60n; // 24 hours

  // Role hashes
  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const DISPUTE_RESOLVER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("DISPUTE_RESOLVER_ROLE"));
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

  // Helper to generate unique IDs
  let taskCounter = 0;
  function generateTaskId(): string {
    taskCounter++;
    return ethers.keccak256(ethers.toUtf8Bytes(`task-${taskCounter}-${Date.now()}`));
  }

  // Fixture for deploying contracts
  async function deployFixture() {
    const [owner, operator, disputeResolver, worker, worker2, requester, platformRecipient, other] =
      await ethers.getSigners();

    // Deploy MockERC20 as USDC (6 decimals)
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20Factory.deploy("USD Coin", "USDC", USDC_DECIMALS);
    await usdc.waitForDeployment();

    // Deploy WorkerStaking
    const StakingFactory = await ethers.getContractFactory("WorkerStaking");
    const staking = await StakingFactory.deploy(
      await usdc.getAddress(),
      platformRecipient.address,
      BASE_STAKE_BPS,
      MIN_STAKE_BPS,
      MAX_STAKE_BPS
    );
    await staking.waitForDeployment();

    // Grant roles
    await staking.grantRole(OPERATOR_ROLE, operator.address);
    await staking.grantRole(DISPUTE_RESOLVER_ROLE, disputeResolver.address);

    // Mint USDC to workers
    await usdc.mint(worker.address, 10000n * ONE_USDC);
    await usdc.mint(worker2.address, 10000n * ONE_USDC);
    await usdc.mint(requester.address, 10000n * ONE_USDC);

    // Approve staking contract
    await usdc.connect(worker).approve(await staking.getAddress(), ethers.MaxUint256);
    await usdc.connect(worker2).approve(await staking.getAddress(), ethers.MaxUint256);

    // Mint USDC to operator and approve (for stake() which uses msg.sender)
    await usdc.mint(operator.address, 10000n * ONE_USDC);
    await usdc.connect(operator).approve(await staking.getAddress(), ethers.MaxUint256);

    return { staking, usdc, owner, operator, disputeResolver, worker, worker2, requester, platformRecipient, other };
  }

  // Fixture with an active stake (operator creates on behalf of worker)
  async function activeStakeFixture() {
    const base = await loadFixture(deployFixture);
    const taskId = generateTaskId();

    await base.staking.connect(base.operator).stakeFor(
      base.worker.address,
      taskId,
      BOUNTY_AMOUNT,
      0, // no strikes
      5000 // 50% reputation
    );

    return { ...base, taskId };
  }

  // ==================== DEPLOYMENT TESTS ====================
  describe("Deployment", function () {
    it("should set the correct USDC token address", async function () {
      const { staking, usdc } = await loadFixture(deployFixture);
      expect(await staking.usdc()).to.equal(await usdc.getAddress());
    });

    it("should set the correct platform recipient", async function () {
      const { staking, platformRecipient } = await loadFixture(deployFixture);
      expect(await staking.platformRecipient()).to.equal(platformRecipient.address);
    });

    it("should set the correct base stake bps", async function () {
      const { staking } = await loadFixture(deployFixture);
      expect(await staking.baseStakeBps()).to.equal(BASE_STAKE_BPS);
    });

    it("should set the correct min stake bps", async function () {
      const { staking } = await loadFixture(deployFixture);
      expect(await staking.minStakeBps()).to.equal(MIN_STAKE_BPS);
    });

    it("should set the correct max stake bps", async function () {
      const { staking } = await loadFixture(deployFixture);
      expect(await staking.maxStakeBps()).to.equal(MAX_STAKE_BPS);
    });

    it("should set stake release delay to 24 hours", async function () {
      const { staking } = await loadFixture(deployFixture);
      expect(await staking.stakeReleaseDelay()).to.equal(STAKE_RELEASE_DELAY);
    });

    it("should grant DEFAULT_ADMIN_ROLE to deployer", async function () {
      const { staking, owner } = await loadFixture(deployFixture);
      expect(await staking.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });

    it("should grant OPERATOR_ROLE to deployer", async function () {
      const { staking, owner } = await loadFixture(deployFixture);
      expect(await staking.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
    });

    it("should grant DISPUTE_RESOLVER_ROLE to deployer", async function () {
      const { staking, owner } = await loadFixture(deployFixture);
      expect(await staking.hasRole(DISPUTE_RESOLVER_ROLE, owner.address)).to.be.true;
    });

    it("should revert if min > base stake", async function () {
      const { usdc, platformRecipient } = await loadFixture(deployFixture);
      const StakingFactory = await ethers.getContractFactory("WorkerStaking");

      await expect(StakingFactory.deploy(
        await usdc.getAddress(),
        platformRecipient.address,
        1000n, // base
        1500n, // min > base
        3000n  // max
      )).to.be.revertedWith("Min must be <= base");
    });

    it("should revert if base > max stake", async function () {
      const { usdc, platformRecipient } = await loadFixture(deployFixture);
      const StakingFactory = await ethers.getContractFactory("WorkerStaking");

      await expect(StakingFactory.deploy(
        await usdc.getAddress(),
        platformRecipient.address,
        2000n, // base
        500n,  // min
        1500n  // max < base
      )).to.be.revertedWith("Base must be <= max");
    });

    it("should revert if max > 50%", async function () {
      const { usdc, platformRecipient } = await loadFixture(deployFixture);
      const StakingFactory = await ethers.getContractFactory("WorkerStaking");

      await expect(StakingFactory.deploy(
        await usdc.getAddress(),
        platformRecipient.address,
        1000n,
        500n,
        5001n  // > 50%
      )).to.be.revertedWith("Max stake cannot exceed 50%");
    });
  });

  // ==================== STAKE CALCULATION TESTS ====================
  describe("Stake Calculation", function () {
    it("should calculate base stake correctly (no strikes, normal reputation)", async function () {
      const { staking } = await loadFixture(deployFixture);

      const stake = await staking.calculateRequiredStake(BOUNTY_AMOUNT, 0, 5000);
      const expected = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;

      expect(stake).to.equal(expected);
    });

    it("should apply reputation discount for high-rep workers", async function () {
      const { staking } = await loadFixture(deployFixture);

      const stake = await staking.calculateRequiredStake(BOUNTY_AMOUNT, 0, 9500); // 95% reputation
      const discountedBps = BASE_STAKE_BPS - REP_DISCOUNT_BPS;
      const expected = (BOUNTY_AMOUNT * discountedBps) / 10000n;

      expect(stake).to.equal(expected);
    });

    it("should add strike penalty correctly", async function () {
      const { staking } = await loadFixture(deployFixture);

      const strikes = 2n;
      const stake = await staking.calculateRequiredStake(BOUNTY_AMOUNT, strikes, 5000);
      const stakeBps = BASE_STAKE_BPS + (strikes * STRIKE_INCREMENT_BPS);
      const expected = (BOUNTY_AMOUNT * stakeBps) / 10000n;

      expect(stake).to.equal(expected);
    });

    it("should clamp to min stake bps", async function () {
      const { staking } = await loadFixture(deployFixture);

      // High rep with large discount should hit min
      const stake = await staking.calculateRequiredStake(BOUNTY_AMOUNT, 0, 10000);
      const expected = (BOUNTY_AMOUNT * MIN_STAKE_BPS) / 10000n;

      // Should be at least min stake
      expect(stake).to.be.gte(expected);
    });

    it("should clamp to max stake bps", async function () {
      const { staking } = await loadFixture(deployFixture);

      // Many strikes should hit max
      const stakes = 20n;
      const stake = await staking.calculateRequiredStake(BOUNTY_AMOUNT, stakes, 0);
      const expected = (BOUNTY_AMOUNT * MAX_STAKE_BPS) / 10000n;

      expect(stake).to.equal(expected);
    });

    it("should use on-chain strikes with getRequiredStake", async function () {
      const { staking, worker, disputeResolver, requester, taskId } = await loadFixture(activeStakeFixture);

      // Slash to add a strike
      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000);

      // Check strike was recorded
      expect(await staking.workerStrikes(worker.address)).to.equal(1n);

      // getRequiredStake should use on-chain strikes
      const stake = await staking.getRequiredStake(worker.address, BOUNTY_AMOUNT, 5000);
      const stakeBps = BASE_STAKE_BPS + STRIKE_INCREMENT_BPS;
      const expected = (BOUNTY_AMOUNT * stakeBps) / 10000n;

      expect(stake).to.equal(expected);
    });
  });

  // ==================== STAKING TESTS (OPERATOR-ONLY) ====================
  describe("Staking", function () {
    it("should allow operator to create stake", async function () {
      const { staking, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      // stake() is now operator-only, so it uses msg.sender as worker
      // Since operator calls it, the stake is for the operator address
      // For proper usage, stakeFor() should be used instead
      await staking.connect(operator).stake(taskId, BOUNTY_AMOUNT, 0, 5000);

      const stakeData = await staking.getStake(taskId, operator.address);
      expect(stakeData.taskId).to.equal(taskId);
      expect(stakeData.worker).to.equal(operator.address);
      expect(stakeData.bountyAmount).to.equal(BOUNTY_AMOUNT);
      expect(stakeData.status).to.equal(0n); // Active
    });

    it("should revert if non-operator tries to stake", async function () {
      const { staking, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      await expect(staking.connect(worker).stake(taskId, BOUNTY_AMOUNT, 0, 5000))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("should create stake via stakeFor with correct data", async function () {
      const { staking, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      await staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000);

      const stakeData = await staking.getStake(taskId, worker.address);
      expect(stakeData.taskId).to.equal(taskId);
      expect(stakeData.worker).to.equal(worker.address);
      expect(stakeData.bountyAmount).to.equal(BOUNTY_AMOUNT);
      expect(stakeData.status).to.equal(0n); // Active
    });

    it("should calculate and transfer correct stake amount via stakeFor", async function () {
      const { staking, usdc, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      const balanceBefore = await usdc.balanceOf(worker.address);
      await staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000);
      const balanceAfter = await usdc.balanceOf(worker.address);

      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      expect(balanceBefore - balanceAfter).to.equal(expectedStake);
    });

    it("should emit Staked event via stakeFor", async function () {
      const { staking, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();
      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;

      await expect(staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000))
        .to.emit(staking, "Staked")
        .withArgs(
          ethers.keccak256(ethers.solidityPacked(["bytes32", "address"], [taskId, worker.address])),
          taskId,
          worker.address,
          expectedStake,
          BOUNTY_AMOUNT
        );
    });

    it("should revert if stake already exists", async function () {
      const { staking, operator, worker, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000))
        .to.be.revertedWithCustomError(staking, "StakeAlreadyExists");
    });

    it("should revert when contract is paused", async function () {
      const { staking, owner, operator, worker } = await loadFixture(deployFixture);
      await staking.connect(owner).pause();

      const taskId = generateTaskId();
      await expect(staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ==================== STAKE FOR (OPERATOR) TESTS ====================
  describe("Stake For", function () {
    it("should allow operator to stake on behalf of worker", async function () {
      const { staking, usdc, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      const balanceBefore = await usdc.balanceOf(worker.address);
      await staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000);
      const balanceAfter = await usdc.balanceOf(worker.address);

      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      expect(balanceBefore - balanceAfter).to.equal(expectedStake);

      const stakeData = await staking.getStake(taskId, worker.address);
      expect(stakeData.worker).to.equal(worker.address);
    });

    it("should revert if caller is not operator", async function () {
      const { staking, worker, other } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      await expect(staking.connect(other).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== STAKE RELEASE TESTS (PERMISSIONLESS) ====================
  describe("Stake Release (Permissionless)", function () {
    it("should allow worker to release their own stake immediately", async function () {
      const { staking, usdc, worker, taskId } = await loadFixture(activeStakeFixture);

      const balanceBefore = await usdc.balanceOf(worker.address);
      await staking.connect(worker).releaseStake(taskId, worker.address);
      const balanceAfter = await usdc.balanceOf(worker.address);

      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      expect(balanceAfter - balanceBefore).to.equal(expectedStake);
    });

    it("should allow anyone to release stake after delay", async function () {
      const { staking, usdc, worker, other, taskId } = await loadFixture(activeStakeFixture);

      // Fast forward past the delay
      await time.increase(STAKE_RELEASE_DELAY + 1n);

      const balanceBefore = await usdc.balanceOf(worker.address);
      await staking.connect(other).releaseStake(taskId, worker.address);
      const balanceAfter = await usdc.balanceOf(worker.address);

      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      expect(balanceAfter - balanceBefore).to.equal(expectedStake);
    });

    it("should revert if non-worker tries to release before delay", async function () {
      const { staking, worker, other, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(other).releaseStake(taskId, worker.address))
        .to.be.revertedWithCustomError(staking, "StakeNotReady");
    });

    it("should set stake status to Released", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);

      await staking.connect(worker).releaseStake(taskId, worker.address);

      const stakeData = await staking.getStake(taskId, worker.address);
      expect(stakeData.status).to.equal(1n); // Released
    });

    it("should emit StakeReleased event", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);
      const expectedStake = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;

      await expect(staking.connect(worker).releaseStake(taskId, worker.address))
        .to.emit(staking, "StakeReleased")
        .withArgs(
          ethers.keccak256(ethers.solidityPacked(["bytes32", "address"], [taskId, worker.address])),
          worker.address,
          expectedStake
        );
    });

    it("should revert if stake does not exist", async function () {
      const { staking, worker } = await loadFixture(deployFixture);
      const fakeTaskId = generateTaskId();

      await expect(staking.connect(worker).releaseStake(fakeTaskId, worker.address))
        .to.be.revertedWithCustomError(staking, "StakeNotFound");
    });

    it("should revert if stake is not active", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);

      await staking.connect(worker).releaseStake(taskId, worker.address);

      await expect(staking.connect(worker).releaseStake(taskId, worker.address))
        .to.be.revertedWithCustomError(staking, "InvalidStakeStatus");
    });
  });

  // ==================== SLASHING TESTS ====================
  describe("Slashing", function () {
    it("should slash stake and distribute to requester and platform", async function () {
      const { staking, usdc, disputeResolver, worker, requester, platformRecipient, taskId } =
        await loadFixture(activeStakeFixture);

      const stakeAmount = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      const requesterShareBps = 5000n;
      const expectedRequesterAmount = (stakeAmount * requesterShareBps) / 10000n;
      const expectedPlatformAmount = stakeAmount - expectedRequesterAmount;

      const requesterBalanceBefore = await usdc.balanceOf(requester.address);
      const platformBalanceBefore = await usdc.balanceOf(platformRecipient.address);

      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, requesterShareBps);

      const requesterBalanceAfter = await usdc.balanceOf(requester.address);
      const platformBalanceAfter = await usdc.balanceOf(platformRecipient.address);

      expect(requesterBalanceAfter - requesterBalanceBefore).to.equal(expectedRequesterAmount);
      expect(platformBalanceAfter - platformBalanceBefore).to.equal(expectedPlatformAmount);
    });

    it("should increment worker strike count", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      expect(await staking.workerStrikes(worker.address)).to.equal(0n);

      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000);

      expect(await staking.workerStrikes(worker.address)).to.equal(1n);
    });

    it("should emit StakeSlashed and StrikeRecorded events", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      const stakeAmount = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      const stakeId = ethers.keccak256(ethers.solidityPacked(["bytes32", "address"], [taskId, worker.address]));

      await expect(staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000))
        .to.emit(staking, "StakeSlashed")
        .and.to.emit(staking, "StrikeRecorded")
        .withArgs(worker.address, 1n);
    });

    it("should revert if caller is not dispute resolver", async function () {
      const { staking, worker, requester, other, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(other).slashStake(taskId, worker.address, requester.address, 5000))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("should revert if requester share exceeds 100%", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 10001))
        .to.be.revertedWithCustomError(staking, "InvalidPercentage");
    });

    it("should revert if stake does not exist", async function () {
      const { staking, disputeResolver, worker, requester } = await loadFixture(deployFixture);
      const fakeTaskId = generateTaskId();

      await expect(staking.connect(disputeResolver).slashStake(fakeTaskId, worker.address, requester.address, 5000))
        .to.be.revertedWithCustomError(staking, "StakeNotFound");
    });

    it("should revert if stake is not active", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      await staking.connect(worker).releaseStake(taskId, worker.address);

      await expect(staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000))
        .to.be.revertedWithCustomError(staking, "InvalidStakeStatus");
    });
  });

  // ==================== PARTIAL SLASH TESTS ====================
  describe("Partial Slash", function () {
    it("should distribute stake according to percentage split", async function () {
      const { staking, usdc, disputeResolver, worker, requester, platformRecipient, taskId } =
        await loadFixture(activeStakeFixture);

      const stakeAmount = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      const workerReturnBps = 3000n;    // 30%
      const requesterShareBps = 4000n;  // 40%
      // Platform gets remaining 30%

      const expectedWorkerAmount = (stakeAmount * workerReturnBps) / 10000n;
      const expectedRequesterAmount = (stakeAmount * requesterShareBps) / 10000n;
      const expectedPlatformAmount = stakeAmount - expectedWorkerAmount - expectedRequesterAmount;

      const workerBalanceBefore = await usdc.balanceOf(worker.address);
      const requesterBalanceBefore = await usdc.balanceOf(requester.address);
      const platformBalanceBefore = await usdc.balanceOf(platformRecipient.address);

      await staking.connect(disputeResolver).partialSlash(
        taskId, worker.address, requester.address, workerReturnBps, requesterShareBps
      );

      expect(await usdc.balanceOf(worker.address) - workerBalanceBefore).to.equal(expectedWorkerAmount);
      expect(await usdc.balanceOf(requester.address) - requesterBalanceBefore).to.equal(expectedRequesterAmount);
      expect(await usdc.balanceOf(platformRecipient.address) - platformBalanceBefore).to.equal(expectedPlatformAmount);
    });

    it("should revert if percentages exceed 100%", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(disputeResolver).partialSlash(
        taskId, worker.address, requester.address, 6000, 5000
      )).to.be.revertedWithCustomError(staking, "InvalidPercentage");
    });

    it("should revert if caller is not dispute resolver", async function () {
      const { staking, worker, requester, other, taskId } = await loadFixture(activeStakeFixture);

      await expect(staking.connect(other).partialSlash(
        taskId, worker.address, requester.address, 3000, 4000
      )).to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== STRIKE MANAGEMENT TESTS ====================
  describe("Strike Management", function () {
    it("should allow admin to reset strikes", async function () {
      const { staking, owner, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      // Add a strike via slashing
      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000);
      expect(await staking.workerStrikes(worker.address)).to.equal(1n);

      // Admin resets
      await staking.connect(owner).resetStrikes(worker.address);
      expect(await staking.workerStrikes(worker.address)).to.equal(0n);
    });

    it("should revert if non-admin tries to reset strikes", async function () {
      const { staking, worker, other } = await loadFixture(deployFixture);

      await expect(staking.connect(other).resetStrikes(worker.address))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== ACCESS CONTROL TESTS ====================
  describe("Access Control", function () {
    it("should only allow admin to grant roles", async function () {
      const { staking, other, worker } = await loadFixture(deployFixture);

      await expect(staking.connect(other).grantRole(OPERATOR_ROLE, worker.address))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to set base stake bps", async function () {
      const { staking, other } = await loadFixture(deployFixture);

      await expect(staking.connect(other).setBaseStakeBps(1500n))
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });

    it("should only allow admin to pause", async function () {
      const { staking, other } = await loadFixture(deployFixture);

      await expect(staking.connect(other).pause())
        .to.be.revertedWithCustomError(staking, "AccessControlUnauthorizedAccount");
    });
  });

  // ==================== ADMIN CONFIGURATION TESTS ====================
  describe("Admin Configuration", function () {
    it("should update base stake bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);
      const newBase = 1500n;

      await staking.connect(owner).setBaseStakeBps(newBase);

      expect(await staking.baseStakeBps()).to.equal(newBase);
    });

    it("should emit ConfigUpdated event", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await expect(staking.connect(owner).setBaseStakeBps(1500n))
        .to.emit(staking, "ConfigUpdated")
        .withArgs("baseStakeBps", 1500n);
    });

    it("should update min stake bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setMinStakeBps(300n);

      expect(await staking.minStakeBps()).to.equal(300n);
    });

    it("should update max stake bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setMaxStakeBps(4000n);

      expect(await staking.maxStakeBps()).to.equal(4000n);
    });

    it("should update strike increment bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setStrikeIncrementBps(300n);

      expect(await staking.strikeIncrementBps()).to.equal(300n);
    });

    it("should update high reputation threshold", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setHighReputationThreshold(8500n);

      expect(await staking.highReputationThreshold()).to.equal(8500n);
    });

    it("should update reputation discount bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setReputationDiscountBps(400n);

      expect(await staking.reputationDiscountBps()).to.equal(400n);
    });

    it("should update platform recipient", async function () {
      const { staking, owner, other } = await loadFixture(deployFixture);

      await staking.connect(owner).setPlatformRecipient(other.address);

      expect(await staking.platformRecipient()).to.equal(other.address);
    });

    it("should update platform slash share bps", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).setPlatformSlashShareBps(6000n);

      expect(await staking.platformSlashShareBps()).to.equal(6000n);
    });

    it("should pause and unpause", async function () {
      const { staking, owner } = await loadFixture(deployFixture);

      await staking.connect(owner).pause();
      expect(await staking.paused()).to.be.true;

      await staking.connect(owner).unpause();
      expect(await staking.paused()).to.be.false;
    });
  });

  // ==================== VIEW FUNCTIONS TESTS ====================
  describe("View Functions", function () {
    it("getStake should return correct stake data", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);

      const stakeData = await staking.getStake(taskId, worker.address);

      expect(stakeData.taskId).to.equal(taskId);
      expect(stakeData.worker).to.equal(worker.address);
      expect(stakeData.status).to.equal(0n); // Active
    });

    it("getStakeById should return correct stake data", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);
      const stakeId = ethers.keccak256(ethers.solidityPacked(["bytes32", "address"], [taskId, worker.address]));

      const stakeData = await staking.getStakeById(stakeId);

      expect(stakeData.taskId).to.equal(taskId);
      expect(stakeData.worker).to.equal(worker.address);
    });

    it("getWorkerStrikes should return correct strike count", async function () {
      const { staking, disputeResolver, worker, requester, taskId } = await loadFixture(activeStakeFixture);

      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 5000);

      expect(await staking.getWorkerStrikes(worker.address)).to.equal(1n);
    });
  });

  // ==================== EDGE CASES TESTS ====================
  describe("Edge Cases", function () {
    it("should handle zero bounty gracefully", async function () {
      const { staking, operator, worker } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      // Zero bounty would result in zero stake
      await expect(staking.connect(operator).stakeFor(worker.address, taskId, 0n, 0, 5000))
        .to.be.revertedWithCustomError(staking, "InsufficientAmount");
    });

    it("should handle multiple stakes from same worker on different tasks", async function () {
      const { staking, operator, worker } = await loadFixture(deployFixture);
      const taskId1 = generateTaskId();
      const taskId2 = generateTaskId();

      await staking.connect(operator).stakeFor(worker.address, taskId1, BOUNTY_AMOUNT, 0, 5000);
      await staking.connect(operator).stakeFor(worker.address, taskId2, BOUNTY_AMOUNT, 0, 5000);

      const stake1 = await staking.getStake(taskId1, worker.address);
      const stake2 = await staking.getStake(taskId2, worker.address);

      expect(stake1.status).to.equal(0n); // Active
      expect(stake2.status).to.equal(0n); // Active
    });

    it("should handle different workers staking on same task", async function () {
      const { staking, operator, worker, worker2 } = await loadFixture(deployFixture);
      const taskId = generateTaskId();

      await staking.connect(operator).stakeFor(worker.address, taskId, BOUNTY_AMOUNT, 0, 5000);
      await staking.connect(operator).stakeFor(worker2.address, taskId, BOUNTY_AMOUNT, 0, 5000);

      const stake1 = await staking.getStake(taskId, worker.address);
      const stake2 = await staking.getStake(taskId, worker2.address);

      expect(stake1.worker).to.equal(worker.address);
      expect(stake2.worker).to.equal(worker2.address);
    });

    it("should handle 100% to requester slash", async function () {
      const { staking, usdc, disputeResolver, worker, requester, platformRecipient, taskId } =
        await loadFixture(activeStakeFixture);

      const stakeAmount = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      const requesterBalanceBefore = await usdc.balanceOf(requester.address);
      const platformBalanceBefore = await usdc.balanceOf(platformRecipient.address);

      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 10000);

      expect(await usdc.balanceOf(requester.address) - requesterBalanceBefore).to.equal(stakeAmount);
      expect(await usdc.balanceOf(platformRecipient.address) - platformBalanceBefore).to.equal(0n);
    });

    it("should handle 0% to requester slash (all to platform)", async function () {
      const { staking, usdc, disputeResolver, worker, requester, platformRecipient, taskId } =
        await loadFixture(activeStakeFixture);

      const stakeAmount = (BOUNTY_AMOUNT * BASE_STAKE_BPS) / 10000n;
      const requesterBalanceBefore = await usdc.balanceOf(requester.address);
      const platformBalanceBefore = await usdc.balanceOf(platformRecipient.address);

      await staking.connect(disputeResolver).slashStake(taskId, worker.address, requester.address, 0);

      expect(await usdc.balanceOf(requester.address) - requesterBalanceBefore).to.equal(0n);
      expect(await usdc.balanceOf(platformRecipient.address) - platformBalanceBefore).to.equal(stakeAmount);
    });

    it("should prevent double release", async function () {
      const { staking, worker, taskId } = await loadFixture(activeStakeFixture);

      await staking.connect(worker).releaseStake(taskId, worker.address);

      await expect(staking.connect(worker).releaseStake(taskId, worker.address))
        .to.be.revertedWithCustomError(staking, "InvalidStakeStatus");
    });
  });
});
