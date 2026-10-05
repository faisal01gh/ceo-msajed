import json, subprocess
from pathlib import Path
from tree_sitter import Language, Parser
import tree_sitter_javascript

repo=Path(__file__).resolve().parents[1]
p=Parser(Language(tree_sitter_javascript.language()))
baseline='b1dcc08091a7f4a482e2be10dc442bb6bc0b46ec'
before=subprocess.check_output(['git','show',baseline+':app.js'],cwd=repo)
after=(repo/'app.js').read_bytes()

def functions(data):
    tree=p.parse(data);f={}
    for n in tree.root_node.children:
        if n.type=='function_declaration':
            name=n.child_by_field_name('name').text.decode()
            f[name]=n.text.decode().replace('\r\n','\n')
    return f

b=functions(before);a=functions(after)

# Preserve unchanged transport/session/navigation and transaction-scope primitives.
# The approved password command, bootstrap recovery and reset UI are tested separately.
preserve=[
    'passwordPolicy','passwordStrong','tabsFor','defaultTab','hasTxPerm','isExec',
    'canManagePermissions','hasAnyRoutePerm','baseBody','apiUrl','fetchJson','rpc',
    'post','refreshAuthSession','signInNew','saveSession','loadSession','clearSession',
    'myDeptNames','managerUnits','sectorUnits','employeesForUnit','safeUrl','esc',
    'xmlCell','download'
]
results={k:b.get(k)==a.get(k) for k in preserve}

expected_added={
    'fmtDateTime','periodDays','requestTypeLabel','requestStatusLabel',
    'requestTargetLabel','transactionRequestedText','historyText',
    'openSubject','openResponsibleUnit'
}
missing_added=sorted(expected_added-set(a))

source=after.decode()
required_frontend_markers=[
    'transactions.edit_subject',
    'transactions.change_responsible_unit',
    'الطلبات والاعتمادات',
    'إغلاق المعاملة',
    'notification-dot',
    'عدد أيام المعاملة',
    'الإدارة المسؤولة',
    'المسؤول عن المعاملة'
]
missing_markers=[x for x in required_frontend_markers if x not in source]

allowed={
    'CHANGELOG.md','app.js','docs/HANDOFF.md','docs/PROJECT_STATE.md',
    'docs/permissions/SPEC.md','docs/transactions/EXECUTIVE_APPROVAL.md',
    'docs/transactions/SPEC.md','index.html','service-worker.js','styles.css',
    'supabase/functions/transactions-api/index.ts',
    'supabase/migrations/20261005182000_transaction_detail_edit_permissions.sql',
    'tests/ui_contracts.py','tests/ui_public_deployment.py','tests/ui_renderer.py',
    'tests/ui_static.py','tests/transaction_refinements.py',
    '.gitignore','docs/auth/ACCOUNTS_SPEC.md',
    'scripts/accounts-provision.mjs',
    'supabase/functions/account-confirm-password/index.ts',
    'supabase/functions/account-admin-reset-password/index.ts',
    'supabase/functions/_shared/password-command.ts',
    'supabase/functions/_shared/password-port.ts',
    'supabase/migrations/20261005200000_password_operations_and_safe_provisioning.sql',
    'tests/accounts_provision.mjs','tests/accounts_live_e2e.py',
    'tests/accounts_live_e2e_contracts.py','tests/password_command_test.ts',
    'tests/password_edge_test.ts','tests/password_security_sql.mjs',
    'tests/password_security_sql_cases.mjs','tests/password_security_sql_README.md',
    'tests/password_transaction_gate.py','tests/password_transport.py',
    'tests/transaction_safe_url.py','tests/ui_regressions.py'
}
paths=set(subprocess.check_output(['git','diff','--name-only',baseline],cwd=repo,text=True).splitlines())
paths.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines())

for name in ['index.html','service-worker.js']:
    current=(repo/name).read_text(encoding='utf-8').replace('\r\n','\n')
    assert '20261005-7' in current, f'{name} does not reference current asset version'

restricted=[x for x in ['urgkbbconlxeagfgyjee','msajed-tasks','sb_secret_','service_role','setInterval(']
            if x in source+(repo/'index.html').read_text(encoding='utf-8')]

tree=p.parse(after)
report={
    'baseline':baseline,
    'preserved_functions':results,
    'missing_expected_functions':missing_added,
    'missing_frontend_markers':missing_markers,
    'changed_paths':sorted(paths),
    'unexpected_paths':sorted(paths-allowed),
    'restricted_frontend_markers':restricted,
    'parse_errors':tree.root_node.has_error
}
print(json.dumps(report,ensure_ascii=False,indent=2))
assert all(results.values()), 'Protected auth/session/navigation function changed'
assert not missing_added, 'Expected transaction helper missing'
assert not missing_markers, 'Expected transaction UI marker missing'
assert paths<=allowed, 'File changed outside approved accounts/password/UI/test/document scope'
assert not restricted, 'Restricted frontend marker found'
assert not tree.root_node.has_error, 'JavaScript parse error'
