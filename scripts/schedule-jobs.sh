#!/bin/bash
set -euo pipefail

PROJECT_ID="mercer-labs-488707"
REGION="us-east1"

echo "=== Setting up Cloud Scheduler jobs ==="

# Vivenu ingestion at 06:00 US Eastern daily
echo "Creating vivenu-ingest schedule (06:00 ET daily)..."
gcloud scheduler jobs create http vivenu-ingest-daily \
  --schedule="0 6 * * *" \
  --time-zone="America/New_York" \
  --uri="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/vivenuIngest" \
  --http-method=POST \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --attempt-deadline=300s \
  2>/dev/null || echo "  Job already exists. Use 'gcloud scheduler jobs update' to modify."

# BQ scheduled transforms at 06:30 ET are set up in the BigQuery console
# (scheduled queries cannot be created via gcloud CLI)
echo ""
echo "NOTE: BigQuery scheduled transforms (06:30 ET) must be created in the BigQuery console:"
echo "  1. transform-tickets.sql"
echo "  2. transform-daily-revenue.sql"
echo "  3. transform-daily-capacity.sql"
echo "  Schedule each for 06:30 AM America/New_York, in order."

# Daily email digest at 07:00 US Eastern daily
echo ""
echo "Creating daily-email-digest schedule (07:00 ET daily)..."
gcloud scheduler jobs create http daily-email-digest \
  --schedule="0 7 * * *" \
  --time-zone="America/New_York" \
  --uri="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/dailyEmailDigest" \
  --http-method=POST \
  --location="${REGION}" \
  --project="${PROJECT_ID}" \
  --attempt-deadline=300s \
  2>/dev/null || echo "  Job already exists. Use 'gcloud scheduler jobs update' to modify."

echo ""
echo "=== Scheduler setup complete ==="
