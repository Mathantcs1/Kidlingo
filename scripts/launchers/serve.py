#!/usr/bin/env python3
"""ClipForge local server (Python 3.7+, standard library only).

Serves the app/ folder next to this file on 127.0.0.1 only. Port: CLIPFORGE_PORT (default 8123).
Content types come from the table below, not from the operating system (on Windows the registry can report
.js as text/plain, which browsers refuse for module scripts).
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "app"))
PORT = int(os.environ.get("CLIPFORGE_PORT") or 8123)

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "ClipForge"

    def log_message(self, *args):
        pass

    def _send(self, status, body=b"", ctype="text/plain; charset=utf-8", head=False):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-ClipForge", "1")  # lets the launcher tell this server from anything else on the port
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _serve(self, head):
        path = unquote(urlsplit(self.path).path)
        parts = path.replace("\\", "/").split("/")
        if ".." in parts or "\0" in path:
            return self._send(403, b"Forbidden", head=head)
        target = os.path.realpath(os.path.join(ROOT, *[p for p in parts if p]))
        if target != ROOT and not target.startswith(ROOT + os.sep):
            return self._send(403, b"Forbidden", head=head)
        if os.path.isdir(target):
            target = os.path.join(target, "index.html")
        if not os.path.isfile(target):
            if "." in parts[-1]:  # a missing asset is a real 404; anything else is an app route
                return self._send(404, b"Not found", head=head)
            target = os.path.join(ROOT, "index.html")
        ctype = TYPES.get(os.path.splitext(target)[1].lower(), "application/octet-stream")
        with open(target, "rb") as f:
            self._send(200, f.read(), ctype, head)

    def do_GET(self):
        self._serve(False)

    def do_HEAD(self):
        self._serve(True)


def check():
    """--check: exit 0 only if a ClipForge server answers on PORT (used by the launchers before opening the browser)."""
    import http.client

    try:
        conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=1)
        conn.request("GET", "/")
        return 0 if conn.getresponse().getheader("X-ClipForge") == "1" else 1
    except Exception:
        return 1


def main():
    if "--check" in sys.argv[1:]:
        return check()
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as e:
        print("Could not start ClipForge on port %d (%s). Close the other program using it, or set CLIPFORGE_PORT." % (PORT, e), file=sys.stderr)
        return 1
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    print("ClipForge is running at http://localhost:%d — close this window to stop it" % PORT, flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
