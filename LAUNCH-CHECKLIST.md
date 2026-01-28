# Field Network Launch Checklist

Comprehensive checklist for mainnet launch. All items must be completed and signed off before going live.

---

## 1. Infrastructure

### Domain & DNS
- [ ] Domain purchased (field-network.com or similar)
- [ ] DNS configured for:
  - [ ] `field-network.com` -> Vercel
  - [ ] `www.field-network.com` -> Vercel
  - [ ] `api.field-network.com` -> Railway
- [ ] SSL certificates active (automatic via Vercel/Railway)
- [ ] HSTS enabled

### API Hosting (Railway)
- [ ] Railway account created
- [ ] PostgreSQL database provisioned
- [ ] API service deployed from GitHub
- [ ] Custom domain configured
- [ ] Environment variables set (see below)
- [ ] Auto-scaling configured (if needed)
- [ ] Alerts configured for downtime

### Frontend Hosting (Vercel)
- [ ] Vercel account created
- [ ] Project imported from GitHub
- [ ] Root directory set to `packages/web`
- [ ] Custom domain configured
- [ ] Environment variables set
- [ ] Preview deployments working

### Database
- [ ] PostgreSQL running (Railway managed)
- [ ] Connection pooling configured
- [ ] Automated backups enabled
- [ ] Point-in-time recovery tested
- [ ] Database credentials rotated from defaults

---

## 2. Security

### Secrets Management
- [ ] JWT_SECRET generated (32+ bytes, unique)
- [ ] OPERATOR_PRIVATE_KEY stored securely
- [ ] DEPLOYER_PRIVATE_KEY not in production env
- [ ] All secrets in Railway/Vercel, not in code
- [ ] `.env` files in `.gitignore`

### Wallet Security
- [ ] Deployer wallet created (hardware wallet preferred)
- [ ] Operator wallet created (separate from deployer)
- [ ] Operator wallet has OPERATOR_ROLE only
- [ ] Admin wallet secured (consider multisig)
- [ ] Wallet private keys backed up securely

### Rate Limiting
- [ ] Global rate limiting enabled (100 req/15min)
- [ ] Auth endpoints have stricter limits (10 req/hour)
- [ ] Upload endpoints have separate limits
- [ ] Trust proxy enabled for correct IP detection

### Security Scan
- [ ] `npm audit` shows 0 critical/high vulnerabilities
- [ ] Secret detection scan passed
- [ ] No sensitive files tracked in git
- [ ] OWASP ZAP scan completed (if applicable)

### Error Handling
- [ ] No stack traces in production responses
- [ ] No internal paths exposed
- [ ] Generic error messages for 500 errors
- [ ] Request ID included for debugging

---

## 3. Smart Contract

### Contract Deployment
- [ ] Contract deployed to Base Sepolia (testnet)
- [ ] 7-day soak test completed on testnet
- [ ] Contract deployed to Base Mainnet
- [ ] Contract verified on Basescan
- [ ] Deployment transaction recorded

### Contract Configuration
- [ ] Platform fee set correctly (2.5% / 250 bps)
- [ ] Auto-release delay set (24 hours)
- [ ] Fee recipient address configured
- [ ] OPERATOR_ROLE granted to operator wallet
- [ ] DISPUTE_RESOLVER_ROLE granted (if applicable)

### Contract Security
- [ ] Pause mechanism tested
- [ ] Emergency procedures documented
- [ ] Contract address recorded in multiple places
- [ ] Upgrade strategy documented (see CONTRACT-OPERATIONS.md)

---

## 4. Environment Variables

### API (Railway)

| Variable | Set | Verified |
|----------|-----|----------|
| `DATABASE_URL` | [ ] | [ ] |
| `JWT_SECRET` | [ ] | [ ] |
| `CORS_ORIGINS` | [ ] | [ ] |
| `ESCROW_PROVIDER=onchain` | [ ] | [ ] |
| `CHAIN_ID=8453` | [ ] | [ ] |
| `BASE_RPC_URL` | [ ] | [ ] |
| `ESCROW_CONTRACT_ADDRESS` | [ ] | [ ] |
| `OPERATOR_PRIVATE_KEY` | [ ] | [ ] |
| `USDC_ADDRESS` | [ ] | [ ] |
| `TRUST_PROXY=true` | [ ] | [ ] |
| `NODE_ENV=production` | [ ] | [ ] |
| `LOG_LEVEL=info` | [ ] | [ ] |
| `LOG_FORMAT=json` | [ ] | [ ] |
| `ALERT_WEBHOOK_URL` | [ ] | [ ] |

