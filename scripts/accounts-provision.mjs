import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

// Local-only dependency-injected account provisioning. Importing never performs I/O.
// Only msajed-ceo-erp is authorized. The caller supplies and owns the adapter.
const FAISAL_ID = '0a1df502-9232-4ef5-af2d-df585ad7f187';
const OFFICE = 'مكتب الرئيس التنفيذي';
const ADMIN = 'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية';
const TECH = 'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية';
const FINANCE = 'الإدارة المالية';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class GuardError extends Error {
  constructor(canonical_key, code) { super(code); this.canonical_key = canonical_key; this.code = code; }
}
const requireFact = (ok, key, code) => { if (!ok) throw new GuardError(key, code); };
const text = value => typeof value === 'string' && value.length > 0;
const one = (rows, key, code) => { requireFact(rows.length === 1, key, code); return rows[0]; };

function expectedMemberships(row, units) {
  const key = row.canonical_key;
  const type = row.org_name === OFFICE ? 'office' : [ADMIN, TECH].includes(row.org_name) ? 'sector' : row.org_name === FINANCE ? 'independent' : null;
  requireFact(type, key, 'unapproved_root');
  const root = one(units.filter(u => u.active === true && u.parent_id === null && u.name === row.org_name && u.unit_type === type), key, 'ambiguous_root');
  const departments = row.dept_names;
  requireFact(Array.isArray(departments) && departments.every(text) && new Set(departments).size === departments.length, key, 'invalid_departments');
  if (['ceo', 'ceo_office_manager', 'ceo_secretary', 'assistant', 'assistant_secretary'].includes(row.role_code)) {
    const officeRole = ['ceo', 'ceo_office_manager', 'ceo_secretary'].includes(row.role_code);
    requireFact(officeRole ? type === 'office' && departments.length === 1 && departments[0] === row.org_name : type === 'sector' && departments.length === 0, key, 'hierarchy_conflict');
    return [{ unit_id: root.id, membership_role: row.role_code === 'assistant' ? 'assistant' : 'office', is_primary: true }];
  }
  requireFact(['manager', 'employee'].includes(row.role_code) && departments.length > 0, key, 'hierarchy_conflict');
  return departments.map((department, index) => {
    let unit;
    if (type === 'office' || type === 'independent') {
      requireFact(departments.length === 1 && department === row.org_name, key, 'hierarchy_conflict');
      unit = root;
    } else {
      unit = one(units.filter(u => u.active === true && u.name === department && (
        (u.unit_type === 'department' && u.parent_id === root.id) ||
        (u.unit_type === 'branch' && units.some(g => g.id === u.parent_id && g.active === true && g.name === 'الفروع' && g.unit_type === 'branch_group' && g.parent_id === root.id))
      )), key, 'ambiguous_department');
    }
    return { unit_id: unit.id, membership_role: row.role_code === 'manager' ? 'manager' : 'member', is_primary: index === 0 };
  });
}

function assertAuthStatus(user, key) {
  // The adapter must supplement omitted official GET fields with exact-ID,
  // exact-email typed read-only facts; absence/undefined is never null.
  requireFact(['banned_until', 'deleted_at'].every(field => Object.hasOwn(user, field) &&
    (user[field] === null || text(user[field]))), key, 'auth_status_unknown');
  requireFact(text(user.email_confirmed_at) && user.banned_until === null && user.deleted_at === null, key, 'auth_not_ready');
}

