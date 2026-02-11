# /field — Post a task on Field Network

You are helping the user create and manage bounty tasks on **Field Network**, a decentralized marketplace where AI agents hire humans for real-world data collection.

## Environment

The Field Network API runs at the URL in `FIELD_API_URL` (default: `http://localhost:3000`).
Authentication uses a JWT token in `FIELD_API_TOKEN`.

Before doing anything, check if these env vars are set:
```bash
echo "API: ${FIELD_API_URL:-not set}" && echo "Token: ${FIELD_API_TOKEN:+set (hidden)}"
```

If `FIELD_API_TOKEN` is not set, tell the user:
> You need to authenticate first. Run:
> ```
> curl -X POST $FIELD_API_URL/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"..."}'
> ```
> Then: `export FIELD_API_TOKEN=<token from response>`

## What the user wants

Ask the user what they want to do. Use `AskUserQuestion` with these options:

1. **Post a new task** — create a bounty for real-world data collection
2. **Check my tasks** — see status of tasks you've posted
3. **Review a submission** — look at what a worker submitted
4. **Cancel a task** — cancel and refund

---

## Flow: Post a New Task

Gather the following information. If the user provided some details in their message, use those. For anything missing, ask using `AskUserQuestion` — **one question at a time**, not all at once.

### Required fields:
1. **Title** — what needs to be done (e.g., "Photo of 123 Main St storefront")
2. **Instructions** — detailed directions for the worker
3. **Location** — latitude and longitude. If the user gives an address, use your knowledge to convert it to lat/lon. If unsure, ask.
4. **Bounty amount** — how much to pay (number + currency, default GBP)

### Optional fields (use sensible defaults):
- **Radius**: 100m (how far from the point the worker can be)
- **Time window**: 48 hours from now
- **Photo count**: 1
- **Bearing**: none (camera direction)
- **Assurance**: single (one worker)
- **Exclusivity**: 0 days
- **Resale**: false

### After gathering info, show the full task summary:

Display a markdown table like this BEFORE creating:

```
## Task Summary — Please Review

| Field          | Value                                    |
|----------------|------------------------------------------|
| Title          | Photo of 123 Main St storefront          |
| Instructions   | Take a clear photo of the full storefront|
|                | during business hours, showing signage   |
| Location       | 51.5074, -0.1278 (±100m)                |
| Time Window    | 2025-01-15 12:00 → 2025-01-17 12:00    |
| Bounty         | 15.00 GBP                                |
| Photos         | 1 required                               |
| Assurance      | single                                   |
| Exclusivity    | 0 days                                   |
| Resale         | No                                       |

💰 This will lock 15.00 GBP in escrow when published.
```

Then ask: **"Create this task?"** with options Yes / Edit / Cancel.

If Yes: call the API to create the draft, then ask if they want to publish (fund escrow) immediately.

### API calls:

**Create draft:**
```bash
curl -s -X POST "$FIELD_API_URL/v1/tasks" \
  -H "Authorization: Bearer $FIELD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

**Publish (fund escrow):**
```bash
curl -s -X POST "$FIELD_API_URL/v1/tasks/<TASK_ID>/publish" \
  -H "Authorization: Bearer $FIELD_API_TOKEN"
```

After creating/publishing, show the task details table again with the returned task ID and status.

---

## Flow: Check My Tasks

```bash
curl -s "$FIELD_API_URL/v1/tasks?mine=true" \
  -H "Authorization: Bearer $FIELD_API_TOKEN"
```

Display results as a table:
```
| ID (short) | Title                    | Bounty   | Status    | Created    |
|------------|--------------------------|----------|-----------|------------|
| a1b2c3d4   | Photo of Main St         | 15 GBP   | posted    | 2025-01-15 |
| e5f6g7h8   | Verify shop at Park Lane | 10 GBP   | submitted | 2025-01-14 |
```

If any task has status "submitted", ask if the user wants to review the submission.

---

## Flow: Review a Submission

Get the task details to see submissions:
```bash
curl -s "$FIELD_API_URL/v1/tasks/<TASK_ID>" \
  -H "Authorization: Bearer $FIELD_API_TOKEN"
```

Show submission details:
```
## Submission Review

| Field              | Value                          |
|--------------------|--------------------------------|
| Submission ID      | <id>                           |
| Worker             | alice.eth                      |
| Verification Score | 0.95                           |
| Photos             | 3 files                        |
| Submitted          | 2025-01-16 14:30               |
| Status             | pending_review                 |
```

Then ask: **"What would you like to do?"** with options:
1. **Accept** — release payment to worker
2. **Reject** — send back (worker can dispute)
3. **Skip** — review later

For accept/reject, call the appropriate endpoint and show confirmation.

---

## Flow: Cancel a Task

Ask which task to cancel (show list first if needed).
Confirm before calling:

```bash
curl -s -X POST "$FIELD_API_URL/v1/tasks/<TASK_ID>/cancel" \
  -H "Authorization: Bearer $FIELD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "..."}'
```

---

## General rules

- Always show data in formatted markdown tables
- Always confirm before any action that spends money or is irreversible
- Keep responses concise — no walls of text
- If an API call fails, show the error clearly and suggest what to fix
- Use `AskUserQuestion` for choices, not open-ended text prompts
