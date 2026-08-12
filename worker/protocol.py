from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class WorkerErrorInfo:
    code: str
    message: str


def success_response(request_id: str, payload: Dict[str, Any], response_type: str = "PROBE_RESULT") -> Dict[str, Any]:
    return {
        "requestId": request_id,
        "ok": True,
        "type": response_type,
        "payload": payload,
    }


def error_response(request_id: str, code: str, message: str) -> Dict[str, Any]:
    return {
        "requestId": request_id,
        "ok": False,
        "type": "ERROR",
        "error": {
            "code": code,
            "message": message,
        },
    }
