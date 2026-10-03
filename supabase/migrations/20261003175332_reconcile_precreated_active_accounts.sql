with map(canonical_key,email) as (values
 ('ceo','abdullatif@msajed.local'),
 ('faisal','faisal@msajed.local'),
 ('fahad_ceo','fahad@msajed.local'),
 ('haif','m-idari@msajed.local'),
 ('bazai','m-fanni@msajed.local'),
 ('rashid','legacy-fahad-alrashid@msajed.local'),
 ('zakri','legacy-faisal-alzakri@msajed.local'),
 ('ahmad','legacy-ahmad-alghamdi@msajed.local'),
 ('abdulrahman','legacy-abdulrahman-alkharashi@msajed.local'),
 ('omar_awqaf','legacy-omar-alhussain@msajed.local'),
 ('finance_manager','m-mali@msajed.local')
),
resolved as (
 select m.canonical_key,m.email,u.id user_id
 from map m join auth.users u on lower(u.email)=lower(m.email)
)
update public.account_migration_users a
set migrated_user_id=r.user_id,
    internal_email=r.email,
    must_change_password=true,
    migrated_at=coalesce(a.migrated_at,now())
from resolved r
where a.canonical_key=r.canonical_key;

update public.profiles p
set login_name=a.preferred_login,
    full_name=a.display_name,
    job_title=a.job_title,
    active=true,
    legacy_source='migrated_active_account',
    legacy_username=a.preferred_login,
    must_change_password=true,
    updated_at=now()
from public.account_migration_users a
where a.migrated_user_id=p.id;

delete from public.user_roles ur
using public.account_migration_users a
where a.migrated_user_id=ur.user_id;

insert into public.user_roles(user_id,role_code,is_primary)
select migrated_user_id,role_code,true
from public.account_migration_users
where migrated_user_id is not null
on conflict(user_id,role_code) do update set is_primary=true;
