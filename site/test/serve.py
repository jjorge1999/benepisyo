"""Static server that behaves like GitHub Pages: unknown paths get 404.html (the app shell). Usage: python3 test/serve.py dist/browser 8765"""
import http.server, os, sys
root, port = sys.argv[1], int(sys.argv[2])
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=root, **k)
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or (os.path.isdir(path) and not os.path.exists(os.path.join(path, 'index.html'))):
            self.path = '/404.html'
        return super().send_head()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', port), H).serve_forever()
