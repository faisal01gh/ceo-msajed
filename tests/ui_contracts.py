import hashlib, json, os, re, subprocess, sys, tempfile
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
            assert name not in f, 'Duplicate top-level function: '+name
            f[name]=n.text.decode().replace(chr(13)+chr(10),chr(10))
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

# Keep both historical oracles. Reconcile only exact, immutable accepted source;
# a historical function name is NOT permission for another change to its body.
client_baseline='f3c145e557aa01537b3161f3147409cf802d8b0d'
accepted_baseline='3bb411ea0e0574be34285cd5bab9b971f502862d'
accepted_runtime='f3762ca8301650aa719f0dcb15171cc2d80f95e7'
accepted_source_sha256='9eb630d2680158cf8cbd3a4e7bd8c7d22370d294cd2a3e1f1564acb4a9b9efb9'
accepted_source=subprocess.check_output(['git','show',accepted_baseline+':app.js'],cwd=repo)
assert hashlib.sha256(accepted_source).hexdigest()==accepted_source_sha256, 'Accepted source object mismatch'
assert subprocess.check_output(['git','show',accepted_runtime+':app.js'],cwd=repo)==accepted_source, 'Accepted runtime source mismatch'
accepted=functions(accepted_source)
client_before=functions(subprocess.check_output(['git','show',client_baseline+':app.js'],cwd=repo))
client_allowed={'refreshAuthSession','post','rpc','boot','loadList','refresh','copyWhatsApp'}
frontend_allowed={'wireSectionSidebar','loadProfile','loadPermissions','refresh',
                  'renderPager','exportListExcel','printList','logout'}
historical_changed={name for name in set(client_before)|set(accepted)
                    if client_before.get(name)!=accepted.get(name)}
client_changed={name for name in set(client_before)|set(a) if client_before.get(name)!=a.get(name)}
assert client_changed<=client_allowed|historical_changed|frontend_allowed, 'Unrelated function changed since authorized baseline'
for name in set(client_before)-client_allowed:
    if name not in frontend_allowed:
        expected=accepted.get(name) if name in historical_changed else client_before[name]
        assert expected==a.get(name), 'Unrelated function changed: '+name
# A second, current-source oracle covers EVERY function, including the original
# transport exceptions. Only the eight named repairs replace equality with the
# complete actual-app browser suite below. Added/deleted functions also reject.
current_changed={name for name in set(accepted)|set(a) if accepted.get(name)!=a.get(name)}
assert current_changed<=frontend_allowed, 'Unrelated current-source function changed: '+', '.join(sorted(current_changed-frontend_allowed))
assert set(a)==set(accepted), 'Function inventory changed'
for name in set(accepted)-frontend_allowed:
    assert accepted[name]==a[name], 'Untouched accepted function changed: '+name

def nonfunction_source(data):
    # Preserve comments, whitespace, startup handlers and all other top-level
    # bytes, modulo the existing CRLF normalization and one exact declaration.
    data=data.replace(bytes([13,10]),bytes([10]))
    tree=p.parse(data)
    spans=[(n.start_byte,n.end_byte) for n in tree.root_node.children if n.type=='function_declaration']
    for start,end in reversed(spans):
        data=data[:start]+data[end:]
    return data

accepted_nonfunction=nonfunction_source(accepted_source)
current_nonfunction=nonfunction_source(after)
declaration=b'let sectionGeneration=0;\n'
assert current_nonfunction.count(declaration)==1, 'Exact section generation declaration missing/duplicated'
assert current_nonfunction.replace(declaration,b'',1)==accepted_nonfunction, 'Unrelated top-level source changed'

# Original transport/session source exceptions retain actual-source regressions;
# the test itself must remain the accepted oracle, not a substituted PASS stub.
transport_test='tests/client_session_ownership.mjs'
assert (repo/transport_test).read_bytes().replace(bytes([13,10]),bytes([10]))==subprocess.check_output(['git','show',accepted_baseline+':'+transport_test],cwd=repo).replace(bytes([13,10]),bytes([10])), 'Transport oracle changed'

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
# Historical additions come ONLY from immutable a441 -> accepted 3bb history,
# never from the candidate's working-tree inventory. Preserve the original
# cumulative path gate and add a stricter current-phase/new-file gate.
accepted_paths=set(subprocess.check_output(['git','diff','--name-only',baseline,accepted_baseline],cwd=repo,text=True).splitlines())
new_paths={'docs/auth/FAISAL_LOGIN_STATUS.md',
           'docs/NON_AUTHENTICATED_CONTINUATION_2026-10-15.md',
           'tests/frontend_navigation_races.py',
           'tests/transactions_noauth_guard_regressions_test.ts'}
