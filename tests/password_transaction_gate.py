from pathlib import Path
s=(Path(__file__).resolve().parents[1]/'supabase/functions/transactions-api/index.ts').read_text(encoding='utf-8')
start=s.index('async function identity(');end=s.index('async function units()',start);body=s[start:end]
assert 'account_session_check_internal' in body,'service-role transaction API must validate credential generation/session on every request'
assert 'identityCache' not in body,'credential authorization may not be bypassed by cached identity'
assert 'p_allow_forced:false' in body,'pending/forced sessions must be denied'
print('Transaction credential gate static checks passed; not live API evidence')
