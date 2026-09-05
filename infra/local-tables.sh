#!/usr/bin/env bash
# Creates the DynamoDB tables (with GSIs) against DynamoDB Local for development.
# Mirrors the table/GSI definitions that infra/*.tf provisions in real AWS.
set -euo pipefail

ENDPOINT="${DYNAMO_ENDPOINT:-http://localhost:8000}"
PREFIX="${DYNAMO_TABLE_PREFIX:-sskh-pulse}"
REGION="${AWS_REGION:-ap-south-1}"

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-local}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-local}"

ddb() { aws dynamodb "$@" --endpoint-url "$ENDPOINT" --region "$REGION" >/dev/null; }

echo "Creating tables on $ENDPOINT with prefix '$PREFIX'..."

ddb create-table \
  --table-name "${PREFIX}-employees" \
  --attribute-definitions AttributeName=emp_code,AttributeType=S AttributeName=email,AttributeType=S \
  --key-schema AttributeName=emp_code,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"email-index","KeySchema":[{"AttributeName":"email","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-offices" \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-attendance" \
  --attribute-definitions AttributeName=emp_code,AttributeType=S AttributeName=work_date,AttributeType=S \
  --key-schema AttributeName=emp_code,KeyType=HASH AttributeName=work_date,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-leaves" \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=emp_code,AttributeType=S \
    AttributeName=status,AttributeType=S AttributeName=applied_at,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"emp_code-index","KeySchema":[{"AttributeName":"emp_code","KeyType":"HASH"},{"AttributeName":"applied_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
      {"IndexName":"status-index","KeySchema":[{"AttributeName":"status","KeyType":"HASH"},{"AttributeName":"applied_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-documents" \
  --attribute-definitions AttributeName=id,AttributeType=S AttributeName=emp_code,AttributeType=S \
    AttributeName=uploaded_at,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --global-secondary-indexes \
    '[{"IndexName":"emp_code-index","KeySchema":[{"AttributeName":"emp_code","KeyType":"HASH"},{"AttributeName":"uploaded_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-payslips" \
  --attribute-definitions AttributeName=emp_code,AttributeType=S AttributeName=pay_month,AttributeType=S \
  --key-schema AttributeName=emp_code,KeyType=HASH AttributeName=pay_month,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

ddb create-table \
  --table-name "${PREFIX}-resignations" \
  --attribute-definitions AttributeName=emp_code,AttributeType=S AttributeName=submitted_at,AttributeType=S \
  --key-schema AttributeName=emp_code,KeyType=HASH AttributeName=submitted_at,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST

echo "Done."
aws dynamodb list-tables --endpoint-url "$ENDPOINT" --region "$REGION"
