"""
Lambda: fetch-sales
Trigger: API Gateway GET /dunlop/sales?months=202603
Returns pre-aggregated sales data from S3.
"""

import json
import os
from collections import defaultdict
import boto3

S3_BUCKET = os.environ.get("S3_SALES_DATA_BUCKET", "ietires-sales-data")

s3 = boto3.client("s3")


def handler(event, context):
    try:
        params = event.get("queryStringParameters") or {}
        months = params.get("months", "")

        if months:
            month_list = [m.strip() for m in months.split(",") if m.strip()]
            all_rows = []
            for month in month_list:
                try:
                    resp = s3.get_object(Bucket=S3_BUCKET, Key=f"processed/{month}.json")
                    data = json.loads(resp["Body"].read().decode("utf-8"))
                    all_rows.extend(data.get("rows", []))
                except Exception:
                    continue

            # Pre-aggregate for dashboard
            result = _aggregate(all_rows)
            return _response(200, result)

        # List available months
        paginator = s3.get_paginator("list_objects_v2")
        available = []
        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix="processed/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key.endswith(".json"):
                    month = key.replace("processed/", "").replace(".json", "")
                    if month.isdigit() and len(month) == 6:
                        available.append(month)

        available.sort(reverse=True)
        return _response(200, {"available": available})

    except Exception as e:
        return _response(500, {"error": str(e)})


def _aggregate(rows):
    """Pre-aggregate rows for the dashboard to keep response size small."""

    # KPIs (sales only)
    sales = [r for r in rows if r.get("trn") == "Sld"]
    total_revenue = sum(abs(r.get("ext_sell", 0)) for r in sales)
    total_units = sum(abs(r.get("qty", 0)) for r in sales)
    unique_customers = len(set(r.get("account", "") for r in sales if r.get("account")))

    # By location
    by_loc = defaultdict(lambda: {"units": 0, "revenue": 0})
    for r in sales:
        loc = r.get("loc", "Other")
        by_loc[loc]["units"] += abs(r.get("qty", 0))
        by_loc[loc]["revenue"] += abs(r.get("ext_sell", 0))

    # By brand (top 20)
    by_brand = defaultdict(lambda: {"units": 0, "revenue": 0})
    for r in sales:
        brand = r.get("brand", "Other")
        by_brand[brand]["units"] += abs(r.get("qty", 0))
        by_brand[brand]["revenue"] += abs(r.get("ext_sell", 0))

    # Daily trend
    by_date = defaultdict(lambda: {"units": 0, "revenue": 0})
    for r in sales:
        by_date[r.get("date", "")]["units"] += abs(r.get("qty", 0))
        by_date[r.get("date", "")]["revenue"] += abs(r.get("ext_sell", 0))

    # Transaction type breakdown (all rows)
    by_trn = defaultdict(int)
    for r in rows:
        by_trn[r.get("trn", "Other")] += 1

    # Top customers
    by_customer = defaultdict(lambda: {"name": "", "units": 0, "revenue": 0, "txns": 0})
    for r in sales:
        acct = r.get("account", "") or "Walk-in"
        by_customer[acct]["name"] = r.get("customer", "") or acct
        by_customer[acct]["units"] += abs(r.get("qty", 0))
        by_customer[acct]["revenue"] += abs(r.get("ext_sell", 0))
        by_customer[acct]["txns"] += 1

    # Unique locations
    unique_locs = sorted(set(r.get("loc", "") for r in rows if r.get("loc")))

    return {
        "kpis": {
            "totalRevenue": round(total_revenue, 2),
            "totalUnits": total_units,
            "avgPrice": round(total_revenue / total_units, 2) if total_units > 0 else 0,
            "uniqueCustomers": unique_customers,
        },
        "byLocation": sorted(
            [{"name": k, **v} for k, v in by_loc.items()],
            key=lambda x: -x["revenue"]
        ),
        "byBrand": sorted(
            [{"name": k, **v} for k, v in by_brand.items()],
            key=lambda x: -x["revenue"]
        )[:20],
        "dailyTrend": sorted(
            [{"date": k, **v} for k, v in by_date.items() if k],
            key=lambda x: x["date"]
        ),
        "byTrnType": sorted(
            [{"name": k, "value": v} for k, v in by_trn.items()],
            key=lambda x: -x["value"]
        ),
        "topCustomers": sorted(
            [{"account": k, **v} for k, v in by_customer.items()],
            key=lambda x: -x["revenue"]
        )[:20],
        "uniqueLocations": unique_locs,
        "totalRows": len(rows),
    }


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
