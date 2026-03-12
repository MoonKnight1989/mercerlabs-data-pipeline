-- Reference tables: partners (by sales channel), ticket types, unknown channels, events

-- Partners: keyed on sales_channel_id (the stable business identifier)
-- Commission is applied to base_price from ticket_types to get net revenue
CREATE TABLE IF NOT EXISTS reference.partners (
  sales_channel_id STRING NOT NULL,
  partner_name STRING,
  partner_type STRING,                        -- direct, ota, hotel, group, internal, comp
  connection_type STRING,                     -- native, travel_curious, barcodes, portal, pos, web
  commission_rate FLOAT64,                    -- Stated contractual rate (for display)
  net_multiplier_adult FLOAT64,               -- Actual % of retail kept (adult tickets)
  net_multiplier_other FLOAT64,               -- Actual % of retail kept (youth/senior/student)
  is_active BOOL DEFAULT TRUE,
  notes STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Ticket types: base (retail) prices from Events API
-- The true customer-facing price, unaffected by secret shop overrides
CREATE TABLE IF NOT EXISTS reference.ticket_types (
  ticket_type_id STRING NOT NULL,
  ticket_name STRING,
  base_price FLOAT64,                         -- Retail price from Events API
  ticket_category STRING,                     -- adult, youth, senior, student, child, ada, vip, package, comp, other
  tax_rate FLOAT64,
  is_active BOOL DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Unknown sales channels: auto-populated when new channels appear in ticket data
CREATE TABLE IF NOT EXISTS reference.unknown_channels (
  sales_channel_id STRING NOT NULL,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  sample_ticket_id STRING,
  sample_price FLOAT64,
  ticket_count INT64 DEFAULT 1,
  resolved BOOL DEFAULT FALSE,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reference.events (
  event_id STRING NOT NULL,
  event_name STRING,
  event_start TIMESTAMP,
  event_end TIMESTAMP,
  daily_capacity INT64,
  is_active BOOL DEFAULT TRUE,
  notes STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
