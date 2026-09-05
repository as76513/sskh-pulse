# Infra — DynamoDB + Lambda + API Gateway

Provisions the serverless backend: 7 DynamoDB tables, one Lambda function running the
Express app (via `serverless-http`), an HTTP API Gateway in front of it, an S3 bucket
for documents/payslips, and the IAM role tying them together. No EC2, no RDS.

## Local development

Real AWS isn't needed to develop locally — `docker-compose.yml` runs DynamoDB Local,
and `local-tables.sh` creates the same tables/GSIs against it:

```bash
docker compose up -d
./local-tables.sh
cd ../backend && cp .env.example .env && npm install && npm run seed && npm run dev
```

`backend/.env`'s `DYNAMO_ENDPOINT=http://localhost:8000` is what points the SDK at the
local container instead of real AWS. `AWS_PROFILE=shubhshreekh-dev` (also in `.env`) is
still needed even for local dev — `utils/s3.js`'s presigned URLs hit real S3, DynamoDB
Local is the only thing being redirected. Never put static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
in `.env` — use the named profile.

## Deploying to real AWS

Prerequisites: Terraform >= 1.11 (needed for S3-native state locking), the `shubhshreekh-dev`
AWS CLI profile configured with credentials that can create DynamoDB/Lambda/API Gateway/IAM/S3
resources, Node.js + `zip` for building the Lambda package.

```bash
export AWS_PROFILE=shubhshreekh-dev   # every terraform/aws command below relies on this
```

Production itself never uses this profile or any static keys — the deployed Lambda
authenticates as `aws_iam_role.lambda_exec` (see `infra/iam.tf`), picked up automatically
by the SDK's default credential chain inside Lambda. The profile is strictly an
operator's local credential for running Terraform/seeding, not something the app carries.

### 0. One-time: bootstrap the remote state bucket

This config's own Terraform state lives in S3, not on a laptop — but the bucket it lives
in can't be created by the same config that stores its state there. `bootstrap/` is a
separate, tiny Terraform (its own local state — see the warning in `bootstrap/main.tf`)
that creates just that bucket. Run it once per environment/account:

```bash
cd bootstrap
terraform init
terraform apply
terraform output state_bucket_name   # copy this
cd ..
```

Then point this config at it:

```bash
cp backend.hcl.example backend.hcl   # set bucket = the name from above
terraform init -backend-config=backend.hcl
```

`backend.hcl` is gitignored (the bucket name isn't secret, but it's environment-specific —
whoever deploys next re-derives it from `bootstrap`'s output rather than trusting a
committed value that might be stale). Locking uses the S3 backend's native `use_lockfile`
(Terraform >= 1.11) — no separate DynamoDB lock table to provision or pay for.

### 1. Deploy the app infra

```bash
cp terraform.tfvars.example terraform.tfvars   # fill in jwt_secret + frontend_origin
./build_lambda.sh                              # zips backend/src + prod node_modules
terraform plan
terraform apply
```

`build_lambda.sh` must run **before** the first `apply` — `lambda.tf` reads
`build/lambda.zip`'s hash directly, so the file needs to exist at plan time.
Re-run `./build_lambda.sh && terraform apply` after every backend code change to redeploy.

After `apply`, `terraform output api_base_url` gives the API's base URL — set the
frontend's `VITE_API_URL` to `<that>api` (e.g. `https://xxxx.execute-api.ap-south-1.amazonaws.com/api`).

### 2. Seed the default office + admin/employee accounts

`backend/src/config/seed.js` talks to whatever `DYNAMO_TABLE_PREFIX`/`AWS_REGION` it's
pointed at. To seed the real tables this Terraform created, run it with `AWS_PROFILE`
still set and `DYNAMO_ENDPOINT` unset:

```bash
cd ../backend
unset DYNAMO_ENDPOINT   # or delete the line from .env
npm run seed             # uses AWS_PROFILE=shubhshreekh-dev from .env
```

Then update the seeded office's `latitude`/`longitude` (there's no admin UI for it —
use `aws dynamodb update-item`, matching `local-tables.sh`'s pattern) to your real
office coordinates before testing the geofence.

### 3. Custom domain (GoDaddy DNS)

`domain.tf` maps `var.api_domain_name` (default `sskh-api.shubhshreeknowledgehub.com`) onto
the HTTP API. DNS lives in GoDaddy, not Route53, so ACM's ownership check has to be done by
hand — this is a two-phase apply:

```bash
# Phase A — request the cert, get the validation record
terraform apply -target=aws_acm_certificate.api
terraform output api_cert_validation_record
```

Add the printed `name`/`value` as a **CNAME** record in GoDaddy's DNS management for
`shubhshreeknowledgehub.com`. Wait for it to propagate (a few minutes, sometimes up to an
hour) — `dig CNAME <name>` should start resolving.

```bash
# Phase B — once the validation record is live, finish the domain mapping
terraform apply
terraform output api_gateway_target_domain
```

Add a **second CNAME** in GoDaddy: `sskh-api` → the printed target domain. Once that
propagates, `https://sskh-api.shubhshreeknowledgehub.com/api/...` reaches the API directly —
update the frontend's `VITE_API_URL` and the `frontend_origin` Terraform variable (CORS) to
match instead of the raw `execute-api.amazonaws.com` URL.

The frontend itself is planned for AWS Amplify Hosting at `sskh-pulse.shubhshreeknowledgehub.com`
(not yet set up) — Amplify provisions its own cert and default domain; only the final CNAME
in GoDaddy pointing at Amplify's domain is a manual step, same pattern as above.

## Cost

DynamoDB tables use on-demand (`PAY_PER_REQUEST`) billing — at the request volume of an
internal attendance app this stays a few cents a month rather than needing to size
provisioned capacity across 7 tables and their GSIs. Lambda + API Gateway HTTP API are
both metered per-request and free-tier eligible at this scale. Set a billing alarm regardless.
