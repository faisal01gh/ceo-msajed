import json, subprocess
from pathlib import Path
from tree_sitter import Language, Parser
import tree_sitter_javascript
repo=Path(__file__).resolve().parents[1]
p=Parser(Language(tree_sitter_javascript.language()))
baseline='6c1f8fa40457c94a2ac9c0b0c4b7e3879368c0fe'
before=subprocess.check_output(['git','show',baseline+':app.js'],cwd=repo)
after=(repo/'app.js').read_bytes()
def functions(data):
    tree=p.parse(data);f={}
    for n in tree.root_node.children:
        if n.type=='function_declaration':
            name=n.child_by_field_name('name').text.decode(); f[name]=n.text.decode().replace('\r\n','\n')
    return f
b=functions(before);a=functions(after)
# The approved passwordPolicy change is frontend validation, not an Auth/backend change.
preserve=['passwordStrong','tabsFor','defaultTab','hasTxPerm','isExec','canManagePermissions','hasAnyRoutePerm','baseBody','apiUrl','fetchJson','rpc','post','refreshAuthSession','signInNew','saveSession','loadSession','clearSession','priorityClass','statusBadge','myDeptNames','managerUnits','sectorUnits','employeesForUnit','safeUrl','esc','xmlCell','excelXml','exportListExcel','exportTransactionExcel','printList','printTransaction','download']
results={k: b.get(k)==a.get(k) for k in preserve}
approved_changed={'passwordPolicy','passwordRulesMarkup','passwordChangeView','openOwnPasswordChange'}
approved_added={'passwordComponentIds','passwordComponentMarkup','wirePasswordComponent'}
changed={k for k in b if b[k]!=a.get(k)}
added=set(a)-set(b)
assert changed<=approved_changed and added==approved_added, 'Out-of-scope frontend function change'
allowed={'app.js','styles.css','index.html','service-worker.js','CHANGELOG.md','docs/PROJECT_STATE.md','docs/HANDOFF.md','tests/password_component.py','tests/ui_contracts.py','tests/ui_static.py','tests/ui_public_deployment.py'}
paths=set(subprocess.check_output(['git','diff','--name-only',baseline],cwd=repo,text=True).splitlines())
paths.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines())
assert paths<=allowed, 'File changed outside approved UI/test/document scope'
for name in ['index.html','service-worker.js']:
    original=subprocess.check_output(['git','show',baseline+':'+name],cwd=repo).decode().replace('\r\n','\n')
    current=(repo/name).read_text(encoding='utf-8').replace('\r\n','\n')
    assert original.replace('20261005-1','20261005-2')==current, 'Non-version HTML/service-worker change'
old_css=subprocess.check_output(['git','show',baseline+':styles.css'],cwd=repo).decode().replace('\r\n','\n')
new_css=(repo/'styles.css').read_text(encoding='utf-8').replace('\r\n','\n')
end='\n\n/* One form/control vocabulary'
assert old_css.split('.password-inline-hint{',1)[0]==new_css.split('.password-requirements{',1)[0], 'CSS before password rules changed'
assert old_css.split(end,1)[1]==new_css.split(end,1)[1], 'CSS after password rules changed'
# Compare backend operation names and payload property names, not display markup.
def calls(data):
    found=[]
    def visit(n):
        if n.type=='call_expression':
            name=n.child_by_field_name('function')
            if name and name.text.decode() in ['post','rpc','baseBody','fetchJson']:
                # AST excludes whitespace while preserving identifiers/operators/string values.
                def tokens(x):return (x.type,x.text.decode()) if not x.children else (x.type,tuple(tokens(c) for c in x.children))
                found.append(tokens(n))
        for c in n.children:visit(c)
    visit(p.parse(data).root_node)
    return found
from collections import Counter
bc=Counter(map(repr,calls(before)));ac=Counter(map(repr,calls(after)))
print(json.dumps({'preserved_functions':results,'changed_network_expressions':{'removed':list((bc-ac).elements()),'added':list((ac-bc).elements())},'parse_errors':p.parse(after).root_node.has_error},ensure_ascii=False,indent=2))
assert all(results.values()), 'A protected function changed'
assert not (bc-ac) and not (ac-bc), 'A backend expression changed'
assert not p.parse(after).root_node.has_error, 'JavaScript parse error'
