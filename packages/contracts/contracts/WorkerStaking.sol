// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title WorkerStaking
 * @notice Staking contract for Field Network workers
 * @dev Workers stake a percentage of bounty when claiming tasks.
 *      - Good submission: stake returned + bounty paid
 *      - Rejected (no dispute): stake returned (benefit of doubt)
 *      - Dispute lost: stake slashed (goes to requester or platform)
 *      - High-reputation workers get reduced stake requirements
 *      - Repeat offenders have increased stake requirements
 */
contract WorkerStaking is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant DISPUTE_RESOLVER_ROLE = keccak256("DISPUTE_RESOLVER_ROLE");

    IERC20 public immutable usdc;

    // Base stake percentage in basis points (1000 = 10%, 2000 = 20%)
    uint256 public baseStakeBps;

    // Minimum stake percentage (for high-reputation workers)
    uint256 public minStakeBps;

    // Maximum stake percentage (for repeat offenders)
    uint256 public maxStakeBps;

    // Strike increment: additional stake per strike (in basis points)
    uint256 public strikeIncrementBps;

    // Reputation threshold for reduced stake (0-100 scaled to 0-10000)
    uint256 public highReputationThreshold;

    // Reputation discount: reduction for high-rep workers (in basis points off base)
    uint256 public reputationDiscountBps;

    // Platform fee recipient for slashed stakes
    address public platformRecipient;

    // Platform share of slashed stakes (basis points, e.g., 5000 = 50%)
    uint256 public platformSlashShareBps;

    // Time delay before anyone can release a stake (worker can release immediately)
    uint256 public stakeReleaseDelay;

    struct Stake {
        bytes32 taskId;         // Off-chain task ID
        address worker;         // Worker who staked
        uint256 amount;         // USDC amount staked (6 decimals)
        uint256 bountyAmount;   // Task bounty for reference
        StakeStatus status;
        uint256 createdAt;
        uint256 releasedAt;
    }

    enum StakeStatus {
        Active,       // Stake is held
        Released,     // Returned to worker (success or rejection)
        Slashed       // Slashed (dispute loss)
    }

    // Mapping from stakeId (keccak256 of taskId + worker) to Stake
    mapping(bytes32 => Stake) public stakes;

    // Track worker strike counts on-chain (can also be passed from off-chain)
    mapping(address => uint256) public workerStrikes;

    // Events
    event Staked(
        bytes32 indexed stakeId,
        bytes32 indexed taskId,
        address indexed worker,
        uint256 amount,
        uint256 bountyAmount
    );
    event StakeReleased(
        bytes32 indexed stakeId,
        address indexed worker,
        uint256 amount
    );
    event StakeSlashed(
        bytes32 indexed stakeId,
        address indexed worker,
        uint256 workerAmount,
        uint256 requesterAmount,
        uint256 platformAmount,
        address requester
    );
    event StrikeRecorded(address indexed worker, uint256 newStrikeCount);
    event ConfigUpdated(string param, uint256 value);

    // Errors
    error StakeNotFound();
    error InvalidStakeStatus();
    error InsufficientAmount();
    error UnauthorizedCaller();
    error StakeAlreadyExists();
    error InvalidPercentage();
    error StakeNotReady();

    constructor(
        address _usdc,
        address _platformRecipient,
        uint256 _baseStakeBps,
        uint256 _minStakeBps,
        uint256 _maxStakeBps
    ) {
        require(_minStakeBps <= _baseStakeBps, "Min must be <= base");
        require(_baseStakeBps <= _maxStakeBps, "Base must be <= max");
        require(_maxStakeBps <= 5000, "Max stake cannot exceed 50%");

        usdc = IERC20(_usdc);
        platformRecipient = _platformRecipient;
        baseStakeBps = _baseStakeBps;
        minStakeBps = _minStakeBps;
        maxStakeBps = _maxStakeBps;

        // Defaults
        strikeIncrementBps = 200;        // +2% per strike
        highReputationThreshold = 9000;  // 90 out of 100 (scaled)
        reputationDiscountBps = 500;     // -5% for high-rep workers
        platformSlashShareBps = 5000;    // 50% of slash goes to platform
        stakeReleaseDelay = 24 hours;    // 24 hour delay for non-worker release

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(DISPUTE_RESOLVER_ROLE, msg.sender);
    }

    /**
     * @notice Calculate required stake amount for a worker
     * @param bountyAmount The task bounty in USDC (6 decimals)
     * @param strikeCount Worker's strike count (from off-chain or on-chain)
     * @param reputationScore Worker's reputation score (0-10000, where 10000 = 100%)
     * @return requiredStake The amount the worker must stake
     */
    function calculateRequiredStake(
        uint256 bountyAmount,
        uint256 strikeCount,
        uint256 reputationScore
    ) public view returns (uint256 requiredStake) {
        // Start with base stake
        uint256 stakeBps = baseStakeBps;

        // Add strike penalty
        uint256 strikePenalty = strikeCount * strikeIncrementBps;
        stakeBps += strikePenalty;

        // Apply reputation discount for high-rep workers
        if (reputationScore >= highReputationThreshold) {
            if (stakeBps > reputationDiscountBps) {
                stakeBps -= reputationDiscountBps;
            } else {
                stakeBps = minStakeBps;
            }
        }

        // Clamp to min/max
        if (stakeBps < minStakeBps) {
            stakeBps = minStakeBps;
        }
        if (stakeBps > maxStakeBps) {
            stakeBps = maxStakeBps;
        }

        requiredStake = (bountyAmount * stakeBps) / 10000;
    }

    /**
     * @notice Calculate required stake using on-chain strike count
     * @param worker Worker address
     * @param bountyAmount Task bounty
     * @param reputationScore Reputation score (0-10000)
     */
    function getRequiredStake(
        address worker,
        uint256 bountyAmount,
        uint256 reputationScore
    ) external view returns (uint256) {
        return calculateRequiredStake(bountyAmount, workerStrikes[worker], reputationScore);
    }

    /**
     * @notice Worker stakes USDC when claiming a task
     * @param taskId Off-chain task UUID as bytes32
     * @param bountyAmount Task bounty for calculating minimum stake
     * @param strikeCount Worker's strike count (passed from off-chain)
     * @param reputationScore Worker's reputation (0-10000)
     */
    function stake(
        bytes32 taskId,
        uint256 bountyAmount,
        uint256 strikeCount,
        uint256 reputationScore
    ) external nonReentrant whenNotPaused {
        bytes32 stakeId = keccak256(abi.encodePacked(taskId, msg.sender));

        if (stakes[stakeId].createdAt != 0) {
            revert StakeAlreadyExists();
        }

        uint256 requiredAmount = calculateRequiredStake(bountyAmount, strikeCount, reputationScore);
        if (requiredAmount == 0) {
            revert InsufficientAmount();
        }

        stakes[stakeId] = Stake({
            taskId: taskId,
            worker: msg.sender,
            amount: requiredAmount,
            bountyAmount: bountyAmount,
            status: StakeStatus.Active,
            createdAt: block.timestamp,
            releasedAt: 0
        });

        usdc.safeTransferFrom(msg.sender, address(this), requiredAmount);

        emit Staked(stakeId, taskId, msg.sender, requiredAmount, bountyAmount);
    }

    /**
     * @notice Operator stakes on behalf of worker (for gasless UX)
     * @dev Worker must have pre-approved this contract for USDC
     */
    function stakeFor(
        address worker,
        bytes32 taskId,
        uint256 bountyAmount,
        uint256 strikeCount,
        uint256 reputationScore
    ) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        bytes32 stakeId = keccak256(abi.encodePacked(taskId, worker));

        if (stakes[stakeId].createdAt != 0) {
            revert StakeAlreadyExists();
        }

        uint256 requiredAmount = calculateRequiredStake(bountyAmount, strikeCount, reputationScore);
        if (requiredAmount == 0) {
            revert InsufficientAmount();
        }

        stakes[stakeId] = Stake({
            taskId: taskId,
            worker: worker,
            amount: requiredAmount,
            bountyAmount: bountyAmount,
            status: StakeStatus.Active,
            createdAt: block.timestamp,
            releasedAt: 0
        });

        usdc.safeTransferFrom(worker, address(this), requiredAmount);

        emit Staked(stakeId, taskId, worker, requiredAmount, bountyAmount);
    }

    /**
     * @notice Release stake back to worker (permissionless)
     * @dev Worker can release immediately, anyone else after stakeReleaseDelay
     * @param taskId Task ID
     * @param worker Worker address
     */
    function releaseStake(
        bytes32 taskId,
        address worker
    ) external nonReentrant {
        bytes32 stakeId = keccak256(abi.encodePacked(taskId, worker));
        Stake storage stakeInfo = stakes[stakeId];

        if (stakeInfo.createdAt == 0) {
            revert StakeNotFound();
        }
        if (stakeInfo.status != StakeStatus.Active) {
            revert InvalidStakeStatus();
        }

        // Worker can release immediately, anyone else after delay
        bool isWorker = msg.sender == worker;
        bool delayPassed = block.timestamp >= stakeInfo.createdAt + stakeReleaseDelay;

        if (!isWorker && !delayPassed) {
            revert StakeNotReady();
        }

        stakeInfo.status = StakeStatus.Released;
        stakeInfo.releasedAt = block.timestamp;

        usdc.safeTransfer(worker, stakeInfo.amount);

        emit StakeReleased(stakeId, worker, stakeInfo.amount);
    }

    /**
     * @notice Slash stake when worker loses dispute
     * @param taskId Task ID
     * @param worker Worker address
     * @param requester Requester address (receives portion of slash)
     * @param requesterShareBps Percentage to requester (0-10000, rest to platform)
     */
    function slashStake(
        bytes32 taskId,
        address worker,
        address requester,
        uint256 requesterShareBps
    ) external onlyRole(DISPUTE_RESOLVER_ROLE) nonReentrant {
        if (requesterShareBps > 10000) {
            revert InvalidPercentage();
        }

        bytes32 stakeId = keccak256(abi.encodePacked(taskId, worker));
        Stake storage stakeInfo = stakes[stakeId];

        if (stakeInfo.createdAt == 0) {
            revert StakeNotFound();
        }
        if (stakeInfo.status != StakeStatus.Active) {
            revert InvalidStakeStatus();
        }

        stakeInfo.status = StakeStatus.Slashed;
        stakeInfo.releasedAt = block.timestamp;

        uint256 totalAmount = stakeInfo.amount;
        uint256 requesterAmount = (totalAmount * requesterShareBps) / 10000;
        uint256 platformAmount = totalAmount - requesterAmount;

        // Increment strike count on-chain
        workerStrikes[worker] += 1;
        emit StrikeRecorded(worker, workerStrikes[worker]);

        // Transfer to requester
        if (requesterAmount > 0) {
            usdc.safeTransfer(requester, requesterAmount);
        }

        // Transfer to platform
        if (platformAmount > 0) {
            usdc.safeTransfer(platformRecipient, platformAmount);
        }

        emit StakeSlashed(
            stakeId,
            worker,
            0, // Worker gets nothing
            requesterAmount,
            platformAmount,
            requester
        );
    }

    /**
     * @notice Partial slash with some return to worker
     * @dev Used for split dispute resolutions
     */
    function partialSlash(
        bytes32 taskId,
        address worker,
        address requester,
        uint256 workerReturnBps,
        uint256 requesterShareBps
    ) external onlyRole(DISPUTE_RESOLVER_ROLE) nonReentrant {
        if (workerReturnBps + requesterShareBps > 10000) {
            revert InvalidPercentage();
        }

        bytes32 stakeId = keccak256(abi.encodePacked(taskId, worker));
        Stake storage stakeInfo = stakes[stakeId];

        if (stakeInfo.createdAt == 0) {
            revert StakeNotFound();
        }
        if (stakeInfo.status != StakeStatus.Active) {
            revert InvalidStakeStatus();
        }

        stakeInfo.status = StakeStatus.Slashed;
        stakeInfo.releasedAt = block.timestamp;

        uint256 totalAmount = stakeInfo.amount;
        uint256 workerAmount = (totalAmount * workerReturnBps) / 10000;
        uint256 requesterAmount = (totalAmount * requesterShareBps) / 10000;
        uint256 platformAmount = totalAmount - workerAmount - requesterAmount;

        // Transfer to worker
        if (workerAmount > 0) {
            usdc.safeTransfer(worker, workerAmount);
        }

        // Transfer to requester
        if (requesterAmount > 0) {
            usdc.safeTransfer(requester, requesterAmount);
        }

        // Transfer to platform
        if (platformAmount > 0) {
            usdc.safeTransfer(platformRecipient, platformAmount);
        }

        emit StakeSlashed(
            stakeId,
            worker,
            workerAmount,
            requesterAmount,
            platformAmount,
            requester
        );
    }

    /**
     * @notice Reset strikes for a worker (admin function for rehabilitation)
     */
    function resetStrikes(address worker) external onlyRole(DEFAULT_ADMIN_ROLE) {
        workerStrikes[worker] = 0;
        emit StrikeRecorded(worker, 0);
    }

    // View functions

    function getStake(bytes32 taskId, address worker) external view returns (Stake memory) {
        bytes32 stakeId = keccak256(abi.encodePacked(taskId, worker));
        return stakes[stakeId];
    }

    function getStakeById(bytes32 stakeId) external view returns (Stake memory) {
        return stakes[stakeId];
    }

    function getWorkerStrikes(address worker) external view returns (uint256) {
        return workerStrikes[worker];
    }

    // Admin configuration functions

    function setBaseStakeBps(uint256 _baseStakeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_baseStakeBps >= minStakeBps && _baseStakeBps <= maxStakeBps, "Invalid range");
        baseStakeBps = _baseStakeBps;
        emit ConfigUpdated("baseStakeBps", _baseStakeBps);
    }

    function setMinStakeBps(uint256 _minStakeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minStakeBps <= baseStakeBps, "Min must be <= base");
        minStakeBps = _minStakeBps;
        emit ConfigUpdated("minStakeBps", _minStakeBps);
    }

    function setMaxStakeBps(uint256 _maxStakeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_maxStakeBps >= baseStakeBps && _maxStakeBps <= 5000, "Invalid max");
        maxStakeBps = _maxStakeBps;
        emit ConfigUpdated("maxStakeBps", _maxStakeBps);
    }

    function setStrikeIncrementBps(uint256 _strikeIncrementBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_strikeIncrementBps <= 1000, "Increment too high"); // Max +10% per strike
        strikeIncrementBps = _strikeIncrementBps;
        emit ConfigUpdated("strikeIncrementBps", _strikeIncrementBps);
    }

    function setHighReputationThreshold(uint256 _threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_threshold <= 10000, "Threshold must be <= 10000");
        highReputationThreshold = _threshold;
        emit ConfigUpdated("highReputationThreshold", _threshold);
    }

    function setReputationDiscountBps(uint256 _discountBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_discountBps <= baseStakeBps, "Discount too high");
        reputationDiscountBps = _discountBps;
        emit ConfigUpdated("reputationDiscountBps", _discountBps);
    }

    function setPlatformRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_recipient != address(0), "Invalid address");
        platformRecipient = _recipient;
    }

    function setPlatformSlashShareBps(uint256 _shareBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_shareBps <= 10000, "Share must be <= 100%");
        platformSlashShareBps = _shareBps;
        emit ConfigUpdated("platformSlashShareBps", _shareBps);
    }

    function setStakeReleaseDelay(uint256 _delay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_delay <= 7 days, "Delay cannot exceed 7 days");
        stakeReleaseDelay = _delay;
        emit ConfigUpdated("stakeReleaseDelay", _delay);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
