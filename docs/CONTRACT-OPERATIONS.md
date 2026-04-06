# Contract Operations Manual

This document describes the operational procedures for the GroundTruthEscrow smart contract deployed on Base.

## Contract Overview

**Contract**: GroundTruthEscrow.sol
**Network**: Base (Chain ID: 8453) / Base Sepolia (Chain ID: 84532)
**Token**: USDC (6 decimals)

### Key Features
- USDC escrow for task bounties
- Platform fee collection (configurable, default 2.5%)
- Auto-release timer (default 24 hours after acceptance)
- Dispute resolution with split payments
- Pausable for emergencies
- Role-based access control

---

## Roles and Permissions

### DEFAULT_ADMIN_ROLE
- Can grant/revoke all roles
- Can update platform fee (max 10%)
- Can update auto-release delay
- Can update fee recipient address
- Can pause/unpause contract

### OPERATOR_ROLE
- Can assign workers to escrows
- Can mark submissions as accepted
- Can trigger releases and refunds

### DISPUTE_RESOLVER_ROLE
- Can resolve disputes with split percentages

---

## Emergency Procedures

### 1. Pause Contract

**When to pause:**
- Security vulnerability discovered
- Suspicious activity detected
- Contract upgrade required
- External dependency failure (e.g., USDC contract issue)

**How to pause:**
```bash
# Using Hardhat
npx hardhat console --network base

# In console
const contract = await ethers.getContractAt("GroundTruthEscrow", "0x...");
await contract.pause();
```

**From Basescan:**
1. Go to contract on Basescan
2. Connect admin wallet
3. Write Contract -> pause()
4. Confirm transaction

**Notification:**
- Immediately notify team via on-call channel
- Post status update to users
- Log incident with timestamp

### 2. Unpause Contract

**Prerequisites:**
- Root cause identified and resolved
- Security review completed (if security incident)
- Pending transactions reviewed

**How to unpause:**
```bash
npx hardhat console --network base
const contract = await ethers.getContractAt("GroundTruthEscrow", "0x...");
await contract.unpause();
```

---

## Parameter Updates

### Update Platform Fee

**Constraints:**
- Maximum: 1000 basis points (10%)
- Minimum: 0 basis points (0%)
- Only applies to new deposits

```solidity
// Example: Set to 3% (300 basis points)
await contract.setPlatformFee(300);
```

### Update Auto-Release Delay

**Constraints:**
- Recommended minimum: 1 hour (3600 seconds)
- Recommended maximum: 7 days (604800 seconds)
- Only applies to new acceptances

```solidity
// Example: Set to 48 hours
await contract.setAutoReleaseDelay(48 * 60 * 60);
```

### Update Fee Recipient

**Constraints:**
- Cannot be zero address
- Should be multisig for production

```solidity
await contract.setFeeRecipient("0x...");
```

---

## Upgrade Strategy

### Current Contract: Non-Upgradeable

The GroundTruthEscrow contract is NOT upgradeable. This is intentional for:
- **Security**: No admin key can modify contract logic
- **Trust**: Users know exactly what code governs their funds
- **Simplicity**: No proxy patterns to audit

### Upgrade Path

To deploy a new version:

1. **Deploy new contract** alongside existing one
2. **Pause old contract** to prevent new deposits
3. **Migrate API** to point to new contract
4. **Allow old escrows to complete** naturally
5. **Monitor both contracts** until old one is empty

**Database Migration:**
```sql
-- Add new contract address to config
UPDATE system_config SET value = '0xNEW_ADDRESS' WHERE key = 'escrow_contract';

-- Track which contract each escrow uses
ALTER TABLE escrows ADD COLUMN contract_version VARCHAR(10) DEFAULT 'v1';
```

### Future: Upgradeable Pattern

If upgradeability is needed later, consider:
- **UUPS Proxy** (OpenZeppelin)
- **Transparent Proxy** (OpenZeppelin)
- **Diamond Pattern** (EIP-2535)

