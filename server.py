from http.server import BaseHTTPRequestHandler, HTTPServer
import os
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/index.html'):
            try:
                with open('/app/index.html','rb') as f: data=f.read()
                self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
            except Exception as e:
                self.send_error(500,str(e))
        else: self.send_error(404)
port=int(os.environ.get('PORT','8080'))
HTTPServer(('0.0.0.0',port),Handler).serve_forever()
