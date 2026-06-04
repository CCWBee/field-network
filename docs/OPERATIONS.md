# Operations runbook

What to do when things break. Replaces the previous `LAUNCH-CHECKLIST.md`
(which was 243 unchecked boxes) and supplements `DEPLOYMENT-RUNBOOK.md`.

## On-call basics

- **Status check**: `GET /health` returns 200 ok, 503 degraded. Reports DB
  and Redis status separately.
- **Logs**: pino JSON to stdout in production. Aggregate via Railway / your
  log aggregator.
- **Alerts**: `ALERT_WEBHOOK_URL` (Slack/Discord/PagerDuty webhook) for the
  webhook channel. The email channel is a placeholder (`alerts.ts:144`) and
  does not actually send.
- **Sentry**: server-side enabled when `SENTRY_DSN` is set. Web-side Sentry
  is currently not wired up (the previous wrapper imported a config file
  that didn't exist; removed in the docs honesty pass).

## Common breakages

### "API won't start"

Check the logs for a `FATAL` line. Most likely:

- `JWT_SECRET` is missing or under 32 chars (refused at boot in prod).
- `CORS_ORIGINS` is missing (refused at boot in prod).
- Postgres is unreachable. Verify `DATABASE_URL` and that the DB is up.
- Redis is unreachable. The API will still boot without Redis, but token
  blacklist and BullMQ are disabled. If `BLACKLIST_FAIL_MODE=closed` (prod
  default), authenticated requests will be rejected — switch to `open` for
  emergency relief, then fix Redis.

### "Workers' tasks aren't expiring"

The claim-expiry job runs every 5 minutes in the worker process. Check:

- `npm run dev:worker` is running (separate from `dev:api`).
- Redis is up (BullMQ requires it).
- Look at the `worker` service logs for cron tick lines.

### "Disputes stuck at tier 2"

If the jury hasn't voted in 48 hours, the dispute-tier-deadline job (also in
the worker process, every 5 minutes) should detect deadline-passed disputes
and either finalise the jury vote or auto-escalate to tier 3 (zero-vote case).

If a dispute is stuck:

1. Check the worker process is running.
2. Look at `Dispute.tier2Deadline` — has it passed?
3. Manually trigger via `services/disputes.checkJuryVotingComplete(disputeId)`
   from a one-off script.

### "Operator wallet ran out of ETH"

Symptom: on-chain calls (assignWorker, release, slashStake) fail with
insufficient gas. The webhook alert with `ALERT_MIN_OPERATOR_BALANCE` should
fire before this happens.

1. Send ETH to the operator wallet (top up to ~0.05 ETH).
2. Retry the queued operations (they're not auto-retried; this is a manual gap).

### "Token blacklist not working / users not logged out"

Check Redis. `isBlacklistAvailable()` returns false if `REDIS_URL` is unset.
With `BLACKLIST_FAIL_MODE=closed` (prod default), blacklist failures cause
auth rejections (safer); with `open`, failures silently allow tokens through.

### "S3 uploads failing"

- Verify `S3_BUCKET`, `S3_REGION`, credentials.
- Check bucket CORS allows the API host.
- For Cloudflare R2: ensure `S3_ENDPOINT` is set to the R2 endpoint.

### "CI is green but something's broken"

Should not happen after the Phase 3 remediation. If it does:

- Check no new step has `continue-on-error: true`.
- Check no test file has `.only` (CI guard should catch but worth verifying).
- Check the vitest include glob still covers `src/**/*.test.ts` —
  `vitest.config.ts`.

## Operator key rotation

See `SECURITY.md` ("Wallet operations" section).

## Contract pause / unpause

Pause:

```bash
# From a multisig signer with admin role
cast send $ESCROW_CONTRACT_ADDRESS "pause()"
```

Or via Basescan write tab if no CLI. Unpause is `unpause()`.

When to pause:

- Suspected operator key compromise.
- Discovered bug allowing fund loss.
- Audit/incident response.

## Database backups

`scripts/backup-db.sh` runs `pg_dump` via docker-exec on a local container.
For production:

- Use Railway's built-in Postgres backups OR
- Schedule `pg_dump` against `$DATABASE_URL` to S3.

Verify backups by restoring to a staging Postgres instance at least monthly.

## Rolling back a bad deploy

API (Railway):

```bash
railway rollback
```

Web (Vercel): use the dashboard "Promote previous deployment".

Contracts: there is no rollback. Deploy a new contract, migrate API config
to point at it, and let in-flight escrows complete on the old contract.
Pause the old contract if it's actively broken.

## Going from staging to mainnet

Pre-deploy checklist (replace the 243-box LAUNCH-CHECKLIST):

1. CI green on the commit you intend to deploy.
2. Contract tests pass: `npm test --workspace=@field-network/contracts`.
3. Operator wallet generated separately from deployer; funded with gas.
4. Multisig (Gnosis Safe) deployed on Base and verified.
5. `MULTISIG_ADDRESS` set in deploy env.
6. Deploy contracts to Sepolia first; run smoke + load tests against testnet for >24h.
7. Deploy contracts to mainnet; verify role handoff state (`hasRole(DEFAULT_ADMIN_ROLE, multisig)` true, deployer false).
8. Update API env to point at mainnet contracts.
9. Smoke test: deposit → claim → submit → accept → release on mainnet with small amount.
10. Monitor first 24h closely.

## Reporting incidents

For security incidents see `SECURITY.md` ("Reporting a vulnerability").

For non-security operational incidents, file an issue on the repo with logs
and a one-line summary in the title.
