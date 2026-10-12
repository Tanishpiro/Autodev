# ⚡ DeliveryFlow — CRM → Project Delivery Automation Engine

**Team Knowledge Seekers · CodeX 3.0**

When a CRM opportunity is marked **Won**, DeliveryFlow validates the deal and automatically creates a project: it copies customer and scope details, picks a workflow template, generates milestones and due dates, assigns tasks to the least-loaded person with the right skill, notifies every stakeholder, then tracks progress and flags risk — all on one dashboard, with a full audit log.

## Architecture

```
 External CRM ──signed webhook──▶ ┌─────────────────────── Express API ────────────────────────┐
 React UI ──REST + JWT──────────▶ │ routes ─▶ crm.js (stage change) ─▶ queue (BullMQ | in-proc) │
                                  │                                        │                     │
                                  │   risk scanner (cron) ◀── engine.js ◀──┘ (one DB transaction)│
                                  └───────┬───────────────────────────┬─────────────────────────┘
                                          ▼                           ▼
                                     PostgreSQL                outbound webhooks (HMAC)
```

| Concern | Implementation |
|---|---|
| Trigger | `crm.changeStage` → on `Won`, enqueue `opportunity.won` (BullMQ with retries if Redis is reachable, otherwise in-process) |
| Validation | customer present, scope not empty, value > 0. On failure: audit entry + alert to managers/owner; fix the data and press **Fix data & retry** |
| Idempotency | `projects.opportunity_id` is `UNIQUE` and the deal row is locked `FOR UPDATE`, so replays/duplicate webhooks never create duplicate projects |
| Atomicity | project + milestones + tasks + notifications + audit entry are one transaction (all or nothing) |
| Assignment | per-task role → least-utilised active user with that skill (`open tasks / capacity`); falls back to any delivery user |
| Templates | `workflow_templates` (JSON milestones with day offsets, roles, tasks), chosen by deal `type`, falls back to `default`; editable in the UI |
| Progress | task status drives milestone status → project completion automatically |
| Risk | scanner (every `RISK_SCAN_MINUTES`, or on demand) marks overdue/blocked projects **At Risk**, alerts the manager, auto-recovers |
| Notifications | in-app per user + outbound signed webhooks (`project.created`, `project.at_risk`, `opportunity.stage_changed`) |
| Security | JWT + bcrypt, role-based access (admin / manager / sales / delivery), optional Firebase ID-token verification, HMAC-verified inbound webhooks |
| Audit | every automated and manual action is written to `audit_logs` |

## Run it

### Option A — Docker (everything)
```bash
docker compose up --build
# UI → http://localhost:8080      API → http://localhost:4000
```

### Option B — local
Requires Node 18+ and PostgreSQL (Redis optional).
```bash
# backend
cd backend && cp .env.example .env && npm install
createdb deliveryflow            # or edit DATABASE_URL in .env
npm run seed && npm start        # http://localhost:4000

# frontend (new terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Demo logins (password `password123`): `admin@demo.com`, `manager@demo.com`, `sales@demo.com`, `dev1@demo.com`.

## 2-minute demo script
1. Sign in as **sales@demo.com** → *Deals* → move **Customer Portal Build** to **Won**.
2. A toast confirms the project, milestones and tasks were created and assigned automatically. Click **View project**.
3. Sign in as **manager@demo.com** → *Dashboard* (pipeline, workload, upcoming milestones) and *Notifications*.
4. Create a deal **without scope** and mark it Won → blocked with a clear reason; use **Fix data & retry**.
5. Simulate an external CRM: `./demo-webhook.sh` → a new deal arrives and a project is auto-created.
6. In a project, mark tasks Done → progress rises, milestones/project complete. *Audit log → Run risk scan* shows risk flagging.

## API overview
`POST /api/auth/login|register` · `GET/POST /api/opportunities` · `POST /api/opportunities/:id/stage` · `POST /api/opportunities/:id/retry-delivery` · `GET /api/projects[/:id]` · `PATCH /api/tasks/:id` · `GET /api/dashboard` · `GET/PUT /api/templates[/:type]` · `GET /api/audit` · `POST /api/risk/scan` · `POST /api/webhooks/crm` (header `x-signature` = hex HMAC-SHA256 of the raw body using `WEBHOOK_SECRET`) · `GET/POST/DELETE /api/webhook-subscriptions`

## Tests
```bash
cd backend && TEST_DATABASE_URL=postgres://crm:crm@localhost:5432/deliveryflow_test npm test
```
9 end-to-end tests against real PostgreSQL: auth, Won→project, load-balanced assignment, idempotency, validation failure, role guards, signed webhook + replay, progress/completion, risk scan, dashboard/audit. (Tests wipe the test database.)

## Firebase Auth (optional)
Set `FIREBASE_PROJECT_ID` and the API also accepts Firebase ID tokens for users whose email exists in the `users` table.
