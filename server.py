from __future__ import annotations

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PORT = 8765


class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), StaticHandler)
    print(f"Static Pages server: http://127.0.0.1:{PORT}/graph-editor.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
