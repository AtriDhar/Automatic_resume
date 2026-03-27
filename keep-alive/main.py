import os
import sys
import time
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TARGET_URL = os.environ.get("TARGET_URL")
PING_INTERVAL_SECONDS = int(os.environ.get("PING_INTERVAL_SECONDS", "780"))  # ~13 minutes
STARTUP_BURST = int(os.environ.get("STARTUP_BURST", "2"))
PORT = int(os.environ.get("PORT", "0") or "0")

if not TARGET_URL:
    sys.exit("TARGET_URL env var is required")


def ping_once() -> None:
    """Ping the backend health endpoint and log the result."""
    try:
        with urllib.request.urlopen(TARGET_URL, timeout=10) as response:
            status = response.status
            print(f"[ping] {TARGET_URL} -> {status}", flush=True)
    except Exception as exc:  # pragma: no cover - defensive logging only
        print(f"[ping] failed: {exc}", flush=True)


class _HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/health"):
            payload = b'{"status":"ok","service":"keep-alive"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        self.send_error(404)

    def log_message(self, format, *args):  # noqa: A003 - stdlib signature
        return


def maybe_start_http_server() -> None:
    # Render Web Services require a bound port. Start a tiny health listener if PORT is provided.
    if PORT <= 0:
        return
    server = ThreadingHTTPServer(("0.0.0.0", PORT), _HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[keep-alive] listening on 0.0.0.0:{PORT}", flush=True)


if __name__ == "__main__":
    maybe_start_http_server()

    for _ in range(max(STARTUP_BURST, 1)):
        ping_once()
        time.sleep(5)

    while True:
        time.sleep(max(PING_INTERVAL_SECONDS, 60))
        ping_once()