Implementation requires:
1. Deploy proxy pointing to implementation
2. Add `initialize()` function (replaces constructor)
3. Add upgrade authorization logic
4. Use storage gap pattern for future storage

---

## Monitoring Procedures

### Daily Checks
- [ ] Contract balance matches sum of funded escrows
- [ ] No unusual pause/unpause events
- [ ] Fee recipient balance growing appropriately
- [ ] No failed transactions from operator wallet

### Weekly Checks
- [ ] Review all dispute resolutions
- [ ] Verify auto-releases processed correctly
- [ ] Check operator wallet ETH balance for gas
- [ ] Review any blocked/reverted transactions

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Operator ETH balance | < 0.01 ETH | < 0.001 ETH |
| Failed transactions | > 2/day | > 5/day |
| Pending disputes | > 10 | > 25 |
| Contract balance drift | > 1% | > 5% |

---

## Dispute Resolution Procedures

### Standard Process

1. **Review submission** via admin dashboard
2. **Gather evidence** from both parties
3. **Apply resolution criteria:**
   - Task requirements met? (40% weight)
   - Evidence quality? (30% weight)
   - Communication/timeline? (20% weight)
   - Prior history? (10% weight)

4. **Determine split percentage:**
   - 100% worker: Task completed satisfactorily
   - 70-90% worker: Minor issues but acceptable
   - 50%: Significant issues on both sides
   - 10-30% worker: Major deficiencies
   - 0% worker: Fraudulent/no delivery

5. **Execute resolution:**
```solidity
await contract.resolveDispute(escrowId, workerSharePercent);
```

### Appeals
- No on-chain appeal mechanism
- Off-chain review possible within 48 hours
- Requires new dispute with documented reason

---

## Key Recovery Procedures

### Operator Key Compromise

**Immediate actions:**
1. Pause contract
2. Revoke OPERATOR_ROLE from compromised address
3. Grant OPERATOR_ROLE to new secure address
4. Review all recent operator transactions
5. Unpause contract

```solidity
const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
await contract.revokeRole(OPERATOR_ROLE, compromisedAddress);
await contract.grantRole(OPERATOR_ROLE, newAddress);
```

### Admin Key Compromise

**Immediate actions:**
1. This is critical - admin can grant any role
2. Deploy new contract immediately
3. Pause old contract
4. Migrate all pending escrows manually
5. Conduct full security audit

**Prevention:**
- Use multisig for admin role
- Hardware wallet required
- Geographic key distribution

---

## Gas Optimization

### Batch Operations
The contract does not support batching. For multiple operations:
- Use multicall contracts for read operations
- Queue write operations in API before submitting

### Gas Estimation
| Operation | Estimated Gas | ~USD (1 gwei) |
|-----------|---------------|---------------|
| deposit | 120,000 | $0.012 |
| assignWorker | 45,000 | $0.0045 |
| accept | 50,000 | $0.005 |
| release | 80,000 | $0.008 |
| refund | 70,000 | $0.007 |
| resolveDispute | 90,000 | $0.009 |

---

## Contact Information

### On-Call Rotation
- Primary: [TBD]
- Secondary: [TBD]
- Escalation: [TBD]

### External Contacts
- Base support: https://docs.base.org/support
- USDC (Circle): https://support.circle.com
- Basescan: support@basescan.org

---

## Appendix: Contract Addresses

### Production (Base Mainnet)
| Contract | Address | Verified |
|----------|---------|----------|
| GroundTruthEscrow | TBD | TBD |
| USDC | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | Yes |

### Staging (Base Sepolia)
| Contract | Address | Verified |
|----------|---------|----------|
| GroundTruthEscrow | TBD | TBD |
| Test USDC | 0x036CbD53842c5426634e7929541eC2318f3dCF7e | Yes |

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-19 | 1.0 | Initial document |
