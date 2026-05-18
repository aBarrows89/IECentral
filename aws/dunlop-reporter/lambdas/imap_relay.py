"""
IMAP relay Lambda

Sits in the same VPC as the dunlop-reporter Lambdas, so it shares the static
NAT-gateway IP. Convex Node actions can't be allow-listed (their egress IPs
rotate within a /24 and the mail server's firewall keeps RST'ing), so they
call this Lambda instead. The Lambda then opens IMAP to the mail server
from the static IP, which only needs one allow-list entry on the mail side.

Endpoints:
  POST /imap/fetch     fetch messages newer than since_uid (incremental sync)
  POST /imap/fetch-one fetch one specific UID's full source (attachments etc.)
  POST /imap/folders   list folders + UIDNEXT for each

Auth: shared secret in X-Relay-Secret header, sourced from Secrets Manager.
"""

import base64
import email
import imaplib
import json
import os
import time
from email.header import decode_header
from email.utils import parsedate_to_datetime, getaddresses

import boto3

SECRETS_ARN = os.environ.get("RELAY_SECRET_ARN", "")
secrets = boto3.client("secretsmanager")
_cached_secret = {"value": None, "ts": 0}


def get_relay_secret() -> str:
    now = time.time()
    if _cached_secret["value"] and now - _cached_secret["ts"] < 300:
        return _cached_secret["value"]
    if not SECRETS_ARN:
        return ""
    res = secrets.get_secret_value(SecretId=SECRETS_ARN)
    val = json.loads(res["SecretString"]).get("relaySecret", "")
    _cached_secret.update(value=val, ts=now)
    return val


def decode_mime_header(raw: str) -> str:
    if raw is None:
        return ""
    parts = decode_header(raw)
    out = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            try:
                out.append(chunk.decode(enc or "utf-8", errors="replace"))
            except (LookupError, UnicodeDecodeError):
                out.append(chunk.decode("utf-8", errors="replace"))
        else:
            out.append(chunk)
    return "".join(out)


def parse_addresses(raw: str) -> list:
    if not raw:
        return []
    out = []
    for name, addr in getaddresses([raw]):
        if not addr:
            continue
        out.append({"name": decode_mime_header(name) or None, "address": addr})
    return out


def parse_message(uid: int, raw_bytes: bytes, fetch_body: bool) -> dict:
    msg = email.message_from_bytes(raw_bytes)
    subject = decode_mime_header(msg.get("Subject", ""))
    from_addrs = parse_addresses(msg.get("From"))
    to_addrs = parse_addresses(msg.get("To"))
    cc_addrs = parse_addresses(msg.get("Cc"))
    date_raw = msg.get("Date")
    date_iso = None
    try:
        if date_raw:
            date_iso = parsedate_to_datetime(date_raw).isoformat()
    except (TypeError, ValueError):
        date_iso = None
    message_id = msg.get("Message-ID") or msg.get("Message-Id")

    text_body = None
    html_body = None
    attachments = []

    for part in msg.walk():
        ctype = part.get_content_type()
        disposition = (part.get("Content-Disposition") or "").lower()
        is_attachment = "attachment" in disposition or part.get_filename() is not None

        if is_attachment:
            attachments.append({
                "filename": decode_mime_header(part.get_filename() or "attachment.bin"),
                "contentType": ctype,
                "size": len(part.get_payload(decode=True) or b""),
            })
            continue

        if not fetch_body:
            continue

        if ctype == "text/plain" and text_body is None:
            payload = part.get_payload(decode=True) or b""
            text_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        elif ctype == "text/html" and html_body is None:
            payload = part.get_payload(decode=True) or b""
            html_body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")

    return {
        "uid": uid,
        "messageId": message_id,
        "subject": subject,
        "from": from_addrs,
        "to": to_addrs,
        "cc": cc_addrs,
        "date": date_iso,
        "text": text_body,
        "html": html_body,
        "attachments": attachments,
    }


def open_imap(body: dict) -> imaplib.IMAP4:
    host = body["host"]
    port = int(body.get("port", 993))
    secure = body.get("secure", True)
    user = body["user"]
    password = body["pass"]
    if secure:
        client = imaplib.IMAP4_SSL(host=host, port=port, timeout=30)
    else:
        client = imaplib.IMAP4(host=host, port=port, timeout=30)
    client.login(user, password)
    return client