export const EXECUTOR_SOURCE_MAIN='717375eee1e99d558af80eca91a7ea7e829edd20';
const sha=value=>createHash('sha256').update(value).digest('hex');
/** Read mapping evidence only: this parser never evaluates or executes SQL. */
export function buildOriginalStaffInventory(staffText,mappingSql) {
  try {
    const staff=JSON.parse(staffText);
    requireFact(Array.isArray(staff) && staff.length===57 && new Set(staff.map(s=>s.name)).size===57,null,'canonical_source_join_required');
    const block=mappingSql.match(/insert into public\.account_migration_users\s*\(canonical_key,preferred_login,display_name,role_code,job_title,org_name,dept_names,internal_email,eligible,must_change_password\)\s*values\s*([\s\S]*?)\s*on conflict\(canonical_key\)/);
    requireFact(block,null,'canonical_source_join_required');
    const rows=block[1].trim().split(/\r?\n/);
    const identities=rows.map(line=>{
      const m=line.match(/^\('((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)','((?:[^']|'')*)',null,'((?:[^']|'')*)',array\[((?:[^\]]|\]\])*)\]::text\[\],'((?:[^']|'')*)',true,true\),?$/);
      requireFact(m,null,'canonical_source_join_required');
      const decode=s=>s.replaceAll("''","'");
      const [canonical_key,preferred_login,display_name,role_code,org_name,rawDepartments,internal_email]=m.slice(1).map(decode);
      requireFact(!rawDepartments || /^(?:'[^']*')(?:,'[^']*')*$/.test(rawDepartments),canonical_key,'canonical_source_join_required');
      const dept_names=rawDepartments?Array.from(rawDepartments.matchAll(/'([^']*)'/g),m=>m[1]):[];
      const original=one(staff.filter(s=>s.name===display_name),canonical_key,'canonical_source_join_required');
      requireFact(['name','location','department_original','position','reports_to'].every(k=>text(original[k])),canonical_key,'canonical_source_join_required');
      return {canonical_key,preferred_login,display_name,role_code,org_name,dept_names,internal_email,source_identity:structuredClone(original)};
    });
    requireFact(identities.length===57 && new Set(identities.map(s=>s.canonical_key)).size===57 && new Set(identities.map(s=>s.display_name)).size===57 && identities.some(s=>s.canonical_key==='faisal'),null,'canonical_source_join_required');
    return freezeTree({source_main:EXECUTOR_SOURCE_MAIN,authority:'parent-approved-original-staff-keys',canonical_keys:identities.map(s=>s.canonical_key),identities,
      source_hashes:{staff_original:sha(staffText),canonical_mapping:sha(mappingSql)}});
  } catch {throw new Error('canonical_source_join_required');}
}
export function loadCanonicalStaffInventory() {
  return buildOriginalStaffInventory(readFileSync(new URL('../data/staff/staff-original.json',import.meta.url),'utf8'),
    readFileSync(new URL('../supabase/migrations/20261004210000_full_staff_registry_profiles.sql',import.meta.url),'utf8'));
}
export function inventoryDigest(baseline) {return sha(JSON.stringify(baseline));}

