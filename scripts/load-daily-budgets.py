"""
Load 2026 daily budgets from CSV exports into reference.daily_budgets in BigQuery.
Extracts budget columns from both tickets-sold and redemptions CSVs.
"""

from __future__ import annotations

import csv
import re
from datetime import date
from google.cloud import bigquery

PROJECT_ID = "mercer-labs-488707"
DATASET = "reference"
TABLE = "daily_budgets"
TABLE_REF = f"{PROJECT_ID}.{DATASET}.{TABLE}"

TICKETS_CSV = "config/YOY 25-26 - daily budgets - tickets sold.csv"
REDEMPTIONS_CSV = "config/YOY 25-26 - daily budgets - redemptions.csv"

BUDGET_YEAR = 2026

SCHEMA = [
    bigquery.SchemaField("budget_date", "DATE"),
    bigquery.SchemaField("budgeted_tickets_sold", "INT64"),
    bigquery.SchemaField("budgeted_redemptions", "INT64"),
    bigquery.SchemaField("budgeted_net_revenue", "FLOAT64"),
]


def parse_int(val: str) -> int | None:
    """Parse a formatted integer like ' 1,603 ' into 1603."""
    if not val or not val.strip() or val.strip() == "-":
        return None
    cleaned = re.sub(r"[^\d]", "", val.strip())
    return int(cleaned) if cleaned else None


def parse_float(val: str) -> float | None:
    """Parse a formatted dollar amount like ' $70,389.67 ' into 70389.67."""
    if not val or not val.strip() or val.strip() == "$-" or val.strip() == "-":
        return None
    cleaned = re.sub(r"[^\d.]", "", val.strip())
    return float(cleaned) if cleaned else None


def parse_date(val: str) -> date | None:
    """Parse M/D date string into a date for BUDGET_YEAR."""
    if not val or not val.strip():
        return None
    parts = val.strip().split("/")
    if len(parts) != 2:
        return None
    try:
        month, day = int(parts[0]), int(parts[1])
        return date(BUDGET_YEAR, month, day)
    except (ValueError, TypeError):
        return None


def load_tickets_budgets() -> dict[date, dict]:
    """Load budgeted_tickets_sold and budgeted_net_revenue from tickets CSV."""
    budgets = {}
    with open(TICKETS_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # skip header row 1
        next(reader)  # skip header row 2

        for row in reader:
            if len(row) < 10:
                continue
            d = parse_date(row[0])
            if d is None:
                continue

            # Column 4 = 2026 Budget (tickets), Column 9 = 2026 Budget (NET revenue)
            budgets[d] = {
                "budgeted_tickets_sold": parse_int(row[4]),
                "budgeted_net_revenue": parse_float(row[9]),
            }

    return budgets


def load_redemptions_budgets() -> dict[date, int | None]:
    """Load budgeted_redemptions from redemptions CSV."""
    budgets = {}
    with open(REDEMPTIONS_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # skip header row 1
        next(reader)  # skip header row 2

        for row in reader:
            if len(row) < 5:
                continue
            d = parse_date(row[0])
            if d is None:
                continue

            # Column 4 = 2026 Budget (redemptions)
            budgets[d] = parse_int(row[4])

    return budgets


def main():
    tickets = load_tickets_budgets()
    redemptions = load_redemptions_budgets()

    # Merge on date
    all_dates = sorted(set(tickets.keys()) | set(redemptions.keys()))
    rows = []
    for d in all_dates:
        t = tickets.get(d, {})
        r = redemptions.get(d)
        rows.append({
            "budget_date": d.isoformat(),
            "budgeted_tickets_sold": t.get("budgeted_tickets_sold"),
            "budgeted_redemptions": r,
            "budgeted_net_revenue": t.get("budgeted_net_revenue"),
        })

    print(f"Parsed {len(rows)} daily budget rows")
    print(f"  Date range: {all_dates[0]} to {all_dates[-1]}")
    sample = rows[0]
    print(f"  Sample (Jan 1): tickets={sample['budgeted_tickets_sold']}, "
          f"redemptions={sample['budgeted_redemptions']}, "
          f"net_rev={sample['budgeted_net_revenue']}")

    # Write to CSV for bq load (avoids application-default auth issues)
    out_path = "config/daily_budgets_clean.csv"
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "budget_date", "budgeted_tickets_sold",
            "budgeted_redemptions", "budgeted_net_revenue",
        ])
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {out_path}")
    print(f"\nNow run:")
    print(f"  bq rm -f {TABLE_REF}")
    print(f"  bq load --source_format=CSV --skip_leading_rows=1 "
          f"--autodetect {TABLE_REF} {out_path}")


if __name__ == "__main__":
    main()
