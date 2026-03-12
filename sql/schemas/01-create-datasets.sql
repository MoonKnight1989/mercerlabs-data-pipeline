-- Create BigQuery datasets for Mercer Labs Analytics
-- Run once during initial GCP setup

CREATE SCHEMA IF NOT EXISTS raw_vivenu
  OPTIONS (
    description = 'Untransformed Vivenu API responses. Contains PII - restricted access.',
    location = 'us-east1'
  );

CREATE SCHEMA IF NOT EXISTS mercer_analytics
  OPTIONS (
    description = 'Clean, anonymised, query-ready analytics tables. Dashboards read from here.',
    location = 'us-east1'
  );

CREATE SCHEMA IF NOT EXISTS reference
  OPTIONS (
    description = 'Partner configs, commission rates, event metadata.',
    location = 'us-east1'
  );