/** Pure nonsecret current plan; trusted scope is supplied, never inferred. */
export function planProvision(registry, users, units, staffInventory) {
  try {
    requireFact(Array.isArray(registry) && Array.isArray(users) && Array.isArray(units), null, 'invalid_inventory');
    const unique = (items, field, code, fold = false) => {
      const seen = new Set();
      for (const item of items) {
        const value = fold ? item[field]?.toLowerCase() : item[field];
        requireFact(text(value) && !seen.has(value), item.canonical_key ?? null, code);
        seen.add(value);
      }
    };
    unique(users, 'id', 'duplicate_auth_uuid', true);
    unique(users.filter(u => u.email != null), 'email', 'duplicate_auth_email', true);
    requireFact(users.every(u => UUID.test(u.id)), null, 'invalid_auth_uuid');
    unique(units, 'id', 'duplicate_unit_uuid', true);
    requireFact(units.every(u => UUID.test(u.id) && typeof u.active === 'boolean' && (u.parent_id === null || UUID.test(u.parent_id))), null, 'invalid_units');
    unique(registry, 'canonical_key', 'duplicate_registry_key');
    unique(registry.filter(r => r.migrated_user_id != null), 'migrated_user_id', 'duplicate_registry_link', true);
    const allEligible = registry.filter(r => r.eligible === true);
    // Trust comes from the parent-owned exact inventory, never a QA prefix or
    // row order. The designated original JSON has no canonical keys; joining
    // its immutable identity metadata is deliberately the parent's obligation.
    requireFact(staffInventory?.source_main === '717375eee1e99d558af80eca91a7ea7e829edd20' &&
      staffInventory.authority === 'parent-approved-original-staff-keys' &&
      Array.isArray(staffInventory.canonical_keys) && staffInventory.canonical_keys.length === 57 &&
      staffInventory.canonical_keys.every(key => text(key) && /^[a-z][a-z0-9_]*$/.test(key)) &&
      new Set(staffInventory.canonical_keys).size === 57 && staffInventory.canonical_keys.includes('faisal'), null, 'staff_inventory_required');
    const staffKeys = new Set(staffInventory.canonical_keys);
    const eligible = allEligible.filter(r => staffKeys.has(r.canonical_key));
    requireFact(eligible.length === 57, null, 'baseline_drift');
    unique(allEligible, 'internal_email', 'duplicate_registry_email', true);
    unique(allEligible, 'login_username', 'duplicate_registry_username', true);
    unique(allEligible, 'preferred_login', 'duplicate_preferred_login');
    const protectedRow = one(eligible.filter(r => r.canonical_key === 'faisal' || r.migrated_user_id === FAISAL_ID), 'faisal', 'protected_identity_conflict');
    requireFact(protectedRow.canonical_key === 'faisal' && protectedRow.migrated_user_id === FAISAL_ID && protectedRow.must_change_password === false && protectedRow.profile_must_change === false && protectedRow.profile_active === true, 'faisal', 'protected_identity_conflict');
    // Linked/reset counts are current facts, not the historical 10-link baseline.
    const accounts = eligible.map(row => {
      const key = row.canonical_key;
      requireFact(/^[a-z]+[0-9]*$/.test(row.login_username) && !/^staff/i.test(row.login_username), key, 'invalid_username');
      requireFact(text(row.preferred_login) && text(row.display_name) && /^[a-z][a-z0-9_]*$/.test(key) && typeof row.internal_email === 'string' && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@msajed\.local$/.test(row.internal_email), key, 'invalid_registry');
      const protectedAccount = row.canonical_key === 'faisal';
      const linked = row.migrated_user_id != null;
      requireFact(row.migrated_user_id === null || UUID.test(row.migrated_user_id), key, 'invalid_registry_link');
      if (!protectedAccount) requireFact(linked ? row.profile_active === true && typeof row.must_change_password === 'boolean' &&
        row.profile_must_change === row.must_change_password : row.must_change_password === true, key, 'forced_flags_required');
      const match = users.find(u => typeof u.email === 'string' && u.email.toLowerCase() === row.internal_email.toLowerCase());
      requireFact(!match || match.email === row.internal_email, key, 'email_case_drift');
      requireFact(!linked || (match && match.id === row.migrated_user_id), key, 'identity_conflict');
      requireFact(!match || !registry.some(other => other !== row && typeof other.migrated_user_id === 'string' &&
        other.migrated_user_id.toLowerCase() === match.id.toLowerCase()), key, 'identity_conflict');
      if (match) assertAuthStatus(match, key);
      return {
        canonical_key: row.canonical_key, login_username: row.login_username, preferred_login: row.preferred_login,
        display_name: row.display_name, internal_email: row.internal_email, role_code: row.role_code,
        auth_user_id: linked ? row.migrated_user_id : match?.id ?? null,
        action: protectedAccount || (linked && row.must_change_password === false) ? 'preserve' : linked ? 'reset' : match ? 'reuse' : 'create',
        memberships: expectedMemberships(row, units),
      };
    });
    const count = action => accounts.filter(a => a.action === action).length;
    return { status: 'ready', counts: { eligible: eligible.length, linked: eligible.filter(r => r.migrated_user_id != null).length,
      missing: eligible.filter(r => r.migrated_user_id == null).length, create: count('create'), reuse: count('reuse'), reset: count('reset'), preserve: count('preserve') }, accounts };
  } catch (error) {
    return { status: 'blocked', accounts: [], blocked: { canonical_key: error instanceof GuardError ? error.canonical_key : null,
      code: error instanceof GuardError ? error.code : 'invalid_inventory' } };
  }
}

const TARGET = 'https://movzojtnkkmdsjhmlgtq.supabase.co';
function checkTarget(port) {
  requireFact(port?.targetUrl === TARGET || port?.targetUrl === `${TARGET}/`, null, 'wrong_target');
  let url;
  try { url = new URL(port?.targetUrl); } catch { throw new GuardError(null, 'wrong_target'); }
  requireFact(url.origin === TARGET && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash, null, 'wrong_target');
}

const officialAuthAdapters=new WeakMap();
export function isOfficialAuthAdminAdapter(port){
  const binding=officialAuthAdapters.get(port?.auth);
  return !!binding && binding.listAllUsers===port.listAllUsers && binding.targetUrl===port.targetUrl && port.transportMode==='official-auth-admin';
}

/**
 * Future server-only official SDK adapter. No client construction, environment,
 * key loading, login, fallback HTTP or provider request occurs at import/build.
 * Parent supplies a fresh official Supabase client and a synchronous permit.
 * Actual promises (not raced wrappers) return to the executor's IO custody.
 */
