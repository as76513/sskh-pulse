# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

SSKH Pulse is an attendance PWA for Shubh Shree Knowledge Hub Private Limited: location-based check-in/out, auto late/half-day marking, leaves, payslips, document upload, admin regularization, and resignation flow.

Stack: React (Vite) PWA frontend + Node/Express backend running on AWS Lambda behind API Gateway + DynamoDB + S3, provisioned via Terraform (`infra/`). There is no test suite, linter, or CI config in this repo — do not assume `npm test`/`npm run lint` exist. It is web-only — installable via "Add to Home Screen" on mobile/desktop Chrome, not packaged for app stores (no TWA/Capacitor wrapper).

## Commands

Backend (`backend/`) — local dev runs against DynamoDB Local, not real AWS:
```bash
cd infra && docker compose up -d && ./local-tables.sh   # DynamoDB Local + tables/GSIs
cd ../backend
cp .env.example .env      # defaults already point DYNAMO_ENDPOINT at DynamoDB Local; needs AWS_PROFILE=shubhshreekh-dev configured locally (for real S3 calls — DynamoDB Local ignores credentials)
npm install
npm run seed               # seeds a default office + ADMIN001/EMP001 accounts
npm run dev                # node --watch src/server.js, http://localhost:4000
npm start                  # plain node src/server.js (production/local only — Lambda uses src/lambda.js instead)
```

Frontend (`frontend/`):
```bash
cp .env.example .env      # set VITE_API_URL (defaults to http://localhost:4000/api)
npm install
npm run dev               # vite dev server, http://localhost:5173
npm run build             # production build to dist/
npm run preview           # preview the production build
```

Infra (`infra/`) — see `infra/README.md` for the full walkthrough:
```bash
export AWS_PROFILE=shubhshreekh-dev            # every command below needs this — never static keys
cd bootstrap && terraform init && terraform apply && terraform output state_bucket_name && cd ..  # one-time per environment
cp backend.hcl.example backend.hcl             # set bucket = the name from above
cp terraform.tfvars.example terraform.tfvars   # set jwt_secret + frontend_origin
./build_lambda.sh                              # zips backend/src + prod node_modules — must run before first apply
terraform init -backend-config=backend.hcl && terraform plan && terraform apply
```
Re-run `./build_lambda.sh && terraform apply` after every backend code change — `terraform plan/apply` reads `build/lambda.zip`'s hash directly, so a stale zip means a stale deploy, not an error.

There's no root-level package.json — backend, frontend, and infra are independent; run commands from inside each directory.

