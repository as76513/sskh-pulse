#!/usr/bin/env bash
# Builds frontend/ and pushes it to Amplify Hosting via a manual deployment
# (no GitHub linkage — Amplify's OAuth repo-connect flow needs a browser).
# Run this after `terraform apply` has created aws_amplify_app.frontend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"
BRANCH_NAME="main"

APP_ID="$(terraform -chdir="$SCRIPT_DIR" output -raw amplify_app_id)"
echo "Amplify app: $APP_ID (branch: $BRANCH_NAME)"

echo "Building frontend..."
(cd "$FRONTEND_DIR" && npm run build)

echo "Zipping dist/..."
ZIP_PATH="$SCRIPT_DIR/build/frontend.zip"
mkdir -p "$SCRIPT_DIR/build"
rm -f "$ZIP_PATH"
(cd "$FRONTEND_DIR/dist" && zip -rq "$ZIP_PATH" .)

echo "Requesting deployment..."
DEPLOYMENT="$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME")"
JOB_ID="$(echo "$DEPLOYMENT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).jobId')"
UPLOAD_URL="$(echo "$DEPLOYMENT" | node -pe 'JSON.parse(require("fs").readFileSync(0)).zipUploadUrl')"

echo "Uploading build (job $JOB_ID)..."
curl -sf -X PUT -H "Content-Type: application/zip" --upload-file "$ZIP_PATH" "$UPLOAD_URL" >/dev/null

echo "Starting deployment..."
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --job-id "$JOB_ID" >/dev/null

echo "Waiting for deployment to finish..."
while true; do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --job-id "$JOB_ID" --query 'job.summary.status' --output text)"
  echo "  status: $STATUS"
  case "$STATUS" in
    SUCCEED) echo "✅ Deployed."; break ;;
    FAILED|CANCELLED) echo "❌ Deployment $STATUS"; exit 1 ;;
    *) sleep 5 ;;
  esac
done

terraform -chdir="$SCRIPT_DIR" output -raw amplify_default_url
echo
