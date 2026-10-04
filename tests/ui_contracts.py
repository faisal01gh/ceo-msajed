import json, subprocess
from pathlib import Path
from tree_sitter import Language, Parser
import tree_sitter_javascript
repo=Path(__file__).resolve().parents[1]
p=Parser(Language(tree_sitter_javascript.language()))
before=subprocess.check_output(['git','show','baeffc3ea3afccc35ddcbfbf7382742e7175d2d0:app.js'],cwd=repo)
after=(repo/'app.js').read_bytes()
def functions(data):
    tree=p.parse(data);f={}
    for n in tree.root_node.children:
        if n.type=='function_declaration':
            name=n.child_by_field_name('name').text.decode(); f[name]=n.text.decode().replace('\r\n','\n')
    return f
b=functions(before);a=functions(after)
preserve=['passwordPolicy','passwordStrong','tabsFor','defaultTab','hasTxPerm','isExec','canManagePermissions','hasAnyRoutePerm','baseBody','apiUrl','fetchJson','rpc','post','refreshAuthSession','signInNew','saveSession','loadSession','clearSession','priorityClass','statusBadge','myDeptNames','managerUnits','sectorUnits','employeesForUnit','safeUrl','esc','xmlCell','excelXml','exportListExcel','exportTransactionExcel','printList','printTransaction','download']
results={k: b.get(k)==a.get(k) for k in preserve}
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