# The combined phase also owns these pre-existing source/document paths.
# Concurrent main contributed documentation only; accept its exact immutable
# contents, never an arbitrary working-tree path or a runtime-source change.
documentary_baseline='b346b046300a33601288e569d17249cd2632a8d2'
incoming_doc_paths=set(subprocess.check_output(['git','diff','--name-only',accepted_baseline,documentary_baseline],cwd=repo,text=True).splitlines())
assert incoming_doc_paths=={'CHANGELOG.md','docs/tasks/LEGACY_INVENTORY.md'}, 'Unexpected documentary main delta'
incoming_legacy=subprocess.check_output(['git','show',documentary_baseline+':docs/tasks/LEGACY_INVENTORY.md'],cwd=repo).decode().replace(chr(13)+chr(10),chr(10))
assert (repo/'docs/tasks/LEGACY_INVENTORY.md').read_text(encoding='utf-8')==incoming_legacy, 'Incoming legacy inventory changed'
incoming_log=subprocess.check_output(['git','show',documentary_baseline+':CHANGELOG.md'],cwd=repo).decode().replace(chr(13)+chr(10),chr(10))
log_header='# Changelog'+chr(10)+chr(10)
assert incoming_log.startswith(log_header)
current_log=(repo/'CHANGELOG.md').read_text(encoding='utf-8')
assert current_log.startswith(log_header) and current_log[len(log_header):].endswith(incoming_log[len(log_header):]), 'Incoming changelog body changed'
phase_allowed={'app.js','index.html','service-worker.js','tests/ui_contracts.py',
               'CHANGELOG.md','docs/HANDOFF.md','docs/PROJECT_STATE.md',
               'supabase/functions/transactions-api/index.ts',
               'tests/performance_asset_cache_test.mjs',
               # Existing parent-owned module; original checks plus current
               # actual-source behavior reconcile its stale equality separately.
               'tests/performance_frontend_regressions.mjs'}|new_paths|incoming_doc_paths
allowed.update(accepted_paths|new_paths|incoming_doc_paths)
paths=set(subprocess.check_output(['git','diff','--name-only',baseline],cwd=repo,text=True).splitlines())
untracked=set(subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines())
paths.update(untracked)
phase_paths=set(subprocess.check_output(['git','diff','--name-only',accepted_baseline],cwd=repo,text=True).splitlines())|untracked
assert untracked<=new_paths, 'Unapproved new path: '+', '.join(sorted(untracked-new_paths))
assert phase_paths<=phase_allowed, 'File changed outside current authorized phase: '+', '.join(sorted(phase_paths-phase_allowed))
assert paths<=allowed, 'File changed outside approved accounts/password/UI/test/document scope'

accepted_asset_version='20261013-release-closure-1'
asset_version='20261015-noauth-guards-1'
for name in ['index.html','service-worker.js']:
    current=(repo/name).read_text(encoding='utf-8').replace(chr(13)+chr(10),chr(10))
    accepted_asset=subprocess.check_output(['git','show',accepted_baseline+':'+name],cwd=repo).decode().replace(chr(13)+chr(10),chr(10))
    runtime_asset=subprocess.check_output(['git','show',accepted_runtime+':'+name],cwd=repo).decode().replace(chr(13)+chr(10),chr(10))
    assert accepted_asset==runtime_asset, 'Accepted asset history mismatch: '+name
    assert accepted_asset_version in accepted_asset, 'Accepted asset namespace mismatch: '+name
    assert current==accepted_asset.replace(accepted_asset_version,asset_version), f'{name} does not reference current asset version or has unrelated changes'
    assert set(re.findall(r'(?:app\.js|styles\.css)\?v=([^"\s]+)',current))=={asset_version}, 'Incorrect asset reference: '+name
assert 'const CACHE="ceo-msajed-static-'+asset_version+'";' in (repo/'service-worker.js').read_text(encoding='utf-8'), 'Incorrect cache namespace'

behavior=subprocess.run([node,'tests/client_session_ownership.mjs'],cwd=repo,capture_output=True,text=True)
assert behavior.returncode==0, behavior.stdout+behavior.stderr
for name in {'refreshAuthSession','post','rpc'}:
    results[name]=behavior.returncode==0

