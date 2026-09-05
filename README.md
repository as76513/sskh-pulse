# SSKH Pulse — Attendance PWA
**Shubh Shree Knowledge Hub Private Limited**

SSKH Pulse is a lightweight, mobile + desktop attendance app: location-based check-in/out, late & half-day auto-marking, leaves, payslips, document upload, admin regularization, and resignation flow.

Stack: **React (Vite) PWA** + **Node/Express on Lambda** + **DynamoDB** + **AWS S3**. Serverless, free-tier friendly — no EC2/RDS to keep running.

---

## Project Structure
```
sskh-pulse/
├── backend/                 Node + Express API
│   └── src/
│       ├── app.js           express app (shared by server.js and lambda.js)
│       ├── server.js        local dev entrypoint (npm run dev/start)
│       ├── lambda.js        Lambda entrypoint (serverless-http wrapper)
│       ├── config/          dynamo.js (DynamoDB client + table names), seed.js
│       ├── controllers/     auth, attendance, leave, admin, files
│       ├── middleware/      JWT auth + admin guard
│       ├── routes/          all API routes
│       └── utils/           geofence (Haversine), S3 presign
├── infra/                   Terraform: DynamoDB, Lambda, API Gateway, IAM, S3
│   ├── docker-compose.yml   DynamoDB Local for development
│   └── local-tables.sh      creates tables/GSIs against DynamoDB Local
└── frontend/                React PWA (installable)
    ├── public/icons/        app icons (navy + gold)
    └── src/
        ├── api/             fetch client
        ├── context/         auth state
        ├── components/      Layout (topbar + tab bar)
        ├── pages/           Login, Home, Leaves, Documents, Profile, Admin
        └── utils/           browser geolocation
```

## Features → where they live
| Requirement | Implementation |
|---|---|
| Emp code + Password | `authController.login`, JWT |
| Location-based attendance | `attendanceController` + `utils/geo.js` geofence |
| Late mark | auto-computed on check-in vs shift_start + grace |
| Half day | auto-computed on check-out vs `halfday_hours` |
| Leaves | `leaveController` (apply / approve / balance) |
| Pay slip | `filesController` (admin upload, employee download via S3) |
| Admin attendance regulation | `adminController.regularizeAttendance` |
| Resign reason | `filesController.submitResignation` |
| Document upload | `filesController` presigned S3 upload |
| Absence reason | `attendanceController.markAbsence` |

---

## Local Setup

### 1. DynamoDB Local (via Docker)
```bash
cd infra
docker compose up -d
./local-tables.sh          # creates all tables + GSIs against the local container
```

### 2. Backend
```bash
cd ../backend
cp .env.example .env       # defaults already point at DynamoDB Local (DYNAMO_ENDPOINT)
                            # set AWS_PROFILE=shubhshreekh-dev — needed even locally, since
                            # document/payslip presigned URLs hit real S3 (only DynamoDB is local)
npm install
npm run seed                # seeds a default office + admin/employee accounts
npm run dev                 # http://localhost:4000
```
Default logins (change immediately): Admin `ADMIN001` / `admin123`, Employee `EMP001` / `admin123`.

The seeded office has placeholder coordinates (`0,0`) — set real ones before testing the
geofence (there's no admin UI for it yet, use `aws dynamodb update-item` against the
`sskh-pulse-offices` table, same pattern as `infra/local-tables.sh`).

### 3. Frontend
```bash
cd ../frontend
cp .env.example .env      # set VITE_API_URL
npm install
npm run dev               # http://localhost:5173
```

Open on your phone (same network) to test geolocation. Install as an app via the browser's "Add to Home Screen".

---

## Build Plan

Get the app itself working end-to-end on a laptop before spending any more time on
deployment — infra is written and waiting (see below), but it's not the thing that
tells you whether the app is right.

**Phase 1 — UI + API (current focus)**
Backend API is implemented against DynamoDB and curl-verified: login, geofenced
check-in/out with late/half-day auto-marking, leave apply → admin approve → balance
deduction, admin daily report. Frontend is implemented but needs to actually be run
and clicked through in a browser against that API — every page (Login, Home,
Leaves, Documents, Profile, Admin), not just the endpoints in isolation.

**Phase 2 — Real-world tuning**
Set real office coordinates and re-test the geofence on a phone. Tune
`geofence_radius`, `shift_start`, `late_grace_min`, `halfday_hours` per actual company
policy. Add the leave types the company actually uses. Replace the generated icons
with the real logo (192px + 512px PNGs in `frontend/public/icons/`) and test PWA
install on Android + iOS + desktop.

**Phase 3 — Deploy to AWS**
`infra/` (Terraform) provisions DynamoDB, Lambda, API Gateway, S3, and IAM — written
and `terraform plan`-validated already, not yet applied. See `infra/README.md` for
the bootstrap → deploy steps. After deploying: seed the real tables, point the
frontend's `VITE_API_URL` at the API Gateway URL, force a password change on all
seeded accounts, onboard the team.

---

## AWS Deployment Notes (serverless, free-tier friendly)

See `infra/README.md` for the full Terraform walkthrough. Summary:

**Backend** — API Gateway (HTTP API) → Lambda running the Express app via `serverless-http`. No server to patch or keep running; scales to zero when idle.

**Data** — 7 DynamoDB tables (`employees`, `offices`, `attendance`, `leaves`, `documents`, `payslips`, `resignations`) with GSIs for the admin queries (pending leaves, daily report). On-demand billing — no capacity to size.

**Frontend** — `npm run build` produces a static `dist/`. Host on S3 static website + CloudFront (cheapest), or any static host.

**S3 bucket CORS** (for direct browser uploads) is provisioned by `infra/s3.tf` from the `frontend_origin` Terraform variable — update that variable (not a JSON file) when the frontend's deployed domain changes.

**IAM** — the Lambda execution role (`infra/iam.tf`) is scoped to only the app's own DynamoDB tables/indexes and S3 bucket. Don't hand it broader permissions.

**Cost cautions**
- DynamoDB on-demand + Lambda + API Gateway HTTP API are all pay-per-request and free-tier eligible — at this app's traffic (a few hundred requests/day), expect low-single-digit dollars/month at worst.
- S3 free tier: 5 GB. Payslips/docs are small PDFs — plenty of headroom.
- Set a billing alarm at ₹100 / $1 to avoid surprises.

---

## Security checklist before go-live
- [ ] Set `jwt_secret` in `infra/terraform.tfvars` to a long random value (never commit it)
- [ ] Force-reset all seeded passwords
- [ ] API Gateway is HTTPS by default — geolocation **requires** HTTPS on real devices, satisfied automatically
- [ ] Restrict the S3 bucket to private + presigned access only (done by `infra/s3.tf`)
- [ ] Confirm the Lambda IAM role isn't broader than the app's own tables/bucket (`infra/iam.tf`)
- [ ] Confirm no static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` ever made it into Lambda's env vars — prod authenticates solely via the IAM role, `AWS_PROFILE` is a local-only operator credential
- [ ] Enable AWS billing alarm

---

## Next enhancements (post-launch)
- CSV export of monthly attendance for payroll
- Push notifications for leave approvals (web-push)
- Face-check selfie at punch-in (S3 + optional Rekognition)
- Holiday calendar & week-off configuration
- Manager hierarchy for multi-level leave approval