Default seeded logins (from `npm run seed`): username `seed.admin` (emp_code `ADMIN001`), username `seed.employee` (emp_code `EMP001`) — deliberately synthetic identities on the real company domain, not a real person's name, so they can't collide with one. `emp_code` itself is never a login credential — see Auth flow below. Password is whatever `SEED_PASSWORD` was set to at seed time (see `backend/.env.example`; must satisfy the shared pool's policy — 8+ chars, upper+lower+number+symbol); never write the actual value into a file in this repo, it's public. `seed.js` provisions each seeded employee as a real Cognito user too (idempotently — never overwrites a password for a user that already exists there). The seeded office has placeholder coordinates (`0,0`) — there's no admin UI to edit an office's lat/long, so real coordinates are set directly via `aws dynamodb update-item` (see the pattern in `infra/local-tables.sh` / `infra/README.md`).

Geolocation requires HTTPS on real devices, but works over plain HTTP on `localhost`. To test check-in/out from a phone on the same network against a local backend, the backend's `CLIENT_ORIGIN` and the frontend's `VITE_API_URL` need to point at your machine's LAN IP, not `localhost`.

## Architecture

**Backend** is a thin layered Express app, all ESM (`"type": "module"`), runnable both as a long-lived local process and as a Lambda:
- `src/app.js` — the actual Express app: CORS, JSON body parsing, `/health`, mounts everything under `/api`, one central error handler that logs and returns a generic 500. Has no `listen()` call — it's just the configured app instance.
- `src/server.js` — local dev entrypoint: imports `app.js` and calls `.listen(PORT)`.
- `src/lambda.js` — Lambda entrypoint: wraps the same `app.js` with `serverless-http`, exported as `handler`. This is `infra/lambda.tf`'s `handler = "src/lambda.handler"`. Any change to routing/middleware belongs in `app.js`/`routes/`, not duplicated between the two entrypoints.
- `src/routes/index.js` — single flat router; every route composes `authRequired` and optionally `adminOnly` middleware, and every handler is wrapped in `wrap()` (a `Promise.resolve().catch(next)` helper) so async errors reach the central handler. This is the fastest way to see the full API surface.
- `src/controllers/*` — one file per domain (auth, attendance, leave, admin, files). No service/repository layer; controllers call the AWS SDK v3 Dynamo commands (`GetCommand`/`PutCommand`/`UpdateCommand`/`QueryCommand`/`ScanCommand`/`BatchGetCommand`) directly, imported from `config/dynamo.js`.
- `src/middleware/auth.js` — `authRequired` verifies the JWT and sets `req.user` (contains `emp_code`, `role`); `adminOnly` checks `req.user.role === 'admin'`.
- `src/config/dynamo.js` — the shared `DynamoDBDocumentClient` and the `Tables` map (`${DYNAMO_TABLE_PREFIX}-employees`, etc.). If `DYNAMO_ENDPOINT` is set it points at DynamoDB Local instead of real AWS — **never set this env var in the Lambda's Terraform config**, only in local `.env`.
- `src/config/seed.js` — idempotent seed script (conditional `PutCommand` with `attribute_not_exists`, mimicking `ON CONFLICT DO NOTHING`) for the default office + ADMIN001/EMP001. Points at whatever `DYNAMO_TABLE_PREFIX`/`DYNAMO_ENDPOINT`/`AWS_REGION` is in the environment — same script seeds DynamoDB Local or real AWS depending on those vars.
- `src/utils/geo.js` — Haversine `distanceMeters` / `isWithinGeofence`, used by attendance controller to enforce the office geofence.
- `src/utils/s3.js` — presigned PUT/GET URL generation for direct browser-to-S3 upload/download (documents, payslips). No files ever pass through Lambda itself.

**Data model** — 7 DynamoDB tables, each shaped around its actual query patterns (defined in both `infra/dynamodb.tf` for real AWS and `infra/local-tables.sh` for DynamoDB Local — **keep these two in sync**, there's no single source of truth between them):
- `employees` — PK `emp_code`. GSI `email-index` (PK `email`) is used both by `createEmployee`'s uniqueness check and, more importantly, by `login` — see Auth flow below. No `password_hash` field anymore; passwords live in Cognito.
- `offices` — PK `id`. Small reference table; no admin UI to edit lat/long, edit via `aws dynamodb update-item` directly.
- `attendance` — PK `emp_code`, SK `work_date` ('YYYY-MM-DD'). Check-in/out/absence-marking all key off this exact composite, keyed by the server's local date (`new Date().toISOString().slice(0,10)`), never a client-supplied date. `checkIn`/`checkOut` use `UpdateCommand` with `ConditionExpression: attribute_not_exists(check_in)` / `attribute_exists(check_in) AND attribute_not_exists(check_out)` — catch `ConditionalCheckFailedException` for the "already checked in/out" 409s rather than pre-reading and racing. `markAbsence` deliberately branches on whether the item exists first (`PutCommand` for a fresh absent day vs. `UpdateCommand` touching only `absence_reason` on an existing day) — do not collapse this into a single upsert, it preserves a day's existing `status` (e.g. already `present`) exactly like the original SQL's `ON CONFLICT DO UPDATE SET absence_reason` did.
- `leaves` — PK `id` (uuid). GSI `emp_code-index` (PK `emp_code`, SK `applied_at`) for `myLeaves`; GSI `status-index` (PK `status`, SK `applied_at`) for admin `pendingLeaves` — this GSI automatically reflects a leave leaving the `pending` bucket once decided, no separate bookkeeping needed. `decideLeave` uses `ConditionExpression: #s = :pending` so a leave can't be decided twice; balance deduction on approval is an atomic `SET leave_balance = leave_balance - :days`, not a read-then-write.
- `documents` — PK `id` (uuid). GSI `emp_code-index` (PK `emp_code`, SK `uploaded_at`) for `myDocuments`. `downloadDoc` does a plain `GetCommand` by id then checks `Item.emp_code === req.user.emp_code` in application code (Dynamo has no composite-key-by-two-non-key-attributes query).
- `payslips` — PK `emp_code`, SK `pay_month` ('YYYY-MM'). This *is* the uniqueness constraint (upsert via plain `PutCommand`, no conditional needed). The `/payslips/:id/download` route's `:id` is actually `pay_month` — `myPayslips` deliberately returns `{ id: pay_month, ... }` so the frontend's generic `download('payslips', p.id)` (see `frontend/src/pages/Documents.jsx`) keeps working unmodified; don't rename this field without checking that call site.
- `resignations` — PK `emp_code`, SK `submitted_at` (ISO timestamp). `myResignation` queries descending with `Limit: 1` for "latest."

**Auth flow**: passwords are NOT stored by this app — they live in an existing, shared Cognito User Pool (`ap-south-1_Gj6XcAi9D`) owned by a different, unrelated app that already has its own real users, whose real emails already follow `firstname.lastname@<company domain>`. This app never modifies that pool's schema/settings, only owns its own app client inside it (`infra/cognito.tf`, `aws_cognito_user_pool_client.sskh_pulse`), created purely additively. The login screen collects a **username** (e.g. `john.doe`), never an email — `usernameToEmail` (`config/cognito.js`) turns that into `john.doe@${COGNITO_EMAIL_DOMAIN}` **by fixed convention alone, with no lookup against our own table first** — `authController.login` sends that straight to Cognito's `AdminInitiateAuth`. This ordering is deliberate: it's what lets anyone already in the shared pool authenticate with whatever password they already have, with zero setup on this app's side, rather than requiring an admin to pre-register them before Cognito is ever consulted. Only *after* Cognito confirms the password does `login` look up the `employees` table by that same email (via `email-index`) to find the emp_code/role/name — if there's no match, that's a 404 ("No employee record found... Contact your admin"), deliberately distinct from the 401 Cognito-auth-failure case, and there is **no auto-provisioning**: an admin must explicitly run `createEmployee` afterward. Once Cognito confirms the password, this app still signs its **own** JWT (`JWT_SECRET`, `JWT_EXPIRES`) containing `emp_code` + `role`, exactly as before Cognito was introduced — `authRequired`/`me`/every other controller are completely unaware Cognito exists. `changePassword` does the same old-password check via `AdminInitiateAuth`, then `AdminSetUserPassword` for the new one — Cognito's pool policy (8+ chars, upper+lower+number+symbol) applies, not any check in this app's code. `createEmployee` calls `ensureCognitoUser`, which is a no-op against the temp password if that email is already a real Cognito user (never clobbers an existing person's password) and only actually sets one for a genuinely new user. The frontend stores this app's own JWT in `localStorage` (`sskh_token`) and attaches it as `Authorization: Bearer` on every request via `frontend/src/api/client.js`'s `api()` helper — unchanged. No local Cognito emulator exists; local dev hits the real shared pool too (same pattern as S3 — see `backend/.env.example`), which means **a local `changePassword` test changes a real person's real password** — there's no sandboxing between "local dev" and "production" identity.

**Infra** (`infra/`) — Terraform, no EC2/RDS:
- Remote state lives in S3, with S3-native locking (`use_lockfile`, Terraform >= 1.11 — no DynamoDB lock table). The bucket itself is created once by `infra/bootstrap/` (a separate, tiny Terraform config with its own **local** state — it can't store its state in the bucket it's creating). Real deploys run `terraform init -backend-config=backend.hcl` (gitignored; copy from `backend.hcl.example` and fill in the bucket name from `bootstrap`'s output) before `plan`/`apply`. See `infra/README.md`.
- `dynamodb.tf` — the 7 tables/GSIs described above, `PAY_PER_REQUEST` billing.
- `cognito.tf` — `var.cognito_user_pool_id` points at the existing, shared, externally-owned pool (not managed here); the only resource created is this app's own `aws_cognito_user_pool_client`. Never add a resource here that modifies the pool itself.
- `lambda.tf` — the Lambda function; reads `build/lambda.zip` (produced by `build_lambda.sh`, not by Terraform itself) and its `source_code_hash`, so the zip must exist before `plan`/`apply`. Sets `JWT_SECRET`/`JWT_EXPIRES`/`DYNAMO_TABLE_PREFIX`/`S3_BUCKET`/`CLIENT_ORIGIN` as Lambda env vars — deliberately does **not** set `AWS_REGION` (Lambda provides it automatically; setting it manually is rejected as a reserved name) and never sets any credentials — production always authenticates as `aws_iam_role.lambda_exec`, picked up automatically inside Lambda. Static keys / `AWS_PROFILE` are strictly a local-dev/operator concern (see `backend/.env.example`), never something the app config carries into prod.
- `apigateway.tf` — an HTTP API (`apigatewayv2`) with a single `$default` AWS_PROXY route to the Lambda, `payload_format_version = "2.0"`.
- `iam.tf` — the Lambda execution role, scoped to exactly this app's 7 table ARNs (+ `/index/*` for GSI queries), its own S3 bucket, and `AdminInitiateAuth`/`AdminCreateUser`/`AdminSetUserPassword` on exactly the one shared Cognito pool ARN — don't broaden any of this when adding a feature; add the specific new permission instead.
- `s3.tf` — private bucket, CORS driven by the `frontend_origin` Terraform variable (not a hand-edited JSON policy).
- `docker-compose.yml` + `local-tables.sh` — DynamoDB Local for development only; never referenced by the real Terraform.

**Frontend** is a small React Router SPA:
- `src/App.jsx` — all routes, wrapped in a single `Protected` component that redirects to `/login` if unauthenticated, or to `/` if `admin`-only and the user isn't an admin.
- `src/context/AuthContext.jsx` — the only client-side auth state; hydrates from `/auth/me` on load using the stored token, exposes `login`/`logout`.
- `src/api/client.js` — all HTTP goes through the `api()` helper (JSON, auto-attaches bearer token) plus a separate `uploadToS3()` for direct-to-S3 PUTs (used after calling a `*/upload-url` endpoint).
- `src/pages/*` — one page per route (Login, Home, Leaves, Documents, Profile, Admin); `src/components/Layout.jsx` provides the shared topbar + tab bar chrome for authenticated pages.
- Configured as an installable PWA via `vite-plugin-pwa` (see `vite.config.js` for manifest/icons); icons live in `public/icons/`.

## Working conventions

- All DynamoDB access goes through `config/dynamo.js`'s `ddb`/`Tables` — no controller should construct its own `DynamoDBClient`. Prefer `UpdateCommand` with a `ConditionExpression` over read-then-write when an operation needs to reject on a race (see `attendance`/`leaves` above) rather than pre-checking with a `GetCommand`.
- Table/GSI definitions live in two places that must move together: `infra/dynamodb.tf` (real AWS) and `infra/local-tables.sh` (DynamoDB Local). Adding an access pattern that needs a new GSI means updating both.
- Money/hours values: JS-side, hours are computed as plain floating point and rounded with `.toFixed(2)` before storage (see `checkOut` in `attendanceController.js`) — match this rather than introducing a decimal library.
- New protected routes must be composed the same way as existing ones in `routes/index.js`: `authRequired` (and `adminOnly` if admin-scoped) + the `wrap()` helper, not manual try/catch.
- Env vars are the only configuration mechanism (`.env` files locally, Terraform-set Lambda env vars in prod) — no config files/secrets manager. Never add `DYNAMO_ENDPOINT` to the Lambda's environment in `infra/lambda.tf`.
