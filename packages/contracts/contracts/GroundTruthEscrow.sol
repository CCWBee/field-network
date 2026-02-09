// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title GroundTruthEscrow
 * @notice Escrow contract for Ground Truth bounty payments on Base
 * @dev Supports USDC deposits, releases, refunds, and disputes
 */
contract GroundTruthEscrow is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    IERC20 public immutable usdc;

    // Platform fee (basis points, e.g., 250 = 2.5%)
    uint256 public platformFeeBps;
    address public feeRecipient;

    // Auto-release delay after acceptance (default 24 hours)
    uint256 public autoReleaseDelay;

    struct Escrow {
        bytes32 taskId;           // Off-chain task ID (UUID as bytes32)
        address requester;        // Who funded the escrow
        address worker;           // Who will receive payment (set on acceptance)
        uint256 amount;           // USDC amount (6 decimals)
        uint256 platformFee;      // Fee amount to be deducted
        EscrowStatus status;
        uint256 createdAt;
        uint256 acceptedAt;       // When submission was accepted
        uint256 releaseAfter;     // Auto-release timestamp
    }

    enum EscrowStatus {
        Pending,      // Created but not funded
        Funded,       // USDC deposited
        Accepted,     // Submission accepted, awaiting release
        Released,     // Payment sent to worker
        Refunded,     // Refunded to requester
        Disputed      // Under dispute resolution
    }

    mapping(bytes32 => Escrow) public escrows;

    // Events matching the spec
    event Deposited(bytes32 indexed escrowId, bytes32 indexed taskId, address indexed requester, uint256 amount);
    event WorkerAssigned(bytes32 indexed escrowId, address indexed worker);
    event Accepted(bytes32 indexed escrowId, uint256 releaseAfter);
    event Released(bytes32 indexed escrowId, address indexed worker, uint256 amount, uint256 fee);
    event Refunded(bytes32 indexed escrowId, address indexed requester, uint256 amount);
    event DisputeOpened(bytes32 indexed escrowId, address indexed opener);
    event DisputeResolved(bytes32 indexed escrowId, address indexed winner, uint256 winnerAmount, uint256 loserAmount);
    event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
    event AutoReleaseDelayUpdated(uint256 oldDelay, uint256 newDelay);

    error InvalidEscrowStatus();
    error EscrowNotFound();
    error UnauthorizedCaller();
    error InvalidAmount();
    error ReleaseNotReady();
    error TransferFailed();
    error WorkerAlreadyAssigned();

    constructor(
        address _usdc,
        address _feeRecipient,
        uint256 _platformFeeBps,
        uint256 _autoReleaseDelay
    ) {
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
        platformFeeBps = _platformFeeBps;
        autoReleaseDelay = _autoReleaseDelay;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(DISPUTE_RESOLVER_ROLE, msg.sender);
    }

    /**
     * @notice Create and fund an escrow for a task
     * @param escrowId Unique escrow identifier
     * @param taskId Off-chain task UUID
     * @param amount USDC amount to escrow
     */
    function deposit(
        bytes32 escrowId,
        bytes32 taskId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert InvalidAmount();
        if (escrows[escrowId].createdAt != 0) revert InvalidEscrowStatus();

        uint256 fee = (amount * platformFeeBps) / 10000;

        escrows[escrowId] = Escrow({
            taskId: taskId,
            requester: msg.sender,
            worker: address(0),
            amount: amount,
            platformFee: fee,
            status: EscrowStatus.Funded,
            createdAt: block.timestamp,
            acceptedAt: 0,
            releaseAfter: 0
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(escrowId, taskId, msg.sender, amount);
    }

    /**
     * @notice Assign worker to escrow (operator-only)
     * @param escrowId Escrow identifier
     * @param worker Worker's wallet address
     */
    function assignWorker(
        bytes32 escrowId,
        address worker
    ) external onlyRole(OPERATOR_ROLE) {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Funded) revert InvalidEscrowStatus();
        if (escrow.worker != address(0)) revert WorkerAlreadyAssigned();

        escrow.worker = worker;
        emit WorkerAssigned(escrowId, worker);
    }

    /**
     * @notice Mark submission as accepted (starts auto-release timer)
     * @dev Only the requester can accept a submission
     * @param escrowId Escrow identifier
     */
    function accept(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Funded) revert InvalidEscrowStatus();
        if (escrow.worker == address(0)) revert UnauthorizedCaller();
        if (msg.sender != escrow.requester) revert UnauthorizedCaller();

        escrow.status = EscrowStatus.Accepted;
        escrow.acceptedAt = block.timestamp;
        escrow.releaseAfter = block.timestamp + autoReleaseDelay;

        emit Accepted(escrowId, escrow.releaseAfter);
    }

    /**
     * @notice Release funds to worker (after auto-release delay or immediately by requester/worker)
     * @param escrowId Escrow identifier
     */
    function release(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Accepted) revert InvalidEscrowStatus();

        // Allow immediate release by requester or worker, or anyone after delay
        bool isRequester = msg.sender == escrow.requester;
        bool isWorker = msg.sender == escrow.worker;
        bool delayPassed = block.timestamp >= escrow.releaseAfter;

        if (!isRequester && !isWorker && !delayPassed) {
            revert ReleaseNotReady();
        }

        escrow.status = EscrowStatus.Released;

        uint256 workerAmount = escrow.amount - escrow.platformFee;

        // Transfer to worker
        usdc.safeTransfer(escrow.worker, workerAmount);

        // Transfer fee to platform
        if (escrow.platformFee > 0) {
            usdc.safeTransfer(feeRecipient, escrow.platformFee);
        }

        emit Released(escrowId, escrow.worker, workerAmount, escrow.platformFee);
    }

    /**
     * @notice Refund escrow to requester (cancellation or rejection)
     * @param escrowId Escrow identifier
     */
    function refund(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();

        // Can refund if Funded (no worker) or if operator/requester requests
        bool isRequester = msg.sender == escrow.requester;
        bool isOperator = hasRole(OPERATOR_ROLE, msg.sender);

        if (escrow.status == EscrowStatus.Funded) {
            // If worker is assigned, only operator can refund (protect in-progress work)
            if (escrow.worker != address(0)) {
                if (!isOperator) revert UnauthorizedCaller();
            } else {
                // No worker assigned - requester or operator can refund
                if (!isRequester && !isOperator) revert UnauthorizedCaller();
            }
        } else {
            revert InvalidEscrowStatus();
        }

        escrow.status = EscrowStatus.Refunded;
        usdc.safeTransfer(escrow.requester, escrow.amount);

        emit Refunded(escrowId, escrow.requester, escrow.amount);
    }

    /**
     * @notice Open a dispute (pauses auto-release)
     * @param escrowId Escrow identifier
     */
    function openDispute(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Accepted) revert InvalidEscrowStatus();

        // Only requester can open dispute
        if (msg.sender != escrow.requester) revert UnauthorizedCaller();

        escrow.status = EscrowStatus.Disputed;
        emit DisputeOpened(escrowId, msg.sender);
    }

    /**
     * @notice Resolve a dispute
     * @param escrowId Escrow identifier
     * @param workerShare Percentage to worker (0-100)
     */
    function resolveDispute(
        bytes32 escrowId,
        uint8 workerShare
    ) external onlyRole(DISPUTE_RESOLVER_ROLE) nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        if (escrow.status != EscrowStatus.Disputed) revert InvalidEscrowStatus();
        if (workerShare > 100) revert InvalidAmount();

        uint256 netAmount = escrow.amount - escrow.platformFee;
        uint256 workerAmount = (netAmount * workerShare) / 100;
        uint256 requesterAmount = netAmount - workerAmount;

        escrow.status = EscrowStatus.Released;

        if (workerAmount > 0) {
            usdc.safeTransfer(escrow.worker, workerAmount);
        }
        if (requesterAmount > 0) {
            usdc.safeTransfer(escrow.requester, requesterAmount);
        }
        if (escrow.platformFee > 0) {
            usdc.safeTransfer(feeRecipient, escrow.platformFee);
        }

        address winner = workerShare >= 50 ? escrow.worker : escrow.requester;
        emit DisputeResolved(escrowId, winner, workerAmount, requesterAmount);
    }

    // Admin functions
    function setPlatformFee(uint256 _platformFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_platformFeeBps <= 1000, "Fee too high"); // Max 10%
        emit PlatformFeeUpdated(platformFeeBps, _platformFeeBps);
        platformFeeBps = _platformFeeBps;
    }

    function setAutoReleaseDelay(uint256 _autoReleaseDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit AutoReleaseDelayUpdated(autoReleaseDelay, _autoReleaseDelay);
        autoReleaseDelay = _autoReleaseDelay;
    }

    function setFeeRecipient(address _feeRecipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // View functions
    function getEscrow(bytes32 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function getEscrowStatus(bytes32 escrowId) external view returns (EscrowStatus) {
        return escrows[escrowId].status;
    }
}
