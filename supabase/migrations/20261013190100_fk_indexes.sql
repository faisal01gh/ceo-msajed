-- PROPOSED_NOT_APPLIED. New-system source proposal; no live DDL authorized.
-- Supplied Advisor findings: account_password_operations.actor_id and
-- transaction_read_state.user_id lack a leading equivalent index in current DDL.
-- Existing (target_id,generation) and (transaction_id,user_id) do not cover these
-- FK lookups. Recheck catalog equivalence on eventual authorized application.
-- No unused index is removed; no business/account data is changed.
begin;
-- Make deparsed built-in predicates unambiguous; restored at transaction end.
set local search_path = pg_catalog;
do $$
declare
  target record;
  candidate record;
  covered boolean;
  unresolved boolean;
begin
  for target in
    select * from (values
      ('app_private.account_password_operations'::regclass, 'actor_id'),
      ('app_private.transaction_read_state'::regclass, 'user_id')
    ) as targets(relation_id, key_name)
  loop
    covered := false;
    unresolved := false;
    for candidate in
      select i.indcheckxmin, am.amname, a.attnum,
        pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate,
        exists (
          select 1 from pg_catalog.pg_opclass opc
          join pg_catalog.pg_amop eq on eq.amopfamily=opc.opcfamily
          where opc.oid=i.indclass[0] and opc.opcmethod=am.oid
            and opc.opcintype='uuid'::regtype
            and eq.amopmethod=am.oid and eq.amoppurpose='s'
            and eq.amoplefttype='uuid'::regtype and eq.amoprighttype='uuid'::regtype
            and eq.amopopr='pg_catalog.=(uuid,uuid)'::regoperator
            and eq.amopstrategy=case am.amname when 'btree' then 3 when 'hash' then 1 end
        ) as equality_compatible
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ix on ix.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=ix.relam
      join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
      where i.indrelid=target.relation_id and a.attname=target.key_name
        and a.atttypid='uuid'::regtype and not a.attisdropped
        and i.indnkeyatts>0 and i.indisvalid and i.indisready and i.indislive
      -- Only indkey[0]/indclass[0] govern the leading key. Trailing expressions
      -- and INCLUDE attributes neither disqualify it nor provide coverage.
    loop
      if candidate.amname not in ('btree','hash') or candidate.indcheckxmin then
        unresolved := true;
      elsif not candidate.equality_compatible then
        continue;
      elsif candidate.predicate is null
         or candidate.predicate=format('(%I IS NOT NULL)', target.key_name) then
        -- UUID FK equality probes are non-null, so this partial index covers all.
        covered := true;
      elsif candidate.predicate=format('(%I IS NULL)', target.key_name) or exists (
        -- A simple range/equality restriction on a different integer column is
        -- not implied by the key-only probe. Keep this grammar deliberately
        -- narrow; arbitrary predicates must not silently cause duplicates.
        select 1 from pg_catalog.pg_attribute other_column
        where other_column.attrelid=target.relation_id
          and other_column.attnum>0 and other_column.attnum<>candidate.attnum
          and not other_column.attisdropped
          and other_column.atttypid in ('int2'::regtype,'int4'::regtype,'int8'::regtype)
          and (pg_catalog.regexp_match(candidate.predicate,
            '^\(([^ ]+) (?:>|>=|<|<=|=|<>) -?[0-9]+\)$'))[1]
              =pg_catalog.quote_ident(other_column.attname)
      ) then
        continue;
      else
        unresolved := true;
      end if;
    end loop;
    if not covered then
      if unresolved then
        raise exception 'Unresolved FK index equivalence for %.%; catalog review required',
          target.relation_id, target.key_name;
      end if;
      if target.key_name='actor_id' then
        create index idx_account_password_operations_actor_id
          on app_private.account_password_operations(actor_id);
      else
        create index idx_transaction_read_state_user_id
          on app_private.transaction_read_state(user_id);
      end if;
    end if;
  end loop;
end;
$$;
commit;
