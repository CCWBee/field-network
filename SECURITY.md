# Security Policy

## Security Practices

Field Network follows security best practices to protect user data and prevent common vulnerabilities.

### Architecture

- **API-First Design**: Frontend never connects directly to the database. All data access goes through the Express.js REST API with proper authentication and authorization.
- **Server-Side Logic**: All sensitive calculations (bounty amounts, fees, verification scoring) are performed server-side only.

### Authentication & Authorization

- **JWT-based authentication** with secure token handling
- **SIWE (Sign-In with Ethereum)** for wallet authentication
- **Granular permissions** via `requireScope` middleware on all protected endpoints
- **Role-based access control** for admin-only operations (dispute resolution)
- **Delegated API tokens** with configurable scopes, spend caps, and expiry

### Input Validation

- **Zod schema validation** on all API inputs
- **Safe URL validation** - URLs must use `http://` or `https://` protocols (prevents `javascript:`, `data:` URI injection)
- **Safe JSON parsing** - All JSON data from database is parsed with schema validation
- **File upload restrictions** - JPEG/PNG only, 10MB max size
- **Username sanitization** - Alphanumeric and underscore only

### Rate Limiting

- Global rate limiting: 100 requests per 15 minutes per IP
- Applied to all API endpoints via `express-rate-limit`

### Secrets Management

- **Server-side only**: API keys, JWT secrets, and private keys are never exposed to the browser
- **Environment variables**: All secrets stored in `.env` files (excluded from git)
- **`NEXT_PUBLIC_` prefix**: Only used for non-sensitive configuration

### Error Handling

- Generic error messages returned to clients (no stack traces or internal details)
- Detailed errors logged server-side only
- Proper HTTP status codes without revealing resource existence (404 vs 403)

### Logging

- Request metadata logged (method, path, status, duration)
- No sensitive data logged (passwords, tokens, request bodies)
- Error details logged privately for debugging

## Dependency Management

Dependencies are regularly updated to patch security vulnerabilities. Current versions (as of Jan 2025):

| Package | Version | Notes |
|---------|---------|-------|
| Prisma | 6.3.0 | Database ORM |
| Express | 4.21.2 | API framework |
| Next.js | 15.1.6 | Frontend framework |
| helmet | 8.0.0 | Security headers |
| express-rate-limit | 7.5.0 | Rate limiting |
| zod | 3.24.1 | Input validation |

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create a public GitHub issue
2. Email security concerns to the project maintainers
3. Include detailed steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

## Security Checklist for Contributors

When submitting code, ensure:

- [ ] No secrets or API keys in source code
- [ ] All user inputs validated with Zod schemas
- [ ] URLs validated to only allow http/https protocols
- [ ] No direct database access from frontend code
- [ ] Sensitive calculations performed server-side
- [ ] Error messages don't expose internal details
- [ ] No sensitive data logged to console
- [ ] Rate limiting in place for new endpoints
- [ ] Authentication required on protected routes

## Wallet Security

### Operator Wallet

The operator wallet is used by the API to execute escrow operations on-chain (assign workers, accept submissions, release funds, process refunds).

#### Key Requirements

1. **Never log or expose the private key**
   - Key is loaded only from environment variable `OPERATOR_PRIVATE_KEY`
   - Never logged to console, files, or external services
   - Not included in error messages or stack traces

2. **Minimal permissions**
   - Operator wallet has only `OPERATOR_ROLE` on the escrow contract
   - Cannot modify contract parameters (admin only)
   - Cannot grant/revoke roles (admin only)

3. **Minimal balance**
   - Keep only enough ETH for gas (~0.05 ETH)
   - Top up periodically via monitoring alerts
   - Do not store USDC in operator wallet

4. **Separate from deployer**
   - Deployer wallet used only for deployment
   - Operator wallet used only for runtime operations
   - Different keys reduces blast radius

#### Code Review Checklist

The escrow service (`packages/api/src/services/escrow.ts`) has been reviewed for:

- [x] Private key loaded only from `process.env.OPERATOR_PRIVATE_KEY`
- [x] No logging of private key or wallet client
- [x] No exposure of key in error messages
- [x] Key validated before use (proper format check)
- [x] Wallet client created lazily on first use
- [x] No hardcoded keys in source code

#### Key Rotation Procedure

If operator key is compromised:

1. **Immediately pause contract** (admin action via Basescan or script)
2. **Generate new operator wallet**
3. **Revoke old wallet's OPERATOR_ROLE** on contract
4. **Grant OPERATOR_ROLE to new wallet** on contract
5. **Update `OPERATOR_PRIVATE_KEY`** in Railway environment
6. **Restart API** to pick up new key
7. **Unpause contract** after verification
8. **Audit recent transactions** for unauthorized actions

### Deployer Wallet

The deployer wallet is used only for contract deployment and admin operations.

#### Security Requirements

1. **Use hardware wallet** for mainnet deployments (Ledger, Trezor)
2. **Geographic key distribution** - Keep backup in separate location
3. **Never store on server** - Deploy from local machine only
4. **Consider multisig** for admin role (Gnosis Safe)

#### Admin Key Compromise

If admin key is compromised:

1. **Deploy new contract immediately** (attacker can pause, change fees, etc.)
2. **Pause old contract** to prevent new deposits
3. **Migrate API** to point to new contract
4. **Allow existing escrows to complete** on old contract
5. **Conduct full security audit** before resuming operations

### Production Wallet Setup

```bash
# Generate operator wallet (do this on secure, air-gapped machine)
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey);"

# Store the private key securely (password manager, hardware backup)
# Add to Railway environment as OPERATOR_PRIVATE_KEY

# Fund operator wallet with ~0.05 ETH for gas
# Monitor balance and top up when < 0.01 ETH
```

### Monitoring

Set up alerts for:

| Event | Threshold | Action |
|-------|-----------|--------|
| Operator ETH balance | < 0.01 ETH | Fund wallet |
| Unexpected role changes | Any | Investigate immediately |
| Failed transactions | > 3/hour | Check wallet status |
| Contract paused | Any | Alert on-call |

---

## Audit Trail

### January 2025 Security Audit

Based on security guidelines review, the following improvements were made:

1. **URL Validation** - Added protocol whitelist to prevent `javascript:` URI injection
2. **JSON Parsing** - Added schema validation to all `JSON.parse()` calls
3. **Dependencies** - Updated Prisma, Next.js, Express to latest stable versions
4. **Documentation** - Added this SECURITY.md file

Security score: **9/10** - See audit report for details.

### January 2026 Wallet Security Audit

Added comprehensive wallet security documentation:

1. **Operator wallet guidelines** - Key handling, minimal permissions
2. **Key rotation procedure** - Step-by-step compromise response
3. **Code review checklist** - Verified escrow service key handling
4. **Production wallet setup** - Secure generation and storage
5. **Monitoring recommendations** - Balance and role change alerts