export function createOfficialAuthAdminAdapter({client,targetUrl,authorize,perPage=1000,maxPages=10000,readAuthStatusFacts}={}) {
  checkTarget({targetUrl});
  requireFact(client?.supabaseUrl===TARGET && typeof authorize==='function' && Number.isSafeInteger(perPage) && perPage>0 && perPage<=1000 && Number.isSafeInteger(maxPages) && maxPages>0 && maxPages<=10000,null,'official_adapter_required');
  const permit=()=>{checkTarget({targetUrl});requireFact(client.supabaseUrl===TARGET,null,'wrong_sdk_target');requireFact(authorize()===true,null,'official_adapter_not_authorized');};
  const unwrap=async(fn)=>{try{permit();const r=await fn();requireFact(r && !r.error && r.data,null,'official_adapter_error');return r.data;}catch{throw new Error('official_adapter_error');}};
  const status=async user=>{
    requireFact(user && UUID.test(user.id),null,'official_adapter_identity_required');
    const result=structuredClone(user),missing=['banned_until','deleted_at'].filter(k=>!Object.hasOwn(result,k));
    if(missing.length && readAuthStatusFacts){
      permit();const f=await readAuthStatusFacts(result.id,result.email);
      requireFact(f?.id===result.id && f.email===result.email && ['banned_until','deleted_at'].every(k=>Object.hasOwn(f,k) && (f[k]===null || text(f[k]))),null,'auth_status_facts_conflict');
      for(const k of ['banned_until','deleted_at']){if(Object.hasOwn(result,k))requireFact(result[k]===f[k],null,'auth_status_facts_conflict');else result[k]=f[k];}
    }
    return result;
  };
  const adapter=Object.freeze({targetUrl,transportMode:'official-auth-admin',
    async listAllUsers(){
      try {
        const users=[],ids=new Set(),emails=new Set();let total=null;
        for(let page=1;page<=maxPages;page++){
          const data=await unwrap(()=>client.auth.admin.listUsers({page,perPage}));
          requireFact(Array.isArray(data.users) && data.users.length<=perPage,null,'incomplete_auth_inventory');
          if(data.total!=null){requireFact(Number.isSafeInteger(data.total) && data.total>=0 && (total===null || total===data.total),null,'inventory_pagination_drift');total=data.total;}
          for(const raw of data.users){
            const u=await status(raw),id=u.id.toLowerCase(),email=u.email?.toLowerCase();
            requireFact(!ids.has(id) && (email==null || !emails.has(email)),null,'duplicate_official_auth_identity');
            ids.add(id);if(email!=null)emails.add(email);users.push(u);
          }
          // Probe an empty terminal page, including an exact-multiple boundary.
          if(data.users.length===0){requireFact(total===null || users.length===total,null,'incomplete_auth_inventory');return {users,complete:true,pages:page};}
        }
        throw new Error('incomplete_auth_inventory');
      }catch{throw new Error('official_inventory_unverified');}
    },
    auth:Object.freeze({
      async getUserById(id){try{requireFact(UUID.test(id),null,'invalid_auth_uuid');const data=await unwrap(()=>client.auth.admin.getUserById(id));const u=await status(data.user);requireFact(u.id===id,null,'official_auth_identity_conflict');return u;}catch{throw new Error('official_get_unverified');}},
      async createUser(payload){try{const data=await unwrap(()=>client.auth.admin.createUser(payload));requireFact(data.user && UUID.test(data.user.id),null,'official_create_unverified');return data.user;}catch{throw new Error('official_create_uncertain');}}
    })
  });
  officialAuthAdapters.set(adapter.auth,{listAllUsers:adapter.listAllUsers,targetUrl});
  return adapter;
}

function newPassword(used) {
  // Uniform rejection sampling across all 94 printable, non-space ASCII chars.
  // Twenty independent chars (>130 bits before the negligible policy rejection).
  for (;;) {
    let password = '';
    while (password.length < 20) {
      for (const byte of randomBytes(32)) {
        if (byte < 188 && password.length < 20) password += String.fromCharCode(33 + byte % 94);
      }
    }
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password) && !used.has(password)) {
      used.add(password); return password;
    }
  }
}

