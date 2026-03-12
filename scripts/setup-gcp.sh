#!/bin/bash
set -euo pipefail

PROJECT_ID="mercer-labs-488707"
REGION="us-east1"

echo "=== Mercer Labs Analytics - GCP Setup ==="
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo ""

# Enable required APIs
echo "Enabling APIs..."
gcloud services enable \
  bigquery.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com \
  --project="${PROJECT_ID}"

echo "APIs enabled."

# Create secrets (values must be added manually via console or CLI)
echo ""
echo "Creating secret placeholders..."
for SECRET in vivenu-api-key claude-api-key sendgrid-api-key; do
  if gcloud secrets describe "${SECRET}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Secret '${SECRET}' already exists, skipping."
  else
    gcloud secrets create "${SECRET}" \
      --replication-policy="automatic" \
      --project="${PROJECT_ID}"
    echo "  Created secret '${SECRET}'"
  fi
done

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Add secret values:"
echo "     echo -n 'YOUR_KEY' | gcloud secrets versions add vivenu-api-key --data-file=- --project=${PROJECT_ID}"
echo "     echo -n 'YOUR_KEY' | gcloud secrets versions add claude-api-key --data-file=- --project=${PROJECT_ID}"
echo "     echo -n 'YOUR_KEY' | gcloud secrets versions add sendgrid-api-key --data-file=- --project=${PROJECT_ID}"
echo ""
echo "  2. Run BigQuery schema setup:"
echo "     bq query --use_legacy_sql=false --project_id=${PROJECT_ID} < sql/schemas/01-create-datasets.sql"
echo "     bq query --use_legacy_sql=false --project_id=${PROJECT_ID} < sql/schemas/02-raw-tables.sql"
echo "     bq query --use_legacy_sql=false --project_id=${PROJECT_ID} < sql/schemas/03-reference-tables.sql"
echo "     bq query --use_legacy_sql=false --project_id=${PROJECT_ID} < sql/schemas/04-analytics-tables.sql"
echo ""
echo "  3. Seed reference data:"
echo "     bq load --source_format=NEWLINE_DELIMITED_JSON ${PROJECT_ID}:reference.partners config/partners-seed.json"
echo ""
echo "  4. Enable audit logging:"
echo "     Enable DATA_READ and DATA_WRITE audit logs for BigQuery in the GCP Console"
echo "     (IAM & Admin > Audit Logs > BigQuery API)"
