"""Dev server for the assistant branch. Not part of the app.

Serves this repository and proxies /data, /fonts and /aggrid to the live site,
so DELPHI runs locally with real populations, the real gene map and the real
per-sample metadata. Binds every interface so a machine with a working WebGPU
GPU can open it over the LAN.

	python3 serve.py

Then open http://<this-machine>:8778/index.html
"""

import http.server
import socketserver
import urllib.request
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = 'https://delphi.seqmash.com'
PROXY_PREFIXES = ('/data/', '/fonts/', '/aggrid/')
PORT = 8778


class Handler(http.server.SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, directory=ROOT, **kwargs)

	def do_GET(self):
		if self.path.startswith(PROXY_PREFIXES):
			return self.proxy()
		return super().do_GET()

	def proxy(self):
		try:
			with urllib.request.urlopen(UPSTREAM + self.path, timeout=120) as upstream:
				body = upstream.read()
			self.send_response(200)
			self.send_header('Content-Type', upstream.headers.get('Content-Type', 'application/octet-stream'))
			self.send_header('Content-Length', str(len(body)))
			self.end_headers()
			self.wfile.write(body)
		except Exception as error:
			self.send_error(502, str(error))

	def log_message(self, *args):
		pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('0.0.0.0', PORT), Handler) as server:
	print('DELPHI dev server on http://0.0.0.0:%d, proxying /data to %s' % (PORT, UPSTREAM))
	server.serve_forever()
