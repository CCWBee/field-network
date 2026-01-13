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

## Audit Trail

### January 2025 Security Audit

Based on security guidelines review, the following improvements were made:

1. **URL Validation** - Added protocol whitelist to prevent `javascript:` URI injection
2. **JSON Parsing** - Added schema validation to all `JSON.parse()` calls
3. **Dependencies** - Updated Prisma, Next.js, Express to latest stable versions
4. **Documentation** - Added this SECURITY.md file

Security score: **9/10** - See audit report for details.
