"""Local dev server for a static site: same layout as production.

Serves <site dir> at / and the repo's shared/ at /_shared/, like the Caddy
`static` snippet does on the server.

    python3 infra/serve.py sites/mosaic 8743
"""

import functools
import http.server
import os
import sys
import urllib.parse

SHARED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shared")
PREFIX = "/_shared/"


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if not path.startswith(PREFIX):
            return super().translate_path(path)
        rel = urllib.parse.unquote(path[len(PREFIX):].split("?", 1)[0].split("#", 1)[0])
        root = os.path.realpath(SHARED)
        full = os.path.realpath(os.path.join(root, rel))
        # Stay inside shared/.
        return full if full.startswith(root + os.sep) else os.path.join(root, "__missing__")


def main():
    site = sys.argv[1] if len(sys.argv) > 1 else "."
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8000
    handler = functools.partial(Handler, directory=os.path.abspath(site))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {site} (+ /_shared/) at http://127.0.0.1:{port}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
