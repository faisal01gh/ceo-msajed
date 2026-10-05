import subprocess,re
from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'supabase/functions/transactions-api/index.ts').read_text(encoding='utf-8')
fn=s[s.index('function safeHttpUrl('):s.index('function canonicalDept(')]
fn=re.sub(r':any','',fn)
probe="const URL='https://movzojtnkkmdsjhmlgtq.supabase.co';function clean(v){return String(v??'').trim()}"+fn+"\nif(safeHttpUrl('https://example.org/a')!=='https://example.org/a')throw Error('valid HTTP link incorrectly rejected by shadowed URL constructor');if(safeHttpUrl('javascript:alert(1)')!==null)throw Error('unsafe URL accepted');console.log('real safeHttpUrl source passed');"
subprocess.run(['C:/Program Files/nodejs/node.exe','-e',probe],check=True)