### Frontend (Vercel)

| Variable | Set | Verified |
|----------|-----|----------|
| `NEXT_PUBLIC_API_URL` | [ ] | [ ] |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | [ ] | [ ] |
| `NEXT_PUBLIC_CHAIN_ID=8453` | [ ] | [ ] |

---

## 5. Monitoring & Alerting

### Uptime Monitoring
- [ ] Health endpoint monitored (`/health`)
- [ ] Uptime check interval: 1 minute
- [ ] Alert on 2+ consecutive failures
- [ ] Status page configured (optional)

### Application Monitoring
- [ ] Error tracking enabled (console logging)
- [ ] Request logging enabled
- [ ] Slow query logging (> 1s)
- [ ] Memory/CPU monitoring via Railway

### Alerting
- [ ] Slack/Discord webhook configured
- [ ] Email alerts configured (optional)
- [ ] Alert for API downtime
- [ ] Alert for high error rate (> 5%)
- [ ] Alert for low operator wallet balance (< 0.01 ETH)
- [ ] Alert for contract pause events

---

## 6. Testing

### Pre-Launch Tests
- [ ] Smoke tests pass on staging
- [ ] Smoke tests pass on production
- [ ] Load test completed (50 users, 60s)
- [ ] P99 latency < 1s
- [ ] Error rate < 1%

### Manual Testing
- [ ] User registration works
- [ ] User login works (email)
- [ ] Wallet connection works (SIWE)
- [ ] Task creation works
- [ ] Task listing works
- [ ] Profile update works

### Escrow Testing
- [ ] Deposit transaction succeeds (testnet first)
- [ ] Release transaction succeeds
- [ ] Refund transaction succeeds
- [ ] Platform fee correctly deducted
- [ ] On-chain state matches database

---

## 7. Documentation

### Technical Documentation
- [ ] PRODUCTION.md complete
- [ ] DEPLOYMENT-RUNBOOK.md complete
- [ ] CONTRACT-OPERATIONS.md complete
- [ ] SECURITY.md complete
- [ ] API documentation available

### Operational Documentation
- [ ] Runbook reviewed by team
- [ ] Rollback procedures documented
- [ ] On-call rotation established
- [ ] Emergency contact list updated

---

## 8. Legal & Compliance

### Legal Documents
- [ ] Terms of Service published (`/terms`)
- [ ] Privacy Policy published (`/privacy`)
- [ ] EULA published (`/eula`)
- [ ] Usage Policy published (`/usage`)

### Compliance
- [ ] GDPR considerations addressed (if applicable)
- [ ] Data retention policy defined
- [ ] User data export capability exists
- [ ] Account deletion process defined

---

## 9. Go/No-Go Decision

### Go Criteria
All of the following must be true:
- [ ] All critical checklist items completed
- [ ] No blocking issues from security scan
- [ ] Testnet soak test passed
- [ ] On-call engineer available
- [ ] Rollback plan tested

### No-Go Criteria
Any of the following blocks launch:
- [ ] Critical security vulnerability found
- [ ] Testnet soak test failed
- [ ] Contract deployment failed
- [ ] Unable to fund operator wallet
- [ ] Team not available for support window

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| Security Review | | | |
| Infrastructure | | | |
| Product Owner | | | |

---

## Post-Launch Checklist

After successful launch:

- [ ] Monitor error rates for 24 hours
- [ ] First real transaction completed
- [ ] No critical issues reported
- [ ] Team retrospective scheduled
- [ ] Documentation updated with any learnings
- [ ] Celebrate!

---

## Appendix: Quick Reference

### Important URLs

| Service | URL |
|---------|-----|
| Production Frontend | https://field-network.com |
| Production API | https://api.field-network.com |
| Staging Frontend | https://staging.field-network.com |
| Staging API | https://api-staging.field-network.com |
| Basescan (Contract) | https://basescan.org/address/[CONTRACT] |
| Railway Dashboard | https://railway.app/project/... |
| Vercel Dashboard | https://vercel.com/... |

### Emergency Commands

```bash
# Pause contract (emergency)
npx hardhat console --network base
await contract.pause()

# Roll back API (Railway)
railway rollback --service api

# Roll back frontend (Vercel)
vercel rollback

# Check operator balance
cast balance $OPERATOR_ADDRESS --rpc-url https://mainnet.base.org
```

### Support Contacts

| Service | Support |
|---------|---------|
| Railway | https://railway.app/help |
| Vercel | https://vercel.com/support |
| Base | https://docs.base.org/support |
| WalletConnect | https://walletconnect.com/support |

---

*Last Updated: 2026-01-19*
