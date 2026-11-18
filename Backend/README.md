# transacty-teamdesk-backend

## What is this project?

**teamdesk** is the backend for a small-company employee portal, built with
**Fastify + TypeScript + PostgreSQL (Drizzle ORM)**. It serves
`http://127.0.0.1:3000` in development and exposes a JSON API consumed by the
teamdesk frontend.

Access is hard-gated to company accounts only:

- Login is **Google Workspace (OIDC) only** — email domain must be exactly
  `transacty.ai` or `n23digitals.com`, the Google `hd` claim must match, and the
  person must be **pre-provisioned and active** in the `employees` table.
- Sessions are application-owned, database-backed opaque tokens (never JWTs);
  the browser holds an HttpOnly cookie, the database stores only a SHA-256 hash.
- Two roles exist: **admin** and **employee**.

## Why is it used?

It is the single source of truth for the company's internal HR-style workflows:

- **Employee management** — admins provision colleagues, manage roles/active
  state, and every sensitive change is audited.
- **Leave requests** — employees submit date ranges; overlapping submissions are
  prevented by database constraints.
- **Daily updates** — one short work report per employee per day.
- **Holidays** — company-wide holiday calendar managed by admins.
- **Attendance** — explicit check-in/check-out with trusted database time and
  per-employee timezones, independent of application login.

Everything runs locally (Docker Compose PostgreSQL + Node), with no external
SaaS dependencies.

## Tech stack

| Layer | Technology |
| ----- | ---------- |
| Runtime | Node.js (>= 22) + TypeScript (strict mode) |
| HTTP | Fastify 5 (+ `@fastify/cookie`, `@fastify/rate-limit`) |
| Auth | Google OIDC via `openid-client` (PKCE S256, state, nonce) |
| Database | PostgreSQL 17 (Docker Compose for local development) |
| ORM | Drizzle ORM + drizzle-kit migrations |
| Validation | zod (environment + request/response schemas) |
| Testing | Vitest (dedicated `teamdesk_test` database) |

## Developer installation & running the dev server

Requirements: Node.js >= 22, npm, Docker (or any local PostgreSQL).

### PostgreSQL via Docker

The project ships a `docker-compose.yml` that runs PostgreSQL 17 with a
dedicated `teamdesk` user and database, and persistent data in a named volume
(`pgdata`). Use it if you don't have permission to create databases (or users)
on a shared PostgreSQL instance — everything runs inside the container, so no
superuser rights on your machine's PostgreSQL are needed:

```bash
npm run db:up      # starts the container (teamdesk-db on port 5432)
npm run db:down    # stops it; data persists in the pgdata volume
```

Point `DATABASE_URL` in `.env` at it (the default matches this setup):

```
DATABASE_URL=postgresql://teamdesk:teamdesk@127.0.0.1:5432/teamdesk
```

If port 5432 is already taken locally, change the host side in
`docker-compose.yml` (e.g. `"5433:5432"`) and update `DATABASE_URL` accordingly.

Alternatively, any existing PostgreSQL works as long as the `teamdesk`
database (and, for tests, the separate `teamdesk_test` database) can be
created with the credentials in `DATABASE_URL`.

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file from the template and fill it in
cp .env.example .env
#    Required: DATABASE_URL (matches docker-compose.yml)
#    Required for real login: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#    GOOGLE_ALLOWED_HD (documented in .env.example)

# 3. Start local PostgreSQL
npm run db:up

# 4. Apply database migrations
npm run db:migrate

# 5. Create the first admin (CLI only — never exposed over HTTP)
npm run bootstrap:admin -- <company-email> --name "Full Name" --timezone "Asia/Kolkata"
#    -> active admin row with NO Google identity bound yet;
#       the identity binds automatically on that person's first verified login.
#       --name and --timezone are optional; an omitted timezone leaves the row
#       unconfigured (attendance stays blocked until an admin sets it).

# 6. Start the backend (development mode, file watching)
npm run dev
#    -> listens on http://127.0.0.1:3000

# 7. Verify
curl http://127.0.0.1:3000/health        # -> {"status":"ok"}
```

Then open `http://127.0.0.1:3000/auth/login` in a browser and sign in with a
provisioned company Google account.

### Useful commands

| command | purpose |
| ------- | ------- |
| `npm run dev` | development server with file watching (tsx) |
| `npm run build` | production TypeScript build to `dist/` |
| `npm start` | run the production build (`node dist/server.js`) |
| `npm run typecheck` | strict TypeScript check, no emit |
| `npm test` | integration tests (vitest, dedicated `teamdesk_test` DB) |
| `npm run check:env` | validate `.env`, show which credentials are set (no secrets) |
| `npm run bootstrap:admin` | create the first admin (email argument required) |
| `npm run db:up` / `db:down` | start / stop local PostgreSQL (data persists) |
| `npm run db:generate` | generate Drizzle migrations (after schema changes) |
| `npm run db:migrate` | apply Drizzle migrations explicitly |
| `npm run db:studio` | Drizzle Studio against the local database |

## Features implemented

### Authentication & security
- Google OIDC authorization-code flow with PKCE S256, state, and nonce.
- Database-backed opaque sessions (30-min idle / 12-h absolute expiry), logout
  revocation, immediate access kill on deactivation.
- Session-bound CSRF tokens + exact-Origin validation on every mutation;
  `Cache-Control: no-store` on all auth/employee/business responses.
- Per-IP rate limiting; logs never contain cookies, tokens, or personal values.

### Employee management
- Admin provisioning with **required IANA work timezone** (`Asia/Kolkata`,
  `Africa/Lagos`, any zone supported by both Node and PostgreSQL), normalized
  company emails, and identity binding on first login.
- Self-service is name-only; admin PATCH covers name/email/isActive/timezone.
- Timezone changes are admin-only, audited, and blocked while an attendance
  session is open.
- Role promotion/demotion and (de)activation revoke sessions in the same
  transaction; last-admin protection; full audit trail
  (`employee_audit_events`).

### Leave requests
- Submission-only (approval/balances out of scope), owner-scoped PATCH edits,
  inclusive-overlap prevention (409), date-range filters, pagination.

### Daily updates
- One update per employee per work date (unique index → 409), future dates
  rejected using the company timezone, backdating allowed, owner-only edits.

### Holidays
- Everyone views; admins create/edit/delete with transactional audits
  (`holiday_audit_events`); one holiday per date; deletion-safe attribution.

### Attendance
- Explicit `POST /attendance/check-in` and `POST /attendance/check-out`
  (no request body accepted), fully independent of app login/logout.
- Trusted time: ONE PostgreSQL `clock_timestamp()` captured after locks drives
  both `checked_in_at` and the employee-local `work_date` — the client clock and
  server timezone are never consulted.
- `timezone_at_check_in` snapshot keeps history stable across later timezone
  changes; timestamps are returned as ISO-8601 UTC for the frontend to format.
- Exactly one open session per employee and one record per local work date
  (database indexes); a forgotten checkout stays open and blocks the next
  check-in until an explicit checkout — no auto-close, no corrections.
- `GET /attendance/status` (state flags for the frontend), `GET /attendance/me`
  (own history), `GET /attendance` (admin, company-wide) — all paginated,
  filtered by stored local work dates, and audited transactionally.

### Testing
- Vitest integration suites against a dedicated `teamdesk_test` database
  (created and migrated automatically by the test global setup): real
  uniqueness constraints, lock contention, concurrency races, CSRF/Origin
  policy, audit atomicity. All suites pass: 162 tests across 11 files.
