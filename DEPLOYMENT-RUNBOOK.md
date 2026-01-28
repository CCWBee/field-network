# Mainnet Deployment Runbook

Step-by-step instructions for deploying Field Network to Base Mainnet.

## Pre-Deployment Checklist

Before starting the deployment, ensure:

- [ ] Testnet deployment completed successfully
- [ ] 7-day soak test passed on testnet
- [ ] Security scan shows no critical/high issues
- [ ] All team members notified of deployment window
- [ ] Rollback plan reviewed
- [ ] On-call engineer available

---

## Phase 1: Pre-Deployment Preparation (T-24 hours)

### 1.1 Environment Verification

```bash
# Verify all environment variables are set
cat .env.production.example | grep -v "^#" | grep -v "^$" | cut -d= -f1 | while read var; do
  if [ -z "${!var}" ]; then
    echo "MISSING: $var"
  else
    echo "OK: $var"
  fi
done
```

### 1.2 Database Backup

```bash
# Create pre-deployment backup
pg_dump $DATABASE_URL > backup-pre-deploy-$(date +%Y%m%d-%H%M%S).sql

# Verify backup
ls -la backup-pre-deploy-*.sql
```

### 1.3 Code Freeze

```bash
# Create deployment tag
git tag -a v1.0.0-rc1 -m "Release candidate for mainnet deployment"
git push origin v1.0.0-rc1

# Verify tag
git show v1.0.0-rc1
```

### 1.4 Wallet Preparation

```bash
# Verify deployer wallet has sufficient ETH (need ~0.1 ETH for deployment)
# Check at: https://basescan.org/address/YOUR_DEPLOYER_ADDRESS

# Verify operator wallet has sufficient ETH (need ~0.05 ETH for operations)
# Check at: https://basescan.org/address/YOUR_OPERATOR_ADDRESS
```

**Sign-off Required**: Infrastructure Lead confirms all pre-deployment checks pass.

---

## Phase 2: Contract Deployment (T-2 hours)

### 2.1 Final Testnet Verification

```bash
# Run smoke tests against testnet one final time
npx ts-node scripts/smoke-test.ts --env=staging
```

**Expected Result**: All tests pass.

### 2.2 Dry Run Deployment

```bash
cd packages/contracts

# Simulate deployment without actually deploying
DRY_RUN=true npx hardhat run scripts/deploy.ts --network base
```

**Expected Result**: Gas estimation completes, no errors.

### 2.3 Deploy Contract to Mainnet

```bash
# Deploy to Base Mainnet
npx hardhat run scripts/deploy.ts --network base

# RECORD THE OUTPUT:
# - Contract Address: 0x...
# - Transaction Hash: 0x...
# - Gas Used: ...
```

**Checkpoint**: Record contract address in deployment log.

### 2.4 Verify Contract on Basescan

```bash
# Set environment variable
export ESCROW_CONTRACT_ADDRESS=0x...your-deployed-address...

# Run verification
npx hardhat run scripts/verify.ts --network base

# Verify at: https://basescan.org/address/$ESCROW_CONTRACT_ADDRESS#code
```

**Expected Result**: Contract shows "Verified" badge on Basescan.

### 2.5 Grant Operator Role

```bash
# Using Hardhat console
npx hardhat console --network base

# In console:
const contract = await ethers.getContractAt("GroundTruthEscrow", "0x...");
const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
await contract.grantRole(OPERATOR_ROLE, "0x...operator-wallet-address...");
```

**Verify**:
```bash
# Check role was granted
await contract.hasRole(OPERATOR_ROLE, "0x...operator-wallet-address...");
# Should return: true
```

### Rollback Point A

If contract deployment fails:
1. Do not proceed to Phase 3
2. Investigate error in deployment logs
3. Re-run deployment after fixing issues
4. No user-facing changes yet

---

## Phase 3: API Deployment (T-1 hour)

### 3.1 Update Railway Environment Variables

In Railway Dashboard (Project -> API Service -> Variables):

```env
ESCROW_PROVIDER=onchain
CHAIN_ID=8453
ESCROW_CONTRACT_ADDRESS=0x...your-deployed-address...
BASE_RPC_URL=https://mainnet.base.org
OPERATOR_PRIVATE_KEY=0x...
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

**Double-check**: Verify all values match deployment output.

### 3.2 Deploy API

```bash
# Trigger Railway deployment
# Option 1: Via GitHub push
git push origin main

# Option 2: Via Railway CLI
railway up --service api
```

### 3.3 Verify API Deployment

```bash
# Health check
curl https://api.field-network.com/health

