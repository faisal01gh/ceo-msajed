
-- Official first-name English usernames for all operational staff.
-- Existing linked accounts retain the base first-name username where names repeat;
-- additional same-first-name accounts receive numeric suffixes.

update public.account_migration_users as a
set login_username=v.username
from (values
  ('ceo','abdullatif'),
  ('haif','haif'),
  ('bazai','abdullah'),
  ('faisal','faisal'),
  ('fahad_ceo','fahad'),
  ('staff_006','tareq'),
  ('staff_007','badr'),
  ('rashid','fahad1'),
  ('staff_009','hamzah'),
  ('staff_010','abdullah1'),
  ('staff_011','nayef'),
  ('staff_012','mishal'),
  ('ahmad','ahmad'),
  ('staff_014','abdullah2'),
  ('staff_015','alwaleed'),
  ('staff_016','nawaf'),
  ('zakri','faisal1'),
  ('majed_projects','majed'),
  ('staff_019','yousef'),
  ('staff_020','mohammed'),
  ('staff_021','abdulmohsen'),
  ('staff_022','rabie'),
  ('staff_023','khalid'),
  ('staff_024','abdulrahman1'),
  ('staff_025','saud'),
  ('staff_026','ibrahim'),
  ('staff_027','abdulaziz'),
  ('omar_awqaf','omar'),
  ('staff_029','yasser'),
  ('staff_030','saqr'),
  ('staff_031','ali'),
  ('staff_032','bayazid'),
  ('staff_033','barjas'),
  ('staff_034','faraj'),
  ('staff_035','tareq1'),
  ('abdulrahman','abdulrahman'),
  ('staff_037','abdulaziz1'),
  ('staff_038','wael'),
  ('staff_039','saud1'),
  ('staff_040','fahad2'),
  ('staff_041','abdullah3'),
  ('staff_042','abdulaziz2'),
  ('staff_043','ahmad1'),
  ('staff_044','mohammed1'),
  ('staff_045','othman'),
  ('staff_046','abdulrahman2'),
  ('staff_047','ahmad2'),
  ('staff_048','mohammed2'),
  ('staff_049','abdulaziz3'),
  ('staff_050','sulaiman'),
  ('staff_051','mohammed3'),
  ('staff_052','bakr'),
  ('staff_053','faisal2'),
  ('staff_054','ameen'),
  ('staff_055','fahad3'),
  ('staff_056','naji'),
  ('staff_057','ziad')
) as v(canonical_key,username)
where a.canonical_key=v.canonical_key
  and a.eligible;

-- Keep all English official aliases current.
insert into public.account_migration_aliases(alias,canonical_key,source,source_login,active)
select login_username,canonical_key,'new_system',login_username,true
from public.account_migration_users
where eligible
on conflict(alias) do update set
  canonical_key=excluded.canonical_key,
  source='new_system',
  source_login=excluded.source_login,
  active=true;

-- Arabic login is no longer accepted generally.
update public.account_migration_aliases
set active=false
where alias ~ '[ء-ي]';

-- Executive-level exceptions requested by Faisal: Arabic + English.
insert into public.account_migration_aliases(alias,canonical_key,source,source_login,active)
values
  ('عبداللطيف','ceo','new_system','abdullatif',true),
  ('فيصل','faisal','new_system','faisal',true),
  ('فهد','fahad_ceo','new_system','fahad',true),
  ('هايف','haif','new_system','haif',true),
  ('عبدالله','bazai','new_system','abdullah',true)
on conflict(alias) do update set
  canonical_key=excluded.canonical_key,
  source='new_system',
  source_login=excluded.source_login,
  active=true;
