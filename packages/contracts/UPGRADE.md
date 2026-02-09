# Contract Upgrade Procedure

The GroundTruthEscrow and WorkerStaking contracts are **non-upgradeable** (no proxy pattern). This is intentional for simplicity and auditability. If a bug is found or new features are needed, deploy a new contract version and migrate.

## Upgrade Steps

### 1. Deploy New Contract

```bash
# Deploy with dry run first
DRY_RUN=true npx hardhat run scripts/deploy.ts --network base-sepolia

# Deploy for real
npx hardhat run scripts/deploy.ts --network base-sepolia
```

### 2. Pause Old Contract

The admin calls `pause()` on the old contract to prevent new deposits.

```bash
# Via Hardhat console or script
npx hardhat console --network base-sepolia
> const escrow = await ethers.getContractAt("GroundTruthEscrow", "OLD_ADDRESS")
> await escrow.pause()
```

### 3. Wait for In-Flight Escrows

Query the old contract for any escrows in non-terminal states (Funded, Accepted, Disputed). These must resolve before migration.

Terminal states: Released, Refunded
Non-terminal states: Funded, Accepted, Disputed

**Do NOT migrate until all escrows are in terminal states.**

### 4. Update API Configuration

Update environment variables to point to the new contract:

```env
ESCROW_CONTRACT_ADDRESS=0xNEW_CONTRACT_ADDRESS
STAKING_CONTRACT_ADDRESS=0xNEW_STAKING_ADDRESS
```

### 5. Update Chain Indexer Cursor

The chain indexer needs to start tracking the new contract. Reset the cursor:

```sql
UPDATE "ChainCursor" SET "lastBlock" = NEW_DEPLOY_BLOCK WHERE "chainId" = 84532;
```

### 6. Grant Roles on New Contract

```bash
npx hardhat console --network base-sepolia
> const escrow = await ethers.getContractAt("GroundTruthEscrow", "NEW_ADDRESS")
> await escrow.grantRole(await escrow.OPERATOR_ROLE(), "OPERATOR_WALLET")
> await escrow.grantRole(await escrow.DISPUTE_RESOLVER_ROLE(), "RESOLVER_WALLET")
```

### 7. Redeploy API

Restart the API service with the updated environment variables.

### 8. Verify New Contract on Basescan

```bash
ESCROW_CONTRACT_ADDRESS=0xNEW npx hardhat run scripts/verify.ts --network base-sepolia
```

## Emergency Procedures

### Bug Found - Pause Immediately

```bash
# Pause both contracts
await escrow.pause()
await staking.pause()
```

### Funds Stuck in Old Contract

If escrows are stuck (e.g., assigned worker disappeared), the OPERATOR_ROLE can:
- Call `refund()` on funded escrows with assigned workers
- The DISPUTE_RESOLVER_ROLE can call `resolveDispute()` on disputed escrows

### Checking Active Escrows

Query the chain indexer database:

```sql
SELECT id, "taskId", status, amount, "createdAt"
FROM "Escrow"
WHERE provider = 'onchain'
AND status NOT IN ('released', 'refunded')
ORDER BY "createdAt" DESC;
```

## Future: Proxy Pattern

If frequent upgrades become necessary, consider migrating to an upgradeable proxy pattern (e.g., UUPS or TransparentProxy via OpenZeppelin). This requires:

1. Deploying a proxy contract
2. Deploying implementation contracts behind the proxy
3. A full re-audit of the proxy + implementation
4. More complex deployment scripts

For now, the manual migration approach is simpler and safer for a new platform.
