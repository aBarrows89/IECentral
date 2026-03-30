"""
Lambda: generate-presigned-url
Trigger: API Gateway POST /dunlop/upload-url
Generates a temporary S3 presigned PUT URL for direct browser upload.
"""

import json
import os
import boto3
from botocore.config import Config

S3_UPLOAD_BUCKET = os.environ.get("S3_JMK_UPLOADS_BUCKET", "ietires-dunlop-jmk-uploads")
S3_OUTPUT_BUCKET = os.environ.get("S3_OUTPUT_CSVS_BUCKET", "ietires-dunlop-output-csvs")
PRESIGNED_EXPIRY = int(os.environ.get("PRESIGNED_EXPIRY_SECONDS", "900"))  # 15 min

s3 = boto3.client("s3", config=Config(signature_version="s3v4"))


def handler(event, context):
    try:
        body = json.loads(event.get("body", "{}"))
        action = body.get("action", "upload")

        if action == "download":
            return _handle_download(body)

        return _handle_upload(body)

    except Exception as e:
        return _response(500, {"error": str(e)})


def _handle_upload(body):
    filename = body.get("filename")
    month = body.get("month")

    if not filename or not month:
        return _response(400, {"error": "filename and month are required"})

    if month != "backfill" and (len(month) != 6 or not month.isdigit()):
        return _response(400, {"error": "month must be YYYYMM format or 'backfill'"})

    key = f"jmk-uploads/{month}/{filename}"

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": S3_UPLOAD_BUCKET,
            "Key": key,
        },
        ExpiresIn=PRESIGNED_EXPIRY,
    )

    return _response(200, {"url": url, "key": key})


def _handle_download(body):
    filename = body.get("filename")

    if not filename:
        return _response(400, {"error": "filename is required"})

    key = f"output-csvs/{filename}"

    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": S3_OUTPUT_BUCKET,
            "Key": key,
            "ResponseContentDisposition": f"attachment; filename={filename}",
            "ResponseContentType": "text/csv",
        },
        ExpiresIn=PRESIGNED_EXPIRY,
    )

    return _response(200, {"url": url})


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
