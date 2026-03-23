"""
Lambda: fetch-history
Trigger: API Gateway GET /dunlop/history
Lists and reads run logs from S3, returns sorted newest first.
"""

import json
import os
import boto3

S3_BUCKET = os.environ.get("S3_RUN_LOGS_BUCKET", "ietires-dunlop-run-logs")
S3_PREFIX = "run-logs/"

s3 = boto3.client("s3")


def handler(event, context):
    http_method = event.get("httpMethod", "GET")

    if http_method == "DELETE":
        return _handle_delete(event)

    return _handle_list()


def _handle_list():
    try:
        paginator = s3.get_paginator("list_objects_v2")
        logs = []

        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=S3_PREFIX):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if not key.endswith(".json"):
                    continue
                try:
                    resp = s3.get_object(Bucket=S3_BUCKET, Key=key)
                    log_data = json.loads(resp["Body"].read().decode("utf-8"))
                    log_data["_s3Key"] = key
                    logs.append(log_data)
                except Exception:
                    continue

        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return _response(200, logs)

    except Exception as e:
        return _response(500, {"error": str(e)})


def _handle_delete(event):
    try:
        body = json.loads(event.get("body", "{}"))
        month = body.get("month")
        timestamp = body.get("timestamp")

        if not month or not timestamp:
            return _response(400, {"error": "month and timestamp are required"})

        # Find the matching log file by scanning keys
        safe_ts = timestamp.replace(":", "-")
        target_prefix = f"run-logs/{month}_{safe_ts}"

        paginator = s3.get_paginator("list_objects_v2")
        deleted = False

        for page in paginator.paginate(Bucket=S3_BUCKET, Prefix=f"run-logs/{month}_"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                # Match by reading the log and comparing timestamp
                try:
                    resp = s3.get_object(Bucket=S3_BUCKET, Key=key)
                    log_data = json.loads(resp["Body"].read().decode("utf-8"))
                    if log_data.get("timestamp") == timestamp:
                        s3.delete_object(Bucket=S3_BUCKET, Key=key)
                        deleted = True
                        break
                except Exception:
                    continue
            if deleted:
                break

        if deleted:
            return _response(200, {"success": True})
        else:
            return _response(404, {"error": "Run log not found"})

    except Exception as e:
        return _response(500, {"error": str(e)})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