# Expected response:
# {"status":"ok","timestamp":"..."}
```

### 3.4 Run Smoke Tests Against Production

```bash
npx ts-node scripts/smoke-test.ts --env=production
```

**Expected Result**: All tests pass (except those requiring mainnet USDC).

### Rollback Point B

If API deployment fails:
1. Roll back Railway to previous deployment
2. Verify mock escrow still works
3. Investigate deployment logs
4. Schedule re-deployment

---

## Phase 4: Frontend Deployment (T-30 minutes)

### 4.1 Update Vercel Environment Variables

In Vercel Dashboard (Project Settings -> Environment Variables):

```env
NEXT_PUBLIC_CHAIN_ID=8453
```

### 4.2 Deploy Frontend

```bash
# Via Vercel CLI or GitHub push
vercel --prod
# or
git push origin main
```

### 4.3 Verify Frontend

1. Visit https://field-network.com
2. Connect wallet (should prompt for Base Mainnet)
3. Verify all pages load correctly
4. Check console for errors

### Rollback Point C

If frontend deployment fails:
1. Roll back Vercel to previous deployment
2. Verify API still accessible
3. Investigate build logs

---

## Phase 5: Post-Deployment Verification (T+0)

### 5.1 End-to-End Smoke Test

Manually verify the full flow:

1. [ ] Visit https://field-network.com
2. [ ] Register new account with email
3. [ ] Connect wallet (should be Base Mainnet)
4. [ ] Create a task (draft mode)
5. [ ] Verify task appears in list
6. [ ] Check API logs for errors

### 5.2 Monitor for 30 Minutes

Watch for:
- [ ] Error rate in logs (should be < 1%)
- [ ] Response times (p99 < 1s)
- [ ] Memory/CPU usage
- [ ] Database connections

```bash
# Railway logs
railway logs --service api -f

# Or via Railway dashboard
```

### 5.3 Enable Production Alerts

Verify alert webhook is configured and send test alert:

```bash
# Send test alert
curl -X POST $ALERT_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"text":"Field Network deployed to mainnet successfully!"}'
```

---

## Phase 6: Production Testing (T+1 hour)

### 6.1 First Real Transaction Test

With a small amount of USDC ($5):

1. Create a task with $5 bounty
2. Fund the task (deposit USDC to escrow)
3. Verify on-chain:
   - Check Basescan for deposit transaction
   - Verify escrow contract balance increased
4. Cancel the task (refund)
5. Verify refund received

### 6.2 Full Escrow Flow Test

If initial test passes, test full flow:

1. Create task ($5)
2. Fund task
3. Claim task (as different wallet)
4. Submit (upload test image)
5. Accept submission
6. Verify funds released to worker
7. Verify platform fee collected

### 6.3 Load Test Production

```bash
# Light load test (be careful in production!)
npx ts-node scripts/load-test.ts --env=production --users=10 --duration=60
```

**Warning**: Keep load test light to avoid rate limiting.

---

## Phase 7: Go Live Announcement (T+2 hours)

After all verifications pass:

1. [ ] Update status page to "Operational"
2. [ ] Send announcement to team
3. [ ] Enable monitoring dashboards
4. [ ] Remove "Beta" badge from frontend (if applicable)

---

## Rollback Procedures

### Full Rollback (Critical Issue)

If critical issue discovered post-deployment:

```bash
# 1. Pause escrow contract immediately
# Via Basescan or:
npx hardhat console --network base
const contract = await ethers.getContractAt("GroundTruthEscrow", "0x...");
await contract.pause();

# 2. Roll back API to use mock escrow
# In Railway: Set ESCROW_PROVIDER=mock

# 3. Roll back frontend
# In Vercel: Redeploy previous version

# 4. Restore database if needed
psql $DATABASE_URL < backup-pre-deploy-YYYYMMDD-HHMMSS.sql

# 5. Notify team and users
```

### Partial Rollback (Non-Critical Issue)

For issues that don't affect funds:

1. Identify affected component
2. Roll back only that component
3. Keep contract active if funds are safe
4. Fix and redeploy

---

## Emergency Contacts

| Role | Name | Contact |
|------|------|---------|
| On-Call Engineer | [TBD] | [TBD] |
| Infrastructure Lead | [TBD] | [TBD] |
| Security Lead | [TBD] | [TBD] |
| Contract Admin | [TBD] | [TBD] |

---

## Deployment Log Template

```
Deployment Date: YYYY-MM-DD HH:MM UTC
Deployment Version: v1.0.0

Pre-Deployment:
[ ] Testnet verification passed
[ ] Security scan passed
[ ] Backup created
[ ] Team notified

Contract Deployment:
- Contract Address: 0x...
- Transaction Hash: 0x...
- Gas Used: ...
- Verified on Basescan: Yes/No

API Deployment:
- Railway Deployment ID: ...
- Health Check: Pass/Fail

Frontend Deployment:
- Vercel Deployment URL: ...
- Visual Check: Pass/Fail

Post-Deployment:
[ ] Smoke tests passed
[ ] First transaction successful
[ ] Monitoring enabled
[ ] Alerts working

Sign-off:
- Deployed by: [Name]
- Reviewed by: [Name]
- Time to deploy: [Duration]

Notes:
[Any issues encountered and how they were resolved]
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-01-19 | 1.0 | Sprint 7 | Initial runbook |