const registryFields = ['canonical_key', 'login_username', 'preferred_login', 'display_name', 'role_code', 'org_name', 'internal_email', 'eligible'];
const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const sameMembership = (a, b) => a.unit_id === b.unit_id && a.membership_role === b.membership_role && a.is_primary === b.is_primary;
function assertProjection(account, original, snapshot, id, linked, exact = linked) {
  const key = account.canonical_key;
  const row = snapshot?.registry;
  requireFact(row && registryFields.every(field => row[field] === original[field]) && sameArray(row.dept_names, original.dept_names), key, 'registry_drift');
  requireFact(row.migrated_user_id === (linked ? id : null), key, 'identity_conflict');
  requireFact(Array.isArray(snapshot.login_conflicts) && snapshot.login_conflicts.length === 0, key, 'profile_conflict');
  requireFact(Array.isArray(snapshot.roles) && Array.isArray(snapshot.memberships), key, 'invalid_projection');
  const forced = account.action !== 'preserve';
  requireFact(row.must_change_password === forced, key, 'forced_flags_required');
  const profile = snapshot.profile;
  if (linked || profile) {
    requireFact(profile && profile.id === id && profile.active === true && profile.login_name === account.preferred_login, key, 'profile_conflict');
    if (linked) requireFact(profile.must_change_password === forced && row.profile_active === true && row.profile_must_change === forced, key, 'forced_flags_required');
    if (exact) requireFact(profile.full_name === account.display_name, key, 'profile_conflict');
  }
  requireFact(snapshot.roles.every(r => r.role_code === account.role_code && r.is_primary === true) && snapshot.roles.length <= 1, key, 'role_conflict');
  requireFact(snapshot.memberships.every(m => m.active === true && account.memberships.some(expected => sameMembership(m, expected))) &&
    snapshot.memberships.every((m, i, all) => all.findIndex(other => sameMembership(m, other)) === i), key, 'membership_conflict');
  if (exact) requireFact(snapshot.roles.length === 1 && snapshot.memberships.length === account.memberships.length, key, 'authorization_incomplete');
  if (!linked) requireFact(snapshot.credential_generation === 0 && snapshot.has_password_operations === false, key, 'credential_state_conflict');
}
function assertUser(account, user, id) {
  requireFact(user && UUID.test(user.id) && user.id === id && user.email === account.internal_email, account.canonical_key, 'identity_conflict');
  requireFact(text(user.email_confirmed_at) && user.banned_until == null, account.canonical_key, 'auth_not_ready');
  requireFact(user.app_metadata && typeof user.app_metadata === 'object' && !Array.isArray(user.app_metadata), account.canonical_key, 'invalid_auth_metadata');
}
function assertOperation(account, result, operationId, id, generation, status, allowed) {
  requireFact(result && result.operation_id === operationId && result.target_user_id === id && result.canonical_key === account.canonical_key &&
    result.login_username === account.login_username && Number.isSafeInteger(result.generation) && result.generation > 0 &&
    (generation == null || result.generation === generation) && result.status === status && result.write_allowed === allowed,
  account.canonical_key, 'operation_not_authorized');
}

function freezeTree(value, seen = new WeakSet()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const item of Object.values(value)) freezeTree(item, seen);
    Object.freeze(value);
  }
  return value;
}

function assertExistingProjection(account, original, snapshot) {
  const key = account.canonical_key;
  const row = snapshot?.registry;
  const profile = snapshot?.profile;
  requireFact(row && registryFields.every(field => row[field] === original[field]) && sameArray(row.dept_names, original.dept_names), key, 'registry_drift');
  requireFact(row.migrated_user_id === account.auth_user_id && row.must_change_password === original.must_change_password &&
    row.profile_active === true && row.profile_must_change === original.profile_must_change, key, 'identity_conflict');
  requireFact(profile && profile.id === account.auth_user_id && profile.active === true &&
    profile.login_name === account.preferred_login && profile.full_name === account.display_name, key, 'profile_conflict');
  requireFact(profile.must_change_password === original.must_change_password, key, 'forced_flags_required');
  requireFact(Array.isArray(snapshot.login_conflicts) && snapshot.login_conflicts.length === 0, key, 'profile_conflict');
  requireFact(['roles', 'memberships', 'permission_overrides', 'page_overrides'].every(field =>
    Object.hasOwn(snapshot, field) && Array.isArray(snapshot[field]) && snapshot[field].every(item => item && typeof item === 'object' && !Array.isArray(item))), key, 'authorization_snapshot_incomplete');
  // Actual linked authorization is a preservation baseline, NOT a template to
  // synchronize with canonical role/membership expectations for new accounts.
  if (key === 'faisal') assertProjection(account, original, snapshot, FAISAL_ID, true);
}

