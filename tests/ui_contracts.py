import json, subprocess
from pathlib import Path
from tree_sitter import Language, Parser
import tree_sitter_javascript

repo=Path(__file__).resolve().parents[1]
node='C:/Program Files/nodejs/node.exe'
p=Parser(Language(tree_sitter_javascript.language()))
baseline='a44167a764b4ab3ccff47cf3ea34618153ebb663'
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
    'passwordPolicy','passwordStrong','defaultTab','hasTxPerm','isExec',
    'canManagePermissions','hasAnyRoutePerm','baseBody','apiUrl','fetchJson','rpc',
    'post','refreshAuthSession','signInNew','saveSession','loadSession','clearSession',
    'myDeptNames','managerUnits','sectorUnits','employeesForUnit','safeUrl','esc',
    'xmlCell','download'
]
results={k:b.get(k)==a.get(k) for k in preserve}

# Narrow client-only exception: the three transports now enforce lifecycle
# ownership. Keep every original invariant; replace only their source equality
# with actual-source protocol/ownership regressions (nonzero exit fails here).
client_baseline='f3c145e557aa01537b3161f3147409cf802d8b0d'
client_before=functions(subprocess.check_output(['git','show',client_baseline+':app.js'],cwd=repo))
client_allowed={'refreshAuthSession','post','rpc','boot','loadList','refresh','copyWhatsApp'}
client_changed={name for name in set(client_before)|set(a) if client_before.get(name)!=a.get(name)}
assert client_changed<=client_allowed, 'Unrelated function changed since authorized baseline'
# This also retains exact login/logout and all identity/profile producers.
for name in set(client_before)-client_allowed:
    assert client_before[name]==a.get(name), 'Unrelated function changed: '+name
behavior=subprocess.run([node,'tests/client_session_ownership.mjs'],cwd=repo,capture_output=True,text=True)
assert behavior.returncode==0, behavior.stdout+behavior.stderr
for name in {'refreshAuthSession','post','rpc'}:
    results[name]=behavior.returncode==0

# Only tabsFor is deliberately revised. Execute the actual extracted function:
# role defaults stay intact and the secretary gains the canonical SQL queue key.
tab_probe='const vm=require("node:vm");const c={hasTxPerm:()=>false};vm.createContext(c);vm.runInContext('+json.dumps(a['tabsFor'])+'+";globalThis.tabs=tabsFor",c);console.log(JSON.stringify(Object.fromEntries('+json.dumps(['employee','manager','assistant','assistant_secretary','ceo','ceo_office_manager','ceo_secretary'])+'.map(r=>[r,c.tabs(r).map(t=>t[0])]))));'
role_tabs=json.loads(subprocess.check_output([node,'-e',tab_probe],cwd=repo,text=True))
assert role_tabs['employee']==['incoming','shared','closed']
assert role_tabs['manager']==role_tabs['assistant']==['incoming','shared','scope','closed']
assert role_tabs['assistant_secretary']==['incoming','secretary_queue','shared','closed']
assert role_tabs['ceo']==['incoming','ceo_view','shared','closed']
assert role_tabs['ceo_office_manager']==role_tabs['ceo_secretary']==['incoming','ceo','shared','closed']

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
allowed.update({
    'tests/client_session_ownership.mjs','tests/client_clipboard.py',
    'tests/client_bootstrap_interleavings.py',
    'tests/transaction_request_prevalidation_test.ts',
    'docs/transactions/LOAD_TEST_2026-10-04.md',
    'docs/transactions/CLIENT_REVIEW_2026-10-07.md',
    # Independently approved and already applied executive-custody slice.
    'supabase/migrations/20261007190000_transaction_executive_custody.sql',
    'tests/transaction_executive_custody.mjs',
    'docs/transactions/FEEDBACK_2026-10-06.md','docs/transactions/DELIVERY_2026-10-06.md',
    'supabase/migrations/20261006193000_transaction_custody_read_state.sql',
    'supabase/migrations/20261006194500_transaction_assistant_reply.sql',
    'tests/transaction_feedback_sql.mjs','tests/transaction_feedback_sql_fixture.mjs',
    'tests/transaction_feedback_ui.py','tests/transaction_feedback_edge_test.ts',
    'tests/transaction_feedback_guards.mjs','tests/transaction_feedback_notify.mjs',
    'tests/transaction_feedback_cohort.mjs','tests/transaction_feedback_cross_layer.mjs',
    'tests/transaction_feedback_ownership_bridge.mjs','tests/transaction_feedback_receipt_bridge.py',
    'tests/transaction_assistant_reply_sql.mjs','tests/transaction_assistant_reply_regressions.mjs',
    # Existing local, non-credential account tooling is outside this commit slice.
    'scratch/manual-test-accounts.mjs','scratch/manual-test-accounts.test.mjs'
})
paths=set(subprocess.check_output(['git','diff','--name-only',baseline],cwd=repo,text=True).splitlines())
paths.update(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines())

for name in ['index.html','service-worker.js']:
    current=(repo/name).read_text(encoding='utf-8').replace('\r\n','\n')
    assert '20261007-1' in current, f'{name} does not reference current asset version'

restricted=[x for x in ['urgkbbconlxeagfgyjee','msajed-tasks','sb_secret_','service_role','setInterval(']
            if x in source+(repo/'index.html').read_text(encoding='utf-8')]

tree=p.parse(after)
report={
    'baseline':baseline,
    'client_baseline':client_baseline,
    'client_changed_functions':sorted(client_changed),
    'client_behavior_checks':behavior.stdout.strip().splitlines()[-1],
    'preserved_functions':results,
    'approved_role_tabs':role_tabs,
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
