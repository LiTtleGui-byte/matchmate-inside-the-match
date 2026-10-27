"""Serve the browser client and its three public URL settings. Python 3.10+."""
import argparse
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web"
KEYS = {
    "MATCHMATE_API_BASE_URL": "apiBaseURL",
    "MATCHMATE_MEDIA_URL": "mediaURL",
    "MATCHMATE_LINEUPS_URL": "lineupsURL",
}


def settings():
    values = {}
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            key, separator, value = line.strip().partition("=")
            if separator and key.strip() in KEYS:
                values[key.strip()] = value.strip().strip("\"'")
    result = {}
    for key, field in KEYS.items():
        value = os.environ.get(key, values.get(key, "")).strip()
        parsed = urlsplit(value)
        if value and (parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password or parsed.fragment or parsed.query):
            raise ValueError(f"{key} must be a public HTTP(S) URL without credentials, query or fragment")
        result[field] = value
    return result


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == "/client-config.json":
            body = json.dumps(self.server.client_settings).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        resolved = (PUBLIC / path.lstrip("/")).resolve()
        if not resolved.is_relative_to(PUBLIC) or any(part.startswith(".") for part in Path(path).parts) or (resolved.is_dir() and path != "/"):
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, format, *args):
        # Avoid logging URL query values or request headers.
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(PUBLIC)))
    server.client_settings = settings()
    print(f"MatchMate client: http://localhost:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