/**
 * PLAN-ONLY adapter: registry/units/full paginated listAllUsers/readAccount and
 * official auth.getUserById only. It must return explicit null|string ban and
 * deletion facts for matched list rows AND official GET rows. If GET omits
 * them, supplement via authorized exact-ID/email typed reads, never infer null.
 * readAccount must include complete permission_overrides/page_overrides arrays;
 * no credentials, hashes, private controllers or password-operation payloads.
 * Parent-approved original-key inventory is an input trust boundary, not a
 * client-supplied authorization token. Parent must independently join the
 * designated source identities to exact live keys. No prefix/truncation rule.
 * This returns a frozen in-memory plan/baseline, NOT execution authorization.
 */
async function prepareProvision(port, staffInventory, result) {
  const read = async (name, ...args) => {
    checkTarget(port);
    if (name === 'auth.getUserById') return await port.auth.getUserById(...args);
    return await port[name](...args);
  };
  requireFact(['registry', 'units', 'listAllUsers', 'readAccount'].every(name => typeof port[name] === 'function') &&
    typeof port.auth?.getUserById === 'function', null, 'invalid_adapter');
  const registry = await read('registry');
  const units = await read('units');
  const inventory = await read('listAllUsers');
  requireFact(inventory?.complete === true && Array.isArray(inventory.users), null, 'incomplete_auth_inventory');
  const plan = planProvision(registry, inventory.users, units, staffInventory);
  if (plan.status !== 'ready') { result.blocked = plan.blocked; return result; }
  const baseline = { staff_inventory: structuredClone(staffInventory), registry: structuredClone(registry),
    units: structuredClone(units), users: structuredClone(inventory.users), accounts: Object.create(null) };
  for (const account of plan.accounts) {
    const original = registry.find(row => row.canonical_key === account.canonical_key);
    const snapshot = await read('readAccount', account.canonical_key, account.auth_user_id);
    if (original.migrated_user_id !== null) assertExistingProjection(account, original, snapshot);
    else {
      assertProjection(account, original, snapshot, account.auth_user_id, false);
      if (snapshot.profile) requireFact(snapshot.profile.full_name === account.display_name, account.canonical_key, 'profile_conflict');
      requireFact(['permission_overrides', 'page_overrides'].every(field => Object.hasOwn(snapshot, field) &&
        Array.isArray(snapshot[field])), account.canonical_key, 'authorization_snapshot_incomplete');
    }
    let user = null;
    if (account.auth_user_id) {
      user = await read('auth.getUserById', account.auth_user_id);
      assertUser(account, user, account.auth_user_id);
      assertAuthStatus(user, account.canonical_key);
    }
    baseline.accounts[account.canonical_key] = { projection: structuredClone(snapshot), user: structuredClone(user) };
  }
  const select = action => plan.accounts.filter(account => account.action === action);
  result.plan = freezeTree(plan);
  result.execution = freezeTree({ status: 'blocked', required_endpoint: 'account-admin-reset-password',
    create: select('create'), reuse: select('reuse'),
    reset: select('reset').map(({ canonical_key, auth_user_id, login_username }) => ({ canonical_key, auth_user_id, login_username })),
    preserve: select('preserve'),
    blockers: ['parent_review_required', 'owned_qa_native_reset_gate_required',
      'parent_owned_native_endpoint_adapter_required', 'approved_create_and_atomic_link_adapter_required',
      'actor_template_unit_exact_readback_required', 'provider_and_projection_readback_required'] });
  Object.defineProperty(result, 'baseline', { value: freezeTree(baseline) });
  result.status = 'reviewed';
  return result;
}

/**
 * Safety-compatible legacy entry: deliberately NOT an executor.
 * The obsolete mixed reset/create runner is retired, not available as another
 * export or hidden execution mode. Parent review and the existing native
 * account-admin-reset-password QA gate are prerequisites to a future adapter.
 * No adapter method, provider write, password generation or delivery occurs.
 */
export async function provisionAccounts(port, onReceipt = () => {}, options = {}) {
  const result = { status: 'blocked', created: 0, reset: 0, receipts: [],
    required_endpoint: 'account-admin-reset-password' };
  Object.defineProperty(result, 'credentials', { value: [] });
  try {
    checkTarget(port);
    requireFact(typeof onReceipt === 'function', null, 'invalid_adapter');
    if (options?.mode === 'plan-only') return await prepareProvision(port, options.staffInventory, result);
    result.blocked = { canonical_key: null, code: 'native_reset_endpoint_required' };
  } catch (error) {
    result.blocked = { canonical_key: error instanceof GuardError ? error.canonical_key : null,
      code: error instanceof GuardError ? error.code : 'invalid_adapter' };
  }
  return result;
}
