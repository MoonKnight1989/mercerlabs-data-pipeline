#!/bin/bash
set -euo pipefail

PROJECT_ID="mercer-labs-488707"
REGION="us-east1"

echo "=== Mercer Labs Analytics - Historical Backfill ==="
echo ""
echo "This triggers the vivenu-ingest function manually."
echo "For a historical backfill, you may need to modify the"
echo "ROLLING_WINDOW_DAYS in the function or run multiple times"
echo "with adjusted date ranges."
echo ""
echo "WARNING: Do NOT run this until the DPA is signed."
echo ""

read -p "Proceed with backfill? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "Triggering vivenu-ingest..."
curl -X POST \
  "https://${REGION}-${PROJECT_ID}.cloudfunctions.net/vivenuIngest" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "=== Backfill triggered ==="
echo "Check Cloud Function logs for results:"
echo "  gcloud functions logs read vivenuIngest --region=${REGION} --project=${PROJECT_ID} --limit=50"
