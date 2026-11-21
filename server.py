from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit
import os, json, urllib.request, urllib.error

OPENAI_API_URL = "https://api.openai.com/v1/responses"
MODEL = os.environ.get("OPENAI_TRANSLATOR_MODEL", "gpt-6.2-astra")
MAX_BODY = 65536
MAX_STRINGS = 25
MAX_TEXT = 40000

class Handler(BaseHTTPRequestHandler):
    def _json(self, status, obj):
        data=json.dumps(obj,ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(data)))
        self.send_header("Cache-Control","no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path in ('/', '/index.html'):
            try:
                with open('/app/index.html','rb') as f: data=f.read()
                self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
            except Exception as e:
                self.send_error(500,str(e))
        elif path == '/favicon.ico':
            self.send_response(204); self.end_headers()
        elif path == '/api/health':
            self._json(200,{"status":"ok","translator_ai":bool(os.environ.get("OPENAI_API_KEY"))})
        else: self.send_error(404)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/translate":
            self.send_error(404); return
        key=os.environ.get("OPENAI_API_KEY")
        if not key:
            self._json(503,{"error":"AI translation is not configured: set OPENAI_API_KEY in Railway Variables"}); return
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<=0 or length>MAX_BODY:
                self._json(413,{"error":"Request body is empty or too large"}); return
            payload=json.loads(self.rfile.read(length))
            texts=payload.get("texts")
            language=str(payload.get("target_language","Russian"))[:80]
            if not isinstance(texts,list) or not texts or len(texts)>MAX_STRINGS or not all(isinstance(t,str) for t in texts):
                self._json(400,{"error":"texts must be a list of 1-25 strings"}); return
            if sum(len(t) for t in texts)>MAX_TEXT or any(len(t)>8000 for t in texts):
                self._json(413,{"error":"Text batch too large"}); return
            instruction=("Translate each Sims 4 mod string into "+language+". Preserve exactly all placeholders, "
              "format tokens, HTML tags, escaped sequences, variable names, braces, percent markers, and line breaks. "
              "Do not add explanations. Keep names, item identifiers, and proper names unchanged when they are likely game names. "
              "Return only valid JSON object with key translations containing an array of exactly the same length and order. "
              "If a string is code, markup, a token, or should remain untranslated, return it unchanged.\nSTRINGS:\n"+json.dumps(texts,ensure_ascii=False))
            req=json.dumps({"model":MODEL,"input":instruction}).encode("utf-8")
            request=urllib.request.Request(OPENAI_API_URL,data=req,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"},method="POST")
            with urllib.request.urlopen(request,timeout=90) as response:
                result=json.loads(response.read())
            out=[]
            for item in result.get("output",[]):
                if item.get("type")=="message":
                    for part in item.get("content",[]):
                        if part.get("type")=="output_text":out.append(part.get("text",""))
            output_text="\n".join(out).strip()
            decoded=json.loads(output_text)
            translations=decoded.get("translations") if isinstance(decoded,dict) else None
            if not isinstance(translations,list) or len(translations)!=len(texts) or not all(isinstance(x,str) for x in translations):
                raise ValueError("Model output did not match expected translations array")
            self._json(200,{"translations":translations})
        except urllib.error.HTTPError as e:
            detail=e.read(1500).decode("utf-8","replace")
            self._json(502,{"error":"OpenAI API error "+str(e.code)+": "+detail})
        except Exception as e:
            self._json(502,{"error":"Translation failed: "+str(e)})

port=int(os.environ.get('PORT','8080'))
HTTPServer(('0.0.0.0',port),Handler).serve_forever()
