// Run with Deno --cached-only --deny-net; PGLITE_MODULE may name a cached file URL.
// Fixtures are generated in owned memory. No source seeds or native database access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { statements } from './performance_backend_sql_shape.mjs';

const modulePath = Deno.env.get('PGLITE_MODULE');
const { PGlite } = await import(modulePath
  ? (modulePath.startsWith('file:') ? modulePath : pathToFileURL(modulePath).href)
  : '@electric-sql/pglite');
const source = fs.readFileSync(new URL('../supabase/migrations/20261013190100_fk_indexes.sql', import.meta.url));
const proposal = statements(source.toString()).filter(s => !/^(begin|commit);$/i.test(s)).join('\n');
const evidencePath = Deno.env.get('FK_INDEX_EVIDENCE');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const nodes = p => [p, ...(p.Plans ?? []).flatMap(nodes)];
const configs = [
  ['account_actor_id', 'account_password_operations', 'actor_id', 'target_id', 'generation', 'idx_account_password_operations_actor_id'],
  ['readstate_user_id', 'transaction_read_state', 'user_id', 'transaction_id', 'seen_revision', 'idx_transaction_read_state_user_id'],
];

Deno.test({ name: 'FK proposal uses only proven leading UUID equality coverage', sanitizeOps: false, sanitizeResources: false, fn: async t => {
  assert.equal((await Deno.permissions.query({ name: 'net' })).state, 'denied');
  const db = new PGlite();
  const evidence = { classification: 'LOCAL_SYNTHETIC_PGLITE_ONLY', networkRequests: 0,
    diagnosticOnly: 'enable_seqscan=off; EXPLAIN timings are not a performance benchmark',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    harnessSha256: createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),
    staff: 80, rowsPerTarget: 120, cases: [] };
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const catalog = () => query(`select c.relname, pg_get_indexdef(i.indexrelid) as definition,
    i.indisvalid, i.indisready, i.indnkeyatts, i.indnatts, i.indkey::text,
    pg_get_expr(i.indpred,i.indrelid) as predicate, pg_get_expr(i.indexprs,i.indrelid) as expressions
    from pg_index i join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' order by c.relname`);
  const plan = async sql => (await query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql))[0]['QUERY PLAN'];
  try {
    await db.exec(`create schema app_private;
      create table public.synthetic_staff(id uuid primary key);
      create table app_private.account_password_operations(actor_id uuid references public.synthetic_staff,
        target_id uuid, generation bigint, primary key(target_id,generation));
      create table app_private.transaction_read_state(user_id uuid references public.synthetic_staff,
        transaction_id uuid, seen_revision bigint, primary key(transaction_id,user_id));
      create operator class public.uuid_order_only_ops for type uuid using btree as
        operator 1 < (uuid,uuid), operator 2 <= (uuid,uuid), operator 4 >= (uuid,uuid),
        operator 5 > (uuid,uuid), function 1 uuid_cmp(uuid,uuid);
      create operator class public.uuid_wrong_type_equality_ops for type uuid using btree as
        operator 1 < (uuid,uuid), operator 3 = (integer,integer), function 1 uuid_cmp(uuid,uuid);
      create operator class public.uuid_wrong_operator_ops for type uuid using btree as
        operator 1 < (uuid,uuid), operator 3 <> (uuid,uuid), function 1 uuid_cmp(uuid,uuid);`);
    for (let n = 1; n <= 80; n++) await db.query('insert into public.synthetic_staff values ($1)', [id(n)]);
    for (const [, table] of configs) {
      for (let n = 1; n <= 120; n++) await db.query(`insert into app_private.${table} values ($1,$2,$3)`, [id((n - 1) % 80 + 1), id(1000 + n), n % 3]);
    }
    await db.exec('analyze');
    evidence.postgresVersion = (await query('select version()'))[0].version;
    for (const [label, table, key, other, numeric, proposed] of configs) {
      // The first twelve are the independent review's unchanged 24-scenario matrix.
      const variants = [
        ['no_equivalent', null, false],
        ['leading_multicolumn', `(${key},${other})`, true],
        ['leading_include', `(${key}) INCLUDE (${other})`, true],
        ['include_only', `(${other}) INCLUDE (${key})`, false],
        ['nonleading', `(${other},${key})`, false],
        ['leading_trailing_expression', `(${key},(${numeric}+0))`, true],
        ['expression_leading', `((${key}::text))`, false],
        ['partial_nonnull', `(${key}) WHERE ${key} IS NOT NULL`, true],
        ['partial_restrictive', `(${key}) WHERE ${numeric}>1`, false],
        ['explicit_uuid_ops', `(${key} pg_catalog.uuid_ops)`, true],
        ['hash_equality', `USING hash (${key})`, true],
        ['btree_opclass_without_equality', `(${key} public.uuid_order_only_ops)`, false],
        ['expression_and_include', `(${key},(${numeric}+0)) INCLUDE (${other})`, true],
        ['btree_wrong_equality_types', `(${key} public.uuid_wrong_type_equality_ops)`, false],
        ['btree_wrong_equality_operator', `(${key} public.uuid_wrong_operator_ops)`, false],
        ['unresolved_predicate', `(${key}) WHERE ${key} IS NOT NULL OR ${numeric}>1`, 'fail_closed'],
        ['unresolved_access_method', `USING brin (${key})`, 'fail_closed'],
        ['multicolumn_and_include', `(${key},${numeric}) INCLUDE (${other})`, true],
        ['descending', `(${key} DESC NULLS FIRST)`, true],
        ['invalid_index', `(${key})`, false],
        ['not_ready_index', `(${key})`, false],
      ];
      for (const [name, ddl, equivalent] of variants) await t.step(`${label}: ${name}`, async () => {
        await db.exec('begin');
        const candidate = 'candidate_' + name;
        const row = { label, name, independentReviewCase: variants.findIndex(v => v[0] === name) < 12, expectedEquivalent: equivalent };
        evidence.cases.push(row);
        try {
          if (ddl) await db.exec(`create index ${candidate} on app_private.${table} ${ddl}`);
          // Exercise real planner/catalog state only in this rolled-back memory fixture.
          if (name === 'invalid_index' || name === 'not_ready_index') {
            const flag = name === 'invalid_index' ? 'indisvalid' : 'indisready';
            await db.query(`update pg_catalog.pg_index set ${flag}=false where indexrelid=$1::regclass`, ['app_private.' + candidate]);
          }
          await db.exec('set local enable_seqscan=off');
          const probes = [1, 80].map(n => `select 1 from app_private.${table} where ${key}='${id(n)}'::uuid`);
          row.beforePlans = await Promise.all(probes.map(plan));
          row.plannerUsesExistingEqualityIndex = row.beforePlans.every(p => nodes(p[0].Plan).some(n => n['Index Name'] === candidate && !!n['Index Cond']));
          row.catalogBefore = await catalog();
          if (equivalent === 'fail_closed') {
            await assert.rejects(db.exec(proposal), e => e.code === 'P0001' && /unresolved FK index equivalence/i.test(e.message));
            row.explicitFailClosed = true;
          } else {
            await db.exec(proposal);
            row.catalogAfter = await catalog();
            row.proposalAdded = row.catalogAfter.some(i => i.relname === proposed);
            await db.exec(proposal);
            assert.deepEqual(await catalog(), row.catalogAfter, 'second application must be idempotent');
            row.idempotentSecondApply = true;
            row.afterPlans = await Promise.all(probes.map(plan));
            if (equivalent) assert(row.plannerUsesExistingEqualityIndex, 'planner must prove both non-null UUID probes use the candidate');
            if (name.includes('opclass') || name.includes('wrong_equality')) assert.equal(row.plannerUsesExistingEqualityIndex, false);
            assert.equal(row.proposalAdded, !equivalent, 'add only when no equivalent leading equality index exists');
            const expectedIndex = equivalent ? candidate : proposed;
            assert(row.afterPlans.every(p => nodes(p[0].Plan).some(n => n['Index Name'] === expectedIndex && !!n['Index Cond'])));
            if (row.proposalAdded) assert.equal(row.catalogAfter.find(i => i.relname === proposed).definition,
              `CREATE INDEX ${proposed} ON app_private.${table} USING btree (${key})`);
          }
          row.pass = true;
        } finally { await db.exec('rollback'); }
      });
    }
    await t.step('full proposal commits twice with identical definitions and restores search_path', async () => {
      const setting = () => query('show search_path');
      const beforeSetting = await setting();
      const before = await catalog();
      await db.exec(source.toString());
      const after = await catalog();
      assert.equal(after.length - before.length, 2);
      for (const [, table, key, , , proposed] of configs) assert.equal(after.find(i => i.relname === proposed).definition,
        `CREATE INDEX ${proposed} ON app_private.${table} USING btree (${key})`);
      await db.exec(source.toString());
      assert.deepEqual(await catalog(), after);
      assert.deepEqual(await setting(), beforeSetting);
      evidence.fullProposal = { applications: 2, idempotent: true, searchPathRestored: true,
        physicalDefinitions: after.filter(i => !before.some(b => b.relname === i.relname)) };
    });
  } finally {
    await db.close();
    evidence.counts = { total: evidence.cases.length, passed: evidence.cases.filter(c => c.pass).length,
      independent: evidence.cases.filter(c => c.independentReviewCase).length,
      independentFailed: evidence.cases.filter(c => c.independentReviewCase && !c.pass).length,
      idempotent: evidence.cases.filter(c => c.idempotentSecondApply).length };
    if (evidencePath) fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  }
} });
