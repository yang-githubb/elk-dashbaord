"""
Dashboard static file server + Elasticsearch proxy.

Stdlib only — no pip packages required. Run: python proxy.py

Environment variables:
  PORT        — listen port (default 8000)
  ES_URL      — Elasticsearch base URL
  ES_INDEX    — index pattern
  ES_USERNAME — basic auth user
  ES_PASSWORD — basic auth password
"""

import base64
import json
import mimetypes
import os
import socket
import ssl
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PORT = int(os.environ.get("PORT", "8000"))
if getattr(sys, "frozen", False):
    if hasattr(sys, "_MEIPASS"):
        ROOT = Path(sys._MEIPASS)
    else:
        ROOT = Path(__file__).resolve().parent / "SPI"
else:
    ROOT = Path(__file__).resolve().parent / "SPI"

ES_URL = os.environ.get("ES_URL", "https://elastic-sac-test.elkaas.flex.com").rstrip(
    "/"
)
ES_INDEX = os.environ.get("ES_INDEX", "flexh1smtmachinesdata-tan_meng_kiang-*")
ES_USERNAME = os.environ.get(
    "ES_USERNAME", "flexh1smtmachinesdata-sac-tst-00589-service-user"
)
ES_PASSWORD = os.environ.get("ES_PASSWORD", "f*oA-4cj")
SEARCH_URL = f"{ES_URL}/{ES_INDEX}/_search"

# Only these paths may be served over HTTP (prevents path traversal)
ALLOWED_STATIC = frozenset(
    {
        "index.html",
        "analysis.html",
        "styles.css",
        "config.js",
        "pad-analysis.html",
    }
)

ALLOWED_PREFIXES = ("config/", "js/")
CHUNK_SIZE = 65536  # 64KB chunks for writing large responses


def is_allowed_static(path: str) -> bool:
    if path in ALLOWED_STATIC:
        return True
    return path.endswith(".js") and path.startswith(ALLOWED_PREFIXES)


def es_request(body: bytes) -> tuple[int, bytes]:
    creds = base64.b64encode(f"{ES_USERNAME}:{ES_PASSWORD}".encode()).decode()
    req = Request(
        SEARCH_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {creds}",
        },
    )
    ctx = ssl.create_default_context()
    try:
        # Increased timeout to 300 seconds (5 minutes) for large aggregations
        with urlopen(req, timeout=300, context=ctx) as res:
            return res.status, res.read()
    except HTTPError as err:
        return err.code, err.read()


class DashboardHandler(BaseHTTPRequestHandler):
    def setup(self) -> None:
        """Configure socket for large transfers."""
        super().setup()
        try:
            # Increase socket buffer sizes for large responses
            self.request.setsockopt(
                socket.SOL_SOCKET, socket.SO_SNDBUF, 1024 * 1024
            )  # 1MB send buffer
            self.request.setsockopt(
                socket.SOL_SOCKET, socket.SO_RCVBUF, 1024 * 1024
            )  # 1MB receive buffer
        except Exception as e:
            print(f"[server] Warning: Could not set socket options: {e}")

    def _write_data(self, data: bytes) -> None:
        """Write data in chunks to avoid buffer overflow."""
        try:
            for i in range(0, len(data), CHUNK_SIZE):
                chunk = data[i : i + CHUNK_SIZE]
                self.wfile.write(chunk)
        except (ConnectionAbortedError, BrokenPipeError, OSError) as err:
            print(f"[server] Client disconnected while sending response: {err}")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("", "/"):
            self._serve_file("index.html")
            return
        name = path.lstrip("/")
        if is_allowed_static(name):
            self._serve_file(name)
            return
        self.send_error(404, f"Not found: {path}")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path not in ("/search", "/search/"):
            self.send_error(404, "Use POST /search")
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        try:
            status, data = es_request(body)
        except URLError as err:
            reason = err.reason if hasattr(err, "reason") else str(err)
            msg = json.dumps(
                {
                    "error": f"Cannot reach Elasticsearch: {reason}",
                    "hint": "Check VPN/network and ES_URL in proxy.py",
                    "target": SEARCH_URL,
                }
            ).encode()
            print(f"[proxy] ES connection failed: {reason}")
            self.send_response(502)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self._write_data(msg)
            return

        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self._write_data(data)

    def _serve_file(self, name: str) -> None:
        file_path = (ROOT / name).resolve()
        if not str(file_path).startswith(str(ROOT)) or not file_path.is_file():
            self.send_error(404, f"Missing file: {name}")
            return
        data = file_path.read_bytes()
        mime, _ = mimetypes.guess_type(name)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self._write_data(data)

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt: str, *args) -> None:
        print(f"[server] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"Serving static root: {ROOT}")
    print(f"Index exists: {(ROOT / 'index.html').is_file()}")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"Dashboard:  http://0.0.0.0:{PORT}/")
    print(f"ELK proxy:  http://0.0.0.0:{PORT}/search")
    print(f"Elasticsearch: {SEARCH_URL}")
    server.serve_forever()