# Exact complete, network-denied browser oracle for the eight frontend repairs.
# The harness executes the whole actual app and native browser DOM; only fetch
# and export boundaries are synthetic. Native Auth/release acceptance is absent.
frontend_test='tests/frontend_navigation_races.py'
frontend_test_sha256='c5d1672d76bc30b95a6e606b1e2de9535b3bc46f7d1e7461d3481938aad17968'
assert hashlib.sha256((repo/frontend_test).read_bytes()).hexdigest()==frontend_test_sha256, 'Frontend behavior oracle changed'
expected_scenarios={
    'test_nav_'+section+'_'+case
    for section in ('profile','permissions')
    for case in ('ordinary_navigation','newer_selection','newer_selection_rejection',
                 'pending_logout_relogin','completed_owner_handoff')
}|{
    'test_fe001_details_complete_during_pending_logout',
    'test_fe001_details_complete_after_logout',
    'test_fe003_refresh_renders_replacement_transactions_host',
    'test_fe003_refresh_completes_while_profile_remains',
    'test_fe004_failed_next_exports_keep_page_one',
    'test_fe004_failed_next_click_retries_page_two_and_recovers',
    'test_fe004_failed_next_retry_button_recovers_page_two',
    'test_fe004_pending_next_exports_keep_committed_page',
    'test_fe004_ordinary_next_success',
    'test_fe004_stale_failure_cannot_roll_back_newer_success'
}
with tempfile.TemporaryDirectory(prefix='ui-contract-',dir=os.environ.get('TMPDIR')) as temporary:
    evidence_root=Path(os.environ.get('UI_CONTRACT_EVIDENCE_DIR',temporary))
    evidence_root.mkdir(parents=True,exist_ok=True)
    frontend_output=evidence_root/'current-contract-frontend-behavior.json'
    frontend_command=[sys.executable,frontend_test,'--output',str(frontend_output)]
    frontend_env=dict(os.environ)
    frontend_env.setdefault('CHROMIUM_EXECUTABLE_PATH','C:/Users/FAiSAL/AppData/Local/hermes/tools/chromium-1208/chrome-win64/chrome.exe')
    frontend_behavior=subprocess.run(frontend_command,cwd=repo,env=frontend_env,capture_output=True,text=True,encoding='utf-8')
    assert frontend_behavior.returncode==0, frontend_behavior.stdout+frontend_behavior.stderr
    frontend_report=json.loads(frontend_output.read_text(encoding='utf-8'))
assert frontend_report['success'] and frontend_report['testsRun']==frontend_report['passed']==20, 'Incomplete frontend behavior run'
assert frontend_report['failures']==frontend_report['errors']==frontend_report['externalRequestCount']==frontend_report['realBusinessWrites']==0, 'Frontend behavior/network failure'
assert frontend_report['pageErrors']==[], 'Frontend browser error'
assert frontend_report['appSha256']==hashlib.sha256(after).hexdigest(), 'Behavior source hash mismatch'
assert frontend_report['harnessSha256']==frontend_test_sha256, 'Behavior harness hash mismatch'
assert len(frontend_report['scenarios'])==20 and all(s['status']=='passed' for s in frontend_report['scenarios']), 'Frontend scenario failure'
assert {s['name'].rsplit('.',1)[-1] for s in frontend_report['scenarios']}==expected_scenarios, 'Incomplete frontend named roster'
assert len(frontend_report['audit'])==20 and {a['scenario'] for a in frontend_report['audit']}==expected_scenarios, 'Incomplete frontend audit roster'
assert all(a['allFetchesInMemory'] and not a['externalRequests'] and not a['unexpectedSyntheticFetches'] and not a['pageErrors'] and a['realBusinessWrites']==0 for a in frontend_report['audit']), 'Frontend transport boundary breached'

restricted=[x for x in ['urgkbbconlxeagfgyjee','msajed-tasks','sb_secret_','service_role','setInterval(']
            if x in source+(repo/'index.html').read_text(encoding='utf-8')]

tree=p.parse(after)
report={
    'baseline':baseline,
    'client_baseline':client_baseline,
    'accepted_baseline':accepted_baseline,
    'accepted_runtime':accepted_runtime,
    'accepted_source_sha256':accepted_source_sha256,
    'app_sha256':hashlib.sha256(after).hexdigest(),
    'historically_accepted_changed_functions':sorted(historical_changed),
    'current_changed_functions':sorted(current_changed),
    'frontend_allowed_functions':sorted(frontend_allowed),
    'untouched_current_functions':sorted(set(accepted)-frontend_allowed),
    'nonfunction_source_preserved':True,
    'accepted_asset_version':accepted_asset_version,
    'asset_version':asset_version,
    'historically_accepted_paths':sorted(accepted_paths),
    'phase_changed_paths':sorted(phase_paths),
    'phase_allowed_paths':sorted(phase_allowed),
    'permitted_new_paths':sorted(new_paths),
    'client_behavior_command':[node,'tests/client_session_ownership.mjs'],
    'client_behavior_named_cases':behavior.stdout.strip().splitlines()[:-1],
    'frontend_behavior_command':frontend_command,
    'frontend_behavior_exit':frontend_behavior.returncode,
    'frontend_behavior_summary':{k:frontend_report[k] for k in ('testsRun','passed','failures','errors','externalRequestCount','pageErrors','realBusinessWrites','appSha256','harnessSha256','scenarios')},
    'acceptance_scope':'offline synthetic only; no native Auth, release or deployment acceptance',
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
