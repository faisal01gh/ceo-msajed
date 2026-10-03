-- Resolve current holder for imported open legacy transactions using only legacy evidence.
-- Priority: exact current portal assignment > last route > last follow-up conversion > legacy holder level.
-- Ambiguous rows remain needs_review.

with open_legacy as (
  select t.id,t.legacy_sn,t.legacy_department_name,t.legacy_payload,
         case when jsonb_typeof(t.legacy_payload->'route')='array'
                   and jsonb_array_length(t.legacy_payload->'route')>0
              then t.legacy_payload->'route'->(jsonb_array_length(t.legacy_payload->'route')-1)
              else null end last_route,
         case when jsonb_typeof(t.legacy_payload->'refs')='array'
                   and jsonb_array_length(t.legacy_payload->'refs')>0
              then t.legacy_payload->'refs'->(jsonb_array_length(t.legacy_payload->'refs')-1)
              else null end last_ref
  from public.transactions t
  where t.origin='legacy' and t.status='open'
),
resolution as (
  select o.*,
    case
      when o.legacy_sn='377' then 'ahmad'
      when o.last_route->>'stage'='recv' and o.last_route->>'party'='مكتب الرئيس التنفيذي' then 'ceo'
      when o.last_route->>'stage'='refer' and position('مشاريع' in coalesce(o.last_route->>'party',''))>0 then 'bazai'
      when o.last_route->>'stage'='refer' and position('مالية' in coalesce(o.last_route->>'party',''))>0 then 'haif'
      when o.last_ref->>'type'='تحويل متابعة' then
        case
          when o.last_ref->>'deptName' in ('إدارة المشاريع','إدرة المشاريع') then 'majed_projects'
          when o.last_ref->>'deptName'='إدارة الأوقاف والاستثمار' then 'omar_awqaf'
          when o.last_ref->>'deptName' in ('الإدارة القانونية','إدارة الموارد البشرية') then 'abdulrahman'
          when o.last_ref->>'deptName' in ('إدارة تنمية الموارد المالية','إدارة العلاقات العامة','إدارة العلاقات العامة والإعلام') then 'ahmad'
          when o.last_ref->>'deptName'='الإدارة المالية' then 'finance_manager'
          when o.last_ref->>'deptName' in ('إدارة تقنية المعلومات','إدارة التقنية') then 'haif'
          when position('مشاريع' in coalesce(o.last_ref->>'deptName',''))>0 then 'bazai'
          when position('مالية' in coalesce(o.last_ref->>'deptName',''))>0 then 'haif'
          when position('مشاريع' in coalesce(o.last_ref->>'orgName',''))>0 then 'bazai'
          when position('مالية' in coalesce(o.last_ref->>'orgName',''))>0 then 'haif'
          when o.last_ref->>'orgName'='المدير المالي' then 'finance_manager'
          else null
        end
      when o.legacy_department_name='مكتب الرئيس التنفيذي' then 'ceo'
      when position('مشاريع' in coalesce(o.legacy_department_name,''))>0 then 'bazai'
      when position('مالية' in coalesce(o.legacy_department_name,''))>0 then
        case when o.legacy_department_name='الإدارة المالية' then 'finance_manager' else 'haif' end
      else null
    end canonical_key,
    case
      when o.legacy_sn='377' then 'إدارة العلاقات العامة والإعلام'
      when o.last_route->>'stage'='recv' and o.last_route->>'party'='مكتب الرئيس التنفيذي' then 'مكتب الرئيس التنفيذي'
      when o.last_route->>'stage'='refer' and position('مشاريع' in coalesce(o.last_route->>'party',''))>0 then 'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية'
      when o.last_route->>'stage'='refer' and position('مالية' in coalesce(o.last_route->>'party',''))>0 then 'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية'
      when o.last_ref->>'type'='تحويل متابعة' then
        case
          when o.last_ref->>'deptName'='إدرة المشاريع' then 'إدارة المشاريع'
          when o.last_ref->>'deptName'='إدارة العلاقات العامة' then 'إدارة العلاقات العامة والإعلام'
          when o.last_ref->>'deptName'='إدارة تقنية المعلومات' then 'إدارة التقنية'
          when o.last_ref->>'deptName' in ('إدارة المشاريع','إدارة الأوقاف والاستثمار','الإدارة القانونية','إدارة الموارد البشرية','إدارة تنمية الموارد المالية','إدارة العلاقات العامة والإعلام','الإدارة المالية','إدارة التقنية') then o.last_ref->>'deptName'
          when position('مشاريع' in coalesce(o.last_ref->>'deptName',''))>0 or position('مشاريع' in coalesce(o.last_ref->>'orgName',''))>0 then 'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية'
          when position('مالية' in coalesce(o.last_ref->>'deptName',''))>0 or position('مالية' in coalesce(o.last_ref->>'orgName',''))>0 then 'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية'
          when o.last_ref->>'orgName'='المدير المالي' then 'الإدارة المالية'
          else null
        end
      when o.legacy_department_name='مكتب الرئيس التنفيذي' then 'مكتب الرئيس التنفيذي'
      when position('مشاريع' in coalesce(o.legacy_department_name,''))>0 then 'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية'
      when o.legacy_department_name='الإدارة المالية' then 'الإدارة المالية'
      when position('مالية' in coalesce(o.legacy_department_name,''))>0 then 'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية'
      else null
    end unit_name
  from open_legacy o
),
mapped as (
  select r.*,amu.preferred_login,amu.display_name,amu.role_code,ou.id unit_id
  from resolution r
  left join public.account_migration_users amu on amu.canonical_key=r.canonical_key
  left join public.organizational_units ou on ou.name=r.unit_name
)
update public.transactions t
set responsible_unit_id=m.unit_id,
    responsible_login_name=m.preferred_login,
    responsible_name=m.display_name,
    current_level=case
      when m.role_code in ('ceo','ceo_office_manager','ceo_secretary') then 'ceo'
      when m.role_code='assistant' then 'assistant'
      when m.role_code='manager' then 'manager'
      when m.role_code='employee' then 'employee'
      else t.current_level end,
    close_level=case
      when m.role_code in ('ceo','ceo_office_manager','ceo_secretary') then 'ceo'
      when m.role_code='assistant' then 'assistant'
      when m.role_code='manager' and m.canonical_key='finance_manager' then 'manager'
      when m.role_code in ('manager','employee') then 'assistant'
      else t.close_level end,
    workflow_started=(m.canonical_key is not null),
    migration_status=case when m.canonical_key is not null then 'ready' else 'needs_review' end,
    updated_at=now()
from mapped m
where t.id=m.id;

with ready as (
  select t.id,t.responsible_unit_id,t.responsible_login_name,t.responsible_name
  from public.transactions t
  where t.origin='legacy' and t.status='open'
    and t.migration_status='ready'
    and t.responsible_login_name is not null
),
ins as (
  insert into public.transaction_assignments(transaction_id,unit_id,assignment_type,directive,status,created_at)
  select r.id,r.responsible_unit_id,'responsible',null,'active',now()
  from ready r
  where not exists (
    select 1 from public.transaction_assignments a
    where a.transaction_id=r.id and a.status='active'
  )
  returning id,transaction_id
)
insert into public.transaction_assignment_targets(assignment_id,user_id,login_name,display_name,active,assigned_at)
select i.id,amu.migrated_user_id,r.responsible_login_name,r.responsible_name,true,now()
from ins i
join ready r on r.id=i.transaction_id
left join public.account_migration_users amu on amu.preferred_login=r.responsible_login_name
where not exists (
  select 1 from public.transaction_assignment_targets x where x.assignment_id=i.id
);
