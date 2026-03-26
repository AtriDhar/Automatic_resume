import os
import sys
import time
import urllib.error
import urllib.request

TARGET_URL = os.environ.get("TARGET_URL")
PING_INTERVAL_SECONDS = int(os.environ.get("PING_INTERVAL_SECONDS", "780"))  # ~13 minutes
STARTUP_BURST = int(os.environ.get("STARTUP_BURST", "2"))

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


if __name__ == "__main__":
    for _ in range(max(STARTUP_BURST, 1)):
        ping_once()
        time.sleep(5)

    while True:
        time.sleep(max(PING_INTERVAL_SECONDS, 60))
        ping_once()
