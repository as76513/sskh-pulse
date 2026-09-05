#!/usr/bin/env bash
# Builds infra/build/lambda.zip: backend/src + production-only node_modules.
# Run this before every `terraform apply` that should pick up backend code changes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
BUILD_DIR="$SCRIPT_DIR/build"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "Staging backend in $STAGE_DIR..."
cp -r "$BACKEND_DIR/src" "$STAGE_DIR/src"
cp "$BACKEND_DIR/package.json" "$STAGE_DIR/package.json"

echo "Installing production dependencies..."
(cd "$STAGE_DIR" && npm install --omit=dev --no-audit --no-fund --silent)

mkdir -p "$BUILD_DIR"
rm -f "$BUILD_DIR/lambda.zip"
(cd "$STAGE_DIR" && zip -rq "$BUILD_DIR/lambda.zip" .)

echo "Built $BUILD_DIR/lambda.zip"
