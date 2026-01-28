# Production Deployment Guide

Step-by-step guide to deploying Field Network to production.

## Prerequisites

- [ ] GitHub repository (you have this: `CCWBee/field-network`)
- [ ] Node.js 20+ installed locally
- [ ] Domain name purchased

## 1. Domain Setup

**Recommended**: `field-network.com` (available as of Jan 2025)

Purchase from [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) or [Namecheap](https://www.namecheap.com).

You'll configure DNS after setting up hosting.

---

## 2. Create Wallets

You need two separate wallets. **Never use your personal wallet.**

### Deployer Wallet (one-time contract deployment)

```bash
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey);"
```

Save the output securely. Fund with:
- **Testnet**: Free ETH from [base.org/faucet](https://www.base.org/faucet)
- **Mainnet**: ~$10 of ETH on Base

### Operator Wallet (API uses this to release escrow)

```bash
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey);"
```

Fund with ~$5 of ETH on Base for gas fees.

---

## 3. Railway Setup (API + Database)

### 3.1 Create Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 3.2 Create Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose `field-network`
4. Railway auto-detects the Dockerfile

### 3.3 Add PostgreSQL
1. In your project, click "New"
2. Select "Database" → "PostgreSQL"
3. Copy the `DATABASE_URL` from the PostgreSQL service variables

### 3.4 Configure Environment Variables

In Railway, go to your API service → Variables → Add these:

```env
# Database (copy from PostgreSQL service)
DATABASE_URL=postgresql://...

# Auth
JWT_SECRET=<generate with: openssl rand -hex 32>

# CORS (update after Vercel setup)
CORS_ORIGINS=https://field-network.com,https://www.field-network.com

# Escrow - Start with mock, switch to onchain when ready
ESCROW_PROVIDER=mock

# For production escrow (add later):
# ESCROW_PROVIDER=onchain
# ESCROW_CONTRACT_ADDRESS=0x...
# CHAIN_ID=8453
# BASE_RPC_URL=https://mainnet.base.org
# OPERATOR_PRIVATE_KEY=0x...
```

### 3.5 Get Railway Token
1. Go to Account Settings → Tokens
2. Create new token
3. Save as `RAILWAY_TOKEN` for GitHub Actions

### 3.6 Custom Domain (Optional)
1. In Railway, go to Settings → Domains
2. Add `api.field-network.com`
3. Add the CNAME record to your DNS

---

## 4. Vercel Setup (Frontend)

### 4.1 Create Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

### 4.2 Import Project
1. Click "Add New Project"
2. Import `field-network` repository
3. Set root directory to `packages/web`
4. Framework preset: Next.js

### 4.3 Configure Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.field-network.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>
```

### 4.4 Get Vercel Credentials
1. Account Settings → Tokens → Create token → Save as `VERCEL_TOKEN`
2. Settings → General → Copy "Vercel ID" → Save as `VERCEL_ORG_ID`
3. Project Settings → General → Copy "Project ID" → Save as `VERCEL_PROJECT_ID`

### 4.5 Custom Domain
1. Project Settings → Domains
2. Add `field-network.com` and `www.field-network.com`
3. Add DNS records as instructed

---

## 5. WalletConnect Setup

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create account and new project
3. Copy Project ID
4. Add to Vercel env: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

---

## 6. GitHub Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret | Source |
|--------|--------|
| `RAILWAY_TOKEN` | Railway account settings |
| `VERCEL_TOKEN` | Vercel account settings |
| `VERCEL_ORG_ID` | Vercel settings |
| `VERCEL_PROJECT_ID` | Vercel project settings |
| `DEPLOYER_PRIVATE_KEY` | Your deployer wallet |
| `BASESCAN_API_KEY` | [basescan.org/apis](https://basescan.org/apis) |

---

## 7. Deploy Smart Contract

### 7.1 Testnet First (Base Sepolia)

```bash
# Fund deployer wallet from faucet first
npm run deploy:base-sepolia --workspace=@ground-truth/contracts
```

Save the deployed contract address.

### 7.2 Mainnet (When Ready)

```bash
npm run deploy:base --workspace=@ground-truth/contracts
```

Update Railway environment:
```env
ESCROW_PROVIDER=onchain
ESCROW_CONTRACT_ADDRESS=0x<your-deployed-address>
CHAIN_ID=8453
BASE_RPC_URL=https://mainnet.base.org
OPERATOR_PRIVATE_KEY=0x<your-operator-key>
```

---

## 8. DNS Configuration

After Railway and Vercel are set up, add these DNS records:

| Type | Name | Value |
|------|------|-------|
| CNAME | `api` | `<your-app>.up.railway.app` |
| CNAME | `@` | `cname.vercel-dns.com` |
| CNAME | `www` | `cname.vercel-dns.com` |

---

## 9. Deploy

Push to main branch to trigger deployment:

```bash
git push origin master:main
```

GitHub Actions will:
1. Run tests
2. Build packages
3. Deploy API to Railway
4. Deploy Web to Vercel

---

## 10. Verify Deployment

- [ ] `https://api.field-network.com/health` returns OK
- [ ] `https://field-network.com` loads frontend
- [ ] Wallet connection works
- [ ] Can create account (email or SIWE)
- [ ] Can create a task (mock escrow)

---

## Cost Summary

| Service | Monthly Cost |
|---------|--------------|
| Railway (API + Postgres) | $5-10 |
| Vercel (Frontend) | Free |
| Domain | ~$1 |
| WalletConnect | Free |
| Base RPC (public) | Free |
| **Total** | **~$7-12/mo** |

---

## Security Checklist

- [ ] `JWT_SECRET` is randomly generated (32+ bytes)
- [ ] `OPERATOR_PRIVATE_KEY` stored only in Railway secrets
- [ ] Database not publicly accessible
- [ ] CORS restricted to your domain only
- [ ] HTTPS enforced on all endpoints

---

## Upgrading Wallet Security (Optional)

For higher security, migrate from environment variable to AWS KMS:

### AWS KMS Setup

1. Create AWS account
2. IAM → Create user with `KMSFullAccess`
3. KMS → Create symmetric key
4. Store key ARN

Update API to use KMS for signing instead of raw private key. This ensures the private key never leaves AWS.

---

## Troubleshooting

### Database connection fails
- Check `DATABASE_URL` is copied correctly from Railway PostgreSQL service
- Ensure PostgreSQL service is running

### CORS errors
- Verify `CORS_ORIGINS` includes your frontend domain with `https://`
- No trailing slashes

### Wallet connection fails
- Check `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set
- Verify domain is added to WalletConnect project allowed origins

### Contract deployment fails
- Ensure deployer wallet has enough ETH for gas
- Check `DEPLOYER_PRIVATE_KEY` is correct (include `0x` prefix)

---

## Going Live Checklist

1. [ ] Domain purchased and DNS configured
2. [ ] Railway API + PostgreSQL running
3. [ ] Vercel frontend deployed
4. [ ] WalletConnect project created
5. [ ] GitHub secrets configured
6. [ ] Contract deployed to Base Sepolia (test)
7. [ ] Full user flow tested on staging
8. [ ] Contract deployed to Base Mainnet
9. [ ] `ESCROW_PROVIDER=onchain` enabled
10. [ ] Monitor first real transactions

---

## Complete Environment Variables Reference

### API Service (Railway)

#### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for signing JWT tokens (32+ bytes) | `openssl rand -hex 32` |
| `CORS_ORIGINS` | Allowed frontend origins (comma-separated) | `https://field-network.com` |

#### Escrow Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `ESCROW_PROVIDER` | Provider type: `mock` or `onchain` | `onchain` |
| `CHAIN_ID` | Blockchain chain ID | `8453` (mainnet), `84532` (testnet) |
| `BASE_RPC_URL` | Base RPC endpoint | `https://mainnet.base.org` |
| `ESCROW_CONTRACT_ADDRESS` | Deployed escrow contract | `0x...` |
| `OPERATOR_PRIVATE_KEY` | Operator wallet private key | `0x...` |
| `USDC_ADDRESS` | USDC token address (optional, auto-detected) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

#### Storage Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `STORAGE_PROVIDER` | Provider type: `local` or `s3` | `s3` |
| `S3_BUCKET` | S3 bucket name | `field-network-uploads` |
| `S3_REGION` | AWS region | `us-east-1` |
| `S3_ACCESS_KEY_ID` | AWS access key | `AKIA...` |
| `S3_SECRET_ACCESS_KEY` | AWS secret key | `...` |
| `S3_ENDPOINT` | Custom S3 endpoint (for R2/MinIO) | `https://xyz.r2.cloudflarestorage.com` |

#### Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `RATE_LIMIT_WINDOW_MS` | Window duration in ms | `900000` (15 min) |
| `RATE_LIMIT_MAX` | Max requests per window (anon) | `100` |
| `RATE_LIMIT_MAX_AUTH` | Max requests per window (auth) | `500` |
| `TRUST_PROXY` | Trust X-Forwarded-For header | `true` |

#### Monitoring & Alerts

| Variable | Description | Example |
|----------|-------------|---------|
| `ALERT_WEBHOOK_URL` | Slack/Discord webhook for alerts | `https://hooks.slack.com/...` |
| `ALERT_MIN_OPERATOR_BALANCE` | Balance threshold for alerts (ETH) | `0.01` |
| `LOG_LEVEL` | Logging level | `info` |
| `LOG_FORMAT` | Log format: `text` or `json` | `json` |

### Frontend Service (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | API base URL | `https://api.field-network.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID | `abc123...` |
| `NEXT_PUBLIC_CHAIN_ID` | Target chain ID | `8453` |

### Contract Deployment (Local/CI)

| Variable | Description | Example |
|----------|-------------|---------|
| `DEPLOYER_PRIVATE_KEY` | Deployer wallet private key | `0x...` |
| `BASESCAN_API_KEY` | Basescan API key for verification | `...` |
| `FEE_RECIPIENT` | Platform fee recipient address | `0x...` |
| `PLATFORM_FEE_BPS` | Platform fee in basis points | `250` (2.5%) |
| `AUTO_RELEASE_HOURS` | Auto-release delay in hours | `24` |

---

## Network Configuration Reference

### Base Mainnet (Production)

| Setting | Value |
|---------|-------|
| Chain ID | `8453` |
| RPC URL | `https://mainnet.base.org` |
| Explorer | `https://basescan.org` |
| USDC Address | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

### Base Sepolia (Testnet)

| Setting | Value |
|---------|-------|
| Chain ID | `84532` |
| RPC URL | `https://sepolia.base.org` |
| Explorer | `https://sepolia.basescan.org` |
| USDC Address | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Quick Commands

```bash
# Generate secure JWT secret
openssl rand -hex 32

# Generate wallet private key
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"

# Deploy contract (testnet)
cd packages/contracts
npx hardhat run scripts/deploy.ts --network base-sepolia

# Deploy contract (mainnet)
cd packages/contracts
DRY_RUN=true npx hardhat run scripts/deploy.ts --network base

# Verify contract
ESCROW_CONTRACT_ADDRESS=0x... npx hardhat run scripts/verify.ts --network base

# Run security scan
./scripts/security-scan.sh

# Run smoke tests
npx ts-node scripts/smoke-test.ts --env=production
```