def imap_quote(name: str) -> str:
    # Quote IMAP mailbox name
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def handle_fetch(body: dict) -> dict:
    folder = body.get("folder", "INBOX")
    since_uid = int(body.get("since_uid", 0))
    max_messages = int(body.get("max_messages", 200))
    fetch_body = bool(body.get("fetch_body", True))

    client = open_imap(body)
    try:
        client.select(imap_quote(folder), readonly=True)
        # UID SEARCH UID since_uid+1:*
        criterion = f"{since_uid + 1}:*" if since_uid > 0 else "1:*"
        typ, data = client.uid("search", None, "UID", criterion)
        if typ != "OK" or not data or not data[0]:
            return {"messages": [], "new_last_uid": since_uid}
        uids = [int(x) for x in data[0].split() if int(x) > since_uid]
        uids.sort()
        uids = uids[:max_messages]
        if not uids:
            return {"messages": [], "new_last_uid": since_uid}

        messages = []
        for uid in uids:
            typ, msg_data = client.uid("fetch", str(uid), "(BODY.PEEK[])")
            if typ != "OK" or not msg_data:
                continue
            raw = None
            for item in msg_data:
                if isinstance(item, tuple) and len(item) >= 2:
                    raw = item[1]
                    break
            if not raw:
                continue
            messages.append(parse_message(uid, raw, fetch_body))

        return {"messages": messages, "new_last_uid": uids[-1]}
    finally:
        try:
            client.logout()
        except Exception:
            pass


def handle_fetch_one(body: dict) -> dict:
    folder = body.get("folder", "INBOX")
    uid = int(body["uid"])
    include_raw = bool(body.get("include_raw", False))

    client = open_imap(body)
    try:
        client.select(imap_quote(folder), readonly=True)
        typ, msg_data = client.uid("fetch", str(uid), "(BODY.PEEK[])")
        if typ != "OK" or not msg_data:
            return {"message": None}
        raw = None
        for item in msg_data:
            if isinstance(item, tuple) and len(item) >= 2:
                raw = item[1]
                break
        if not raw:
            return {"message": None}
        parsed = parse_message(uid, raw, True)
        if include_raw:
            parsed["raw_b64"] = base64.b64encode(raw).decode("ascii")
        return {"message": parsed}
    finally:
        try:
            client.logout()
        except Exception:
            pass


def handle_folders(body: dict) -> dict:
    client = open_imap(body)
    try:
        typ, data = client.list()
        folders = []
        if typ == "OK" and data:
            for raw in data:
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
                # Format: (\HasNoChildren) "/" "INBOX"
                # Cheap parse: take last quoted token as folder name
                if '"' in line:
                    name = line.rsplit('"', 2)[-2]
                else:
                    name = line.split()[-1]
                folders.append(name)
        return {"folders": folders}
    finally:
        try:
            client.logout()
        except Exception:
            pass


ROUTES = {
    "fetch": handle_fetch,
    "fetch-one": handle_fetch_one,
    "folders": handle_folders,
}


def handler(event, context):
    try:
        # API Gateway proxy passes path + headers + body
        path = (event.get("path") or "").lower()
        headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        provided_secret = headers.get("x-relay-secret", "")
        expected = get_relay_secret()
        if not expected or provided_secret != expected:
            return {"statusCode": 401, "body": json.dumps({"error": "unauthorized"})}

        raw_body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            raw_body = base64.b64decode(raw_body).decode("utf-8")
        body = json.loads(raw_body)

        action = path.rsplit("/", 1)[-1]
        if action not in ROUTES:
            return {"statusCode": 404, "body": json.dumps({"error": f"unknown action {action}"})}

        result = ROUTES[action](body)
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result),
        }
    except imaplib.IMAP4.error as e:
        return {"statusCode": 502, "body": json.dumps({"error": f"imap error: {str(e)}"})}
    except KeyError as e:
        return {"statusCode": 400, "body": json.dumps({"error": f"missing field: {e.args[0]}"})}
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": f"{type(e).__name__}: {str(e)}"})}
