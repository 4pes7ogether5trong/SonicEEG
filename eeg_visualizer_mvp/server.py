from __future__ import annotations

import json
import mimetypes
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlsplit

from .model import VisualizationFrame


class RuntimeState:
    def __init__(self, age_years: float) -> None:
        self._lock = threading.Lock()
        self._age_years = float(age_years)
        self._frame: Optional[Dict[str, Any]] = None
        self._status = "starting"
        self._error: Optional[str] = None

    def age(self) -> float:
        with self._lock:
            return self._age_years

    def set_age(self, value: float) -> float:
        if not 1.0 <= value <= 100.0:
            raise ValueError("age must be between 1 and 100 years")
        with self._lock:
            self._age_years = float(value)
            return self._age_years

    def publish(self, frame: VisualizationFrame) -> None:
        with self._lock:
            self._frame = frame.to_dict()
            self._status = "running"
            self._error = None

    def complete(self) -> None:
        with self._lock:
            self._status = "complete"

    def fail(self, error: BaseException) -> None:
        with self._lock:
            self._status = "error"
            self._error = f"{type(error).__name__}: {error}"

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "status": self._status,
                "error": self._error,
                "age_years": self._age_years,
                "frame": self._frame,
            }


class VisualizerRequestHandler(BaseHTTPRequestHandler):
    state: RuntimeState
    web_root: Path

    def log_message(self, format: str, *args: object) -> None:
        # Avoid logging paths or browser details while deidentified data is in use.
        return

    def _common_headers(self, content_type: str, content_length: int) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
        )

    def _send_bytes(self, body: bytes, content_type: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        self.send_response(status)
        self._common_headers(content_type, len(body))
        self.end_headers()
        self.wfile.write(body)

    def _send_json(self, payload: Dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send_bytes(json.dumps(payload, separators=(",", ":")).encode("utf-8"), "application/json", status)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            snapshot = self.state.snapshot()
            self._send_json({key: snapshot[key] for key in ("status", "error", "age_years")})
            return
        if path == "/api/frame":
            snapshot = self.state.snapshot()
            if snapshot["frame"] is None:
                self._send_json(snapshot, HTTPStatus.SERVICE_UNAVAILABLE)
            else:
                self._send_json(snapshot)
            return

        relative = "index.html" if path in {"", "/"} else path.lstrip("/")
        candidate = (self.web_root / relative).resolve()
        if self.web_root.resolve() not in candidate.parents and candidate != self.web_root.resolve():
            self._send_bytes(b"not found", "text/plain; charset=utf-8", HTTPStatus.NOT_FOUND)
            return
        if not candidate.is_file():
            self._send_bytes(b"not found", "text/plain; charset=utf-8", HTTPStatus.NOT_FOUND)
            return
        mime = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in {"application/javascript", "application/json"}:
            mime += "; charset=utf-8"
        self._send_bytes(candidate.read_bytes(), mime)

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path != "/api/age":
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 4096:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            age = self.state.set_age(float(payload["age_years"]))
            self._send_json({"age_years": age})
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)


def make_server(state: RuntimeState, host: str, port: int) -> ThreadingHTTPServer:
    web_root = Path(__file__).resolve().parent / "web"

    class BoundHandler(VisualizerRequestHandler):
        pass

    BoundHandler.state = state
    BoundHandler.web_root = web_root
    return ThreadingHTTPServer((host, port), BoundHandler)
