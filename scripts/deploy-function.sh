#!/bin/bash
set -euo pipefail

PROJECT_ID="mercer-labs-488707"
REGION="us-east1"

if [ -z "${1:-}" ]; then
  echo "Usage: ./scripts/deploy-function.sh <function-name>"
  echo "  Options: vivenu-ingest | daily-email-digest"
  exit 1
fi

FUNCTION_NAME="$1"
FUNCTION_DIR="functions/${FUNCTION_NAME}"

if [ ! -d "${FUNCTION_DIR}" ]; then
  echo "Error: Function directory '${FUNCTION_DIR}' not found."
  exit 1
fi

echo "=== Deploying ${FUNCTION_NAME} ==="
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Run checks and build
echo "Running checks..."
cd "${FUNCTION_DIR}"
npm run check

echo "Building..."
npm run build

# Map directory name to Cloud Function entry point
case "${FUNCTION_NAME}" in
  vivenu-ingest)
    ENTRY_POINT="vivenuIngest"
    ;;
  daily-email-digest)
    ENTRY_POINT="dailyEmailDigest"
    ;;
  *)
    echo "Error: Unknown function '${FUNCTION_NAME}'"
    exit 1
    ;;
esac

echo "Deploying to GCP..."
gcloud functions deploy "${ENTRY_POINT}" \
  --runtime=nodejs20 \
  --trigger-http \
  --source=./dist \
  --entry-point="${ENTRY_POINT}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --memory=512Mi

echo ""
echo "=== ${FUNCTION_NAME} deployed successfully ==="
