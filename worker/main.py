from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict

from probe import probe_media
from protocol import error_response, success_response


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SubForge worker entrypoint")
    parser.add_argument("--request", required=True, help="JSON-encoded worker request")
    return parser.parse_args()


def parse_request(raw: str) -> Dict[str, Any]:
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("WORKER_PROTOCOL_ERROR:Request JSON is malformed")

    if not isinstance(value, dict):
        raise ValueError("WORKER_PROTOCOL_ERROR:Request must be a JSON object")

    if value.get("type") != "PROBE":
        raise ValueError("WORKER_PROTOCOL_ERROR:Unsupported request type")

    if not isinstance(value.get("requestId"), str):
        raise ValueError("WORKER_PROTOCOL_ERROR:requestId is required")

    payload = value.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("sourcePath"), str):
        raise ValueError("WORKER_PROTOCOL_ERROR:payload.sourcePath is required")

    return value


def split_error(value: Exception) -> tuple[str, str]:
    message = str(value)
    if ":" in message:
        code, detail = message.split(":", 1)
        if code and detail:
            return code, detail.strip()
    return "WORKER_EXITED", message


def main() -> int:
    args = parse_args()

    try:
        request = parse_request(args.request)
    except ValueError as error:
        response = error_response("unknown", "WORKER_PROTOCOL_ERROR", str(error))
        print(json.dumps(response, ensure_ascii=True), flush=True)
        return 1

    request_id = request["requestId"]
    source_path = request["payload"]["sourcePath"]

    try:
        metadata = probe_media(source_path)
        response = success_response(request_id, metadata)
        print(json.dumps(response, ensure_ascii=True), flush=True)
        return 0
    except FileNotFoundError:
        response = error_response(request_id, "FFPROBE_NOT_FOUND", "ffprobe executable was not found on PATH.")
        print(json.dumps(response, ensure_ascii=True), flush=True)
        return 2
    except Exception as error:  # noqa: BLE001
        code, message = split_error(error)
        response = error_response(request_id, code, message)
        print(json.dumps(response, ensure_ascii=True), flush=True)
        print(f"Worker error: {code} {message}", file=sys.stderr, flush=True)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
