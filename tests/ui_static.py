"""Read-only CSS syntax, browser declaration support, contrast and asset gates."""
from pathlib import Path
import json, re, gzip, subprocess
import tinycss2
from playwright.sync_api import sync_playwright
repo=Path(__file__).resolve().parents[1]
css=(repo/'styles.css').read_text(encoding='utf-8')
declarations=[];errors=[]
def walk(rules):
    for rule in rules:
        if rule.type=='error':errors.append(str(rule))
        if rule.type=='qualified-rule':
            for d in tinycss2.parse_declaration_list(rule.content,skip_comments=True,skip_whitespace=True):
                if d.type=='error':errors.append(f'{d.source_line}:{d.source_column} {d.message}')
                elif d.type=='declaration' and not d.name.startswith('--'):declarations.append([d.name,tinycss2.serialize(d.value)])
        elif rule.type=='at-rule' and rule.content is not None:walk(tinycss2.parse_rule_list(rule.content,skip_comments=True,skip_whitespace=True))
walk(tinycss2.parse_stylesheet(css,skip_comments=True,skip_whitespace=True))
with sync_playwright() as pw:
    b=pw.chromium.launch();page=b.new_page()
    unsupported=page.evaluate('ds=>ds.filter(([name,value])=>!CSS.supports(name,value))',declarations);b.close()
def luminance(h):
    rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    linear=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
    return sum(x*y for x,y in zip(linear,[.2126,.7152,.0722]))
def ratio(a,b):
    hi,lo=sorted([luminance(a),luminance(b)],reverse=True);return (hi+.05)/(lo+.05)
pairs=[['body','#172b43','#ffffff'],['secondary/hints/placeholders','#596b80','#ffffff'],['secondary on background','#596b80','#edf2f7'],['primary button','#ffffff','#195ba4'],['gold text','#765319','#faf3e5'],['urgent badge','#9e282e','#fbeaec'],['normal badge','#4c6078','#edf1f6'],['progress badge','#805414','#faf0d9'],['success','#17664f','#e7f3ed'],['sidebar inactive','#ccd9e8','#102c4a']]
contrast=[{'name':name,'ratio':round(ratio(fg,bg),3),'passed':ratio(fg,bg)>=4.5} for name,fg,bg in pairs]
versions={file:sorted(set(re.findall(r'2026\d{4}-\d+', (repo/file).read_text(encoding='utf-8')))) for file in ['index.html','service-worker.js']}
frontend=(repo/'app.js').read_text(encoding='utf-8')+(repo/'index.html').read_text(encoding='utf-8')
restricted=[x for x in ['urgkbbconlxeagfgyjee','msajed-tasks','sb_secret_','service_role','setInterval('] if x in frontend]
assets=[]
for file in ['app.js','styles.css','index.html','service-worker.js']:
    data=(repo/file).read_bytes();old=subprocess.check_output(['git','show','baeffc3ea3afccc35ddcbfbf7382742e7175d2d0:'+file],cwd=repo)
    assets.append({'file':file,'bytes':len(data),'gzip_bytes':len(gzip.compress(data)),'baseline_bytes':len(old),'baseline_gzip_bytes':len(gzip.compress(old))})
report={'css_parse_errors':errors,'unsupported_declarations':unsupported,'declaration_count':len(declarations),'contrast':contrast,'asset_versions':versions,'restricted_frontend_markers':restricted,'assets':assets}
print(json.dumps(report,ensure_ascii=False,indent=2))
assert not errors and not unsupported
assert all(p['passed'] for p in contrast)
assert versions=={'index.html':['20261005-2'],'service-worker.js':['20261005-2']}
assert not restricted
