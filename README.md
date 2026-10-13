# DeliveryFlow — CRM to Project Delivery

A runnable Node.js demo for turning CRM opportunities into delivery projects. The repository has been repaired to remove scripts and Docker build contexts that referenced missing `backend/` and `frontend/` directories. The app now uses Node.js built-ins and has no third-party runtime dependencies.

## Deploy on Netlify
The site deploys to Netlify with no build step: static files are served from `public/`, and every `/api/*` request is handled by the Netlify Function in `netlify/functions/api.ts`. Data lives in Netlify Database (managed Postgres), accessed with Drizzle ORM. The schema is in `db/schema.ts`, and migrations in `netlify/database/migrations/` are applied automatically on deploy. The seed migration adds the two demo opportunities.

Set a strong `WEBHOOK_SECRET` environment variable in the Netlify UI before using the CRM webhook in production.

To run the Netlify version locally: `netlify dev`.

After changing `db/schema.ts`, generate a migration with `npx drizzle-kit generate --name <change_name>`.

## Requirements
- Node.js 18 or newer
- Docker (optional)

## Run locally
```bash
npm start
```
The standalone Node server (`server.js`) is kept for local and Docker use and stores data in `data/store.json`. Open http://localhost:4000. Health check: http://localhost:4000/api/health. For watch mode use `npm run dev`.

On Windows, double-click `run-app.bat` or run `npm start` in PowerShell. You do not need separate frontend/backend terminals.

## Run with Docker
```bash
docker compose up --build
```
Open http://localhost:4000. Docker volume persists data.

## Features
- Dashboard and opportunity pipeline.
- Create opportunities in the UI.
- Mark a valid opportunity Won to create a project and starter tasks (idempotent per opportunity).
- Update task statuses; all tasks marked Done completes a project.
- Audit log and manual risk scan.
- Persistence in Netlify Database when deployed (or `data/store.json` with the standalone server).
- Signed inbound CRM webhook.

## API
- `GET /api/health`
- `GET /api/dashboard`
- `GET/POST /api/opportunities`
- `POST /api/opportunities/:id/stage` body `{"stage":"Won"}`
- `GET /api/projects`
- `PATCH /api/tasks/:id` body `{"status":"Done"}`
- `GET /api/audit`
- `POST /api/risk/scan`
- `POST /api/webhooks/crm` requires `x-signature` with the hex HMAC-SHA256 of the exact raw request body.

For production, set a strong `WEBHOOK_SECRET`; the default is only for local demos.

## Checks
```bash
npm run check
npm test
```

## Important scope note
This is a working lightweight replacement for the broken scaffold. It does not implement the full enterprise feature list previously described (JWT accounts, PostgreSQL transactions, Redis queues, Firebase auth, or outbound webhook subscriptions). Those features must be added and tested separately rather than implied by missing source files.
