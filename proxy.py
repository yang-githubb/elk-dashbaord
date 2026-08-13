"""
Dashboard static file server + Elasticsearch proxy.

Stdlib only — no pip packages required. Run: python proxy.py

Always stop the old process and start a new one after git pull.
The previous python process keeps serving old files and old proxy routes.

Environment variables:
  PORT            — listen port (default 8000)
  ES_URL          — Elasticsearch base URL
  DETAIL_INDEX    — jax / pad index pattern (POST /search)
  BOARD_INDEX     — spi-board index (POST /search-board)
  ES_USERNAME     — basic auth user
  ES_PASSWORD     — basic auth password
  ES_TIMEOUT_SEC  — ES HTTP timeout in seconds; 0 means wait until ES finishes
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
REPO_ROOT = Path(__file__).resolve().parent
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    bundled = Path(sys._MEIPASS)
    ROOT = bundled / "web" if (bundled / "web").is_dir() else bundled
else:
    ROOT = REPO_ROOT / "web"

ES_URL = os.environ.get(
    "ES_URL", "https://elastic-sac-platinum.elkaas.flex.com"
).rstrip("/")

DETAIL_INDEX = os.environ.get(
    "DETAIL_INDEX", "flexh1smtmachinesdata00589-jax_process_optimizations*"
)

BOARD_INDEX = os.environ.get("BOARD_INDEX", "flexh1smtmachinesdata00589-spi-board")

DETAIL_SEARCH_URL = f"{ES_URL}/{DETAIL_INDEX}/_search"

BOARD_SEARCH_URL = f"{ES_URL}/{BOARD_INDEX}/_search"

ES_USERNAME = os.environ.get(
    "ES_USERNAME", "flexh1smtmachinesdata00589-sac-pl-00601-service-user"
)

ES_PASSWORD = os.environ.get("ES_PASSWORD", "7Efuei>L")
# 0 = wait indefinitely for large pad aggregations
ES_TIMEOUT_SEC = int(os.environ.get("ES_TIMEOUT_SEC", "0"))

STATIC_SUFFIXES = frozenset({".html", ".js", ".css", ".ico", ".svg", ".png", ".map"})
CHUNK_SIZE = 65536  # 64KB chunks for writing large responses

# Short URLs → files under web/
PATH_ALIASES = {
    "spi": "dashboards/spi/index.html",
    "spi/": "dashboards/spi/index.html",
    "magicray": "dashboards/magicray/index.html",
    "magicray/": "dashboards/magicray/index.html",
    "magicray.html": "dashboards/magicray/index.html",
    "analysis.html": "dashboards/spi/analysis.html",
    "pad-analysis.html": "dashboards/spi/pad-analysis.html",
}


def normalize_name(path: str) -> str:
    return path.lstrip("/").replace("\\", "/")


def _norm_path(path: Path) -> str:
    text = os.path.normcase(os.path.abspath(str(path)))
    if text.startswith("\\\\?\\"):
        text = text[4:]
    return text


def _is_under_root(path: Path, root: Path) -> bool:
    root_text = _norm_path(root)
    child = _norm_path(path)
    return child == root_text or child.startswith(root_text + os.sep)


def static_roots() -> list[Path]:
    """Prefer web/, then repo root / SPI/ so older checkouts still serve."""
    roots: list[Path] = []
    for candidate in (ROOT, REPO_ROOT / "web", REPO_ROOT, REPO_ROOT / "SPI"):
        resolved = candidate.resolve()
        if resolved.is_dir() and resolved not in roots:
            roots.append(resolved)
    return roots


def resolve_static(name: str) -> Path | None:
    """Return a file under the static root, or None if missing / outside the tree."""
    name = PATH_ALIASES.get(name, name)
    name = normalize_name(name)
    if not name or name.endswith("/"):
        name = f"{name}index.html"

    if ".." in Path(name).parts:
        return None

    for root in static_roots():
        candidate = (root / name).resolve()
        if not _is_under_root(candidate, root):
            continue
        if candidate.is_dir():
            candidate = (candidate / "index.html").resolve()
            if not _is_under_root(candidate, root):
                continue
        if candidate.is_file() and candidate.suffix.lower() in STATIC_SUFFIXES:
            return candidate
    return None


def es_request(url: str, body: bytes) -> tuple[int, bytes]:
    creds = base64.b64encode(f"{ES_USERNAME}:{ES_PASSWORD}".encode()).decode()
    req = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Basic {creds}",
        },
    )
    ctx = ssl.create_default_context()
    try:
        es_timeout = None if ES_TIMEOUT_SEC <= 0 else ES_TIMEOUT_SEC
        with urlopen(req, timeout=es_timeout, context=ctx) as res:
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
        name = normalize_name(path)
        if path in ("", "/", "/index.html"):
            name = "index.html"
        elif name in PATH_ALIASES:
            target = "/" + PATH_ALIASES[name].lstrip("/")
            self.send_response(302)
            self._cors()
            self.send_header("Location", target)
            self.end_headers()
            return
        file_path = resolve_static(name)
        if file_path:
            self._serve_path(file_path)
            return
        print(f"[server] 404 {path} (name={name!r} root={ROOT})")
        self.send_error(404, f"Not found: {path}")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/search", "/search/"):
            target_url = DETAIL_SEARCH_URL

        elif path in ("/search-board", "/search-board/"):
            target_url = BOARD_SEARCH_URL

        else:
            self.send_error(404, "Use POST /search or /search-board")
            return
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"

        try:
            status, data = es_request(target_url, body)
        except URLError as err:
            reason = err.reason if hasattr(err, "reason") else str(err)
            msg = json.dumps(
                {
                    "error": f"Cannot reach Elasticsearch: {reason}",
                    "hint": "Check VPN/network and ES_URL in proxy.py",
                    "target": target_url,
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
        except Exception as err:
            reason = str(err)
            msg = json.dumps(
                {
                    "error": f"Elasticsearch proxy error: {reason}",
                    "hint": "Check proxy.py and Elasticsearch availability",
                    "target": target_url,
                }
            ).encode()
            print(f"[proxy] Unexpected proxy error: {reason}")
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

    def _serve_path(self, file_path: Path) -> None:
        data = file_path.read_bytes()
        mime, _ = mimetypes.guess_type(file_path.name)
        if file_path.suffix.lower() == ".html":
            mime = "text/html; charset=utf-8"
        elif file_path.suffix.lower() == ".js":
            mime = "text/javascript; charset=utf-8"
        elif file_path.suffix.lower() == ".css":
            mime = "text/css; charset=utf-8"
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", mime or "application/octet-stream")
        self.send_header("Cache-Control", "no-cache")
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
    print(f"Hub:        http://0.0.0.0:{PORT}/")
    print(f"SPI:        http://0.0.0.0:{PORT}/spi")
    print(f"MagicRay:   http://0.0.0.0:{PORT}/magicray")
    print(f"ELK proxy:  http://0.0.0.0:{PORT}/search")
    print(f"Board Index : {BOARD_SEARCH_URL}")
    print(f"Detail Index: {DETAIL_SEARCH_URL}")
    server.serve_forever()
