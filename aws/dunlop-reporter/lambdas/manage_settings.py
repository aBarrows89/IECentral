"""
Lambda: manage-settings
Trigger: API Gateway GET/PUT /dunlop/settings
Reads and updates SFTP credentials in AWS Secrets Manager.
"""

import json
import os
import boto3

SECRETS_ARN = os.environ.get("SFTP_SECRETS_ARN", "")

secrets = boto3.client("secretsmanager")


def handler(event, context):
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if http_method == "PUT":
        return _handle_update(event)

    return _handle_read()


def _handle_read():
    try:
        if not SECRETS_ARN:
            return _response(500, {"error": "SFTP_SECRETS_ARN not configured"})

        resp = secrets.get_secret_value(SecretId=SECRETS_ARN)
        creds = json.loads(resp["SecretString"])

        # Mask passwords for display
        result = {}
        for key in ["sftp_dev", "sftp_prod"]:
            if key in creds:
                c = dict(creds[key])
                result[key] = c

        return _response(200, result)

    except Exception as e:
        return _response(500, {"error": str(e)})


def _handle_update(event):
    try:
        if not SECRETS_ARN:
            return _response(500, {"error": "SFTP_SECRETS_ARN not configured"})

        body = json.loads(event.get("body", "{}"))
        sftp_dev = body.get("sftp_dev")
        sftp_prod = body.get("sftp_prod")

        if not sftp_dev or not sftp_prod:
            return _response(400, {"error": "sftp_dev and sftp_prod are required"})

        new_secret = {
            "sftp_dev": {
                "host": sftp_dev.get("host", ""),
                "port": int(sftp_dev.get("port", 22)),
                "username": sftp_dev.get("username", ""),
                "password": sftp_dev.get("password", ""),
                "directory": sftp_dev.get("directory", "inbound"),
            },
            "sftp_prod": {
                "host": sftp_prod.get("host", ""),
                "port": int(sftp_prod.get("port", 22)),
                "username": sftp_prod.get("username", ""),
                "password": sftp_prod.get("password", ""),
                "directory": sftp_prod.get("directory", "inbound"),
            },
        }

        secrets.update_secret(
            SecretId=SECRETS_ARN,
            SecretString=json.dumps(new_secret),
        )

        return _response(200, {"success": True})

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
