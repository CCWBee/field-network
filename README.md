# Field Network

A marketplace for verifiable real-world observations. Requesters post tasks, collectors go and observe, and trust is earned through a visible track record rather than asserted. Payment sits in escrow until the work checks out. The founding idea is a plain one: trust should be observable, not claimed.

A TypeScript monorepo, with the product, design and policy thinking kept alongside the code rather than in someone's head.

## Layout

- `packages/` — application code (API and clients)
- `docs/` — supporting documentation
- `spec.md`, `PRODUCT-PLAN.md`, `SPRINT-PLAN.md` — the planning
- `TERMS.md`, `PRIVACY.md`, `EULA.md`, `USAGE-POLICY.md`, `SECURITY.md` — the policies

## Running it

Install with `npm install`. The stack is wired up in `docker-compose.yml`; `DEPLOYMENT-RUNBOOK.md` and `PRODUCTION.md` cover deployment.
