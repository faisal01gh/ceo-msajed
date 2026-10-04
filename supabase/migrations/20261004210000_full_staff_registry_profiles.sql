
-- Full staff registry and self-profile foundation.
-- New system only: msajed-ceo-erp.

alter table public.profiles
  add column if not exists contact_email text;

alter table public.account_migration_aliases
  drop constraint if exists account_migration_aliases_source_check;
alter table public.account_migration_aliases
  add constraint account_migration_aliases_source_check
  check (source in ('ceo_users','portal_users','legacy_auth','new_system'));

insert into public.permissions(code,name_ar) values
('profiles.edit_email','تعديل البريد الإلكتروني في بياناتي'),
('profiles.admin_edit_name','تعديل اسم المستخدم'),
('profiles.admin_reset_password','تعيين كلمة مرور مؤقتة للمستخدم')
on conflict(code) do update set name_ar=excluded.name_ar;

insert into public.role_permissions(role_code,permission_code) values
('ceo_office_manager','profiles.admin_edit_name'),
('ceo_office_manager','profiles.admin_reset_password')
on conflict do nothing;

insert into public.account_migration_users
(canonical_key,preferred_login,display_name,role_code,job_title,org_name,dept_names,internal_email,eligible,must_change_password)
values
('ceo','abdullatif','عبداللطيف سليمان عبدالله السريع','ceo',null,'مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي']::text[],'abdullatif@msajed.local',true,true),
('haif','هايف','هايف نايف مطلق الدويش','assistant',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array[]::text[],'m-idari@msajed.local',true,true),
('bazai','محمد البازعي','عبدالله محمد عبدالله البازعي','assistant',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array[]::text[],'m-fanni@msajed.local',true,true),
('faisal','فيصل','فيصل بن محمد الغامدي','ceo_office_manager',null,'مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي']::text[],'faisal@msajed.local',true,true),
('fahad_ceo','فهد','فهد عمر أحمد بامقدم','ceo_secretary',null,'مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي']::text[],'fahad@msajed.local',true,true),
('staff_006','طارق الحمد','طارق سعود عبدالعزيز الحمد','employee',null,'مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي']::text[],'staff-006@msajed.local',true,true),
('staff_007','بدر آدم','بدر أحمد شعيب آدم','employee',null,'مكتب الرئيس التنفيذي',array['مكتب الرئيس التنفيذي']::text[],'staff-007@msajed.local',true,true),
('rashid','فهد الرشيد','فهد وليد الرشيد','assistant_secretary',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array[]::text[],'legacy-fahad-alrashid@msajed.local',true,true),
('staff_009','حمزة القرني','حمزة هاشم حمزة القرني','employee',null,'الإدارة المالية',array['الإدارة المالية']::text[],'staff-009@msajed.local',true,true),
('staff_010','عبدالله مصطفى','عبدالله أحمد عبداللطيف مصطفى','employee',null,'الإدارة المالية',array['الإدارة المالية']::text[],'staff-010@msajed.local',true,true),
('staff_011','نايف الحازمي','نايف سعد الحازمي','employee',null,'الإدارة المالية',array['الإدارة المالية']::text[],'staff-011@msajed.local',true,true),
('staff_012','مشعل البليهي','مشعل صالح البليهي','employee',null,'الإدارة المالية',array['الإدارة المالية']::text[],'staff-012@msajed.local',true,true),
('ahmad','أحمد','أحمد عبدالوهاب عبدالغني الغامدي','manager',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة تنمية الموارد المالية','إدارة العلاقات العامة والإعلام']::text[],'legacy-ahmad-alghamdi@msajed.local',true,true),
('staff_014','عبدالله الرميان','عبدالله سليمان صالح الرميان','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة تنمية الموارد المالية']::text[],'staff-014@msajed.local',true,true),
('staff_015','الوليد العتيبي','الوليد بدر العتيبي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة العلاقات العامة والإعلام']::text[],'staff-015@msajed.local',true,true),
('staff_016','نواف عبدالكريم','نواف احمد عبدالكريم','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة العلاقات العامة والإعلام']::text[],'staff-016@msajed.local',true,true),
('zakri','فيصل الزكري','فيصل فهد الزكري','assistant_secretary',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array[]::text[],'legacy-faisal-alzakri@msajed.local',true,true),
('majed_projects','ماجد الغامدي','ماجد علي الغامدي','manager',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'u-majed@msajed.local',true,true),
('staff_019','يوسف محمد','يوسف حماد حامد محمد','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-019@msajed.local',true,true),
('staff_020','محمد سليمان','محمد موسى عيسى سليمان','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-020@msajed.local',true,true),
('staff_021','عبدالمحسن أحمد','عبدالمحسن محمد محمد أحمد','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-021@msajed.local',true,true),
('staff_022','ربيعي محمد','ربيعي أحمد عبدالحميد محمد','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-022@msajed.local',true,true),
('staff_023','خالد الدسوقي','خالد إبراهيم الدسوقي','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-023@msajed.local',true,true),
('staff_024','عبدالرحمن الرويلي','عبدالرحمن حسن الرويلي','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-024@msajed.local',true,true),
('staff_025','سعود المجيرش','سعود علي سعود المجيرش','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-025@msajed.local',true,true),
('staff_026','إبراهيم آدم','إبراهيم أحمد شعيب آدم','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشاريع']::text[],'staff-026@msajed.local',true,true),
('staff_027','عبدالعزيز العتيبي','عبدالعزيز غازي العتيبي','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المشتريات']::text[],'staff-027@msajed.local',true,true),
('omar_awqaf','عمر الحسين','عمر عبدالعزيز الحسين','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الأوقاف والاستثمار']::text[],'legacy-omar-alhussain@msajed.local',true,true),
('staff_029','ياسر الغامدي','ياسر ناصر سالم الغامدي','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الخدمات']::text[],'staff-029@msajed.local',true,true),
('staff_030','صقر المطيري','صقر نهار عبيهيل المطيري','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الخدمات']::text[],'staff-030@msajed.local',true,true),
('staff_031','علي حامد','علي كاندر كون حامد','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الخدمات']::text[],'staff-031@msajed.local',true,true),
('staff_032','بايزيد حسن','بايزيد حسن','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة الخدمات']::text[],'staff-032@msajed.local',true,true),
('staff_033','برجس السبيعي','برجس ثلاب برجس السبيعي','manager',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المتابعة']::text[],'staff-033@msajed.local',true,true),
('staff_034','فرج القحطاني','فرج سعود ثفيل القحطاني','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المتابعة']::text[],'staff-034@msajed.local',true,true),
('staff_035','طارق الكثيري','طارق عبدالعزيز سالم الكثيري','employee',null,'مساعد الرئيس التنفيذي للمشاريع والشؤون الفنية',array['إدارة المتابعة']::text[],'staff-035@msajed.local',true,true),
('abdulrahman','عبدالرحمن','عبدالرحمن صالح عمر الخراشي','manager',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الموارد البشرية','الإدارة القانونية']::text[],'legacy-abdulrahman-alkharashi@msajed.local',true,true),
('staff_037','عبدالعزيز العويس','عبدالعزيز سعود العويس','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الموارد البشرية','الإدارة القانونية']::text[],'staff-037@msajed.local',true,true),
('staff_038','وائل الصلاحي','وائل جمال الصلاحي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الموارد البشرية']::text[],'staff-038@msajed.local',true,true),
('staff_039','سعود المذنبي','سعود علي المذنبي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الموارد البشرية']::text[],'staff-039@msajed.local',true,true),
('staff_040','فهد العليان','فهد عبدالعزيز ناصر العليان','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الاتصالات الإدارية','إدارة التطوع']::text[],'staff-040@msajed.local',true,true),
('staff_041','عبدالله العنزي','عبدالله سعود جريبيع العنزي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة الحوكمة','إدارة الاستراتيجية']::text[],'staff-041@msajed.local',true,true),
('staff_042','عبدالعزيز البيشي','عبدالعزيز علي البيشي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['إدارة التقنية']::text[],'staff-042@msajed.local',true,true),
('staff_043','أحمد الشمري','أحمد معزي الشمري','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['حائل']::text[],'staff-043@msajed.local',true,true),
('staff_044','محمد حكمي','محمد بن إبراهيم حكمي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['جازان']::text[],'staff-044@msajed.local',true,true),
('staff_045','عثمان مقري','عثمان أحمد سلمان مقري','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['جازان']::text[],'staff-045@msajed.local',true,true),
('staff_046','عبدالرحمن القرني','عبدالرحمن بن عبدالله القرني','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['المدينة المنورة']::text[],'staff-046@msajed.local',true,true),
('staff_047','أحمد العمودي','أحمد محمد العمودي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['مكة المكرمة']::text[],'staff-047@msajed.local',true,true),
('staff_048','محمد حسين','محمد كمال حسين','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['مكة المكرمة']::text[],'staff-048@msajed.local',true,true),
('staff_049','عبدالعزيز محمد','عبدالعزيز عبدالرحمن محمد','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['مكة المكرمة']::text[],'staff-049@msajed.local',true,true),
('staff_050','سليمان الدبيخي','سليمان محمد الدبيخي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['القصيم']::text[],'staff-050@msajed.local',true,true),
('staff_051','محمد الخليفي','محمد علي الخليفي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['الرياض']::text[],'staff-051@msajed.local',true,true),
('staff_052','بكر الدوسري','بكر عسل بكر الدوسري','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['الرياض']::text[],'staff-052@msajed.local',true,true),
('staff_053','فيصل الحادي','فيصل علي صالح الحادي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['الأحساء']::text[],'staff-053@msajed.local',true,true),
('staff_054','أمين الغامدي','أمين أحمد علي الغامدي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['الدمام']::text[],'staff-054@msajed.local',true,true),
('staff_055','فهد سبحي','فهد محمد علي سبحي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['الطائف']::text[],'staff-055@msajed.local',true,true),
('staff_056','ناجي أبودريهم','ناجي زارع حمزة أبودريهم','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['تبوك']::text[],'staff-056@msajed.local',true,true),
('staff_057','زياد البلوي','زياد عطا الله رغيان البلوي','employee',null,'مساعد الرئيس التنفيذي للشؤون الإدارية والمالية',array['تبوك']::text[],'staff-057@msajed.local',true,true)
on conflict(canonical_key) do update set
  preferred_login=excluded.preferred_login,
  display_name=excluded.display_name,
  role_code=excluded.role_code,
  job_title=null,
  org_name=excluded.org_name,
  dept_names=excluded.dept_names,
  internal_email=excluded.internal_email,
  eligible=true,
  must_change_password=true;

insert into public.account_migration_aliases(alias,canonical_key,source,source_login,active)
values
('abdullatif','ceo','new_system','abdullatif',true),
('عبداللطيف سليمان عبدالله السريع','ceo','new_system','abdullatif',true),
('هايف','haif','new_system','هايف',true),
('هايف نايف مطلق الدويش','haif','new_system','هايف',true),
('محمد البازعي','bazai','new_system','محمد البازعي',true),
('عبدالله محمد عبدالله البازعي','bazai','new_system','محمد البازعي',true),
('فيصل','faisal','new_system','فيصل',true),
('فيصل بن محمد الغامدي','faisal','new_system','فيصل',true),
('فهد','fahad_ceo','new_system','فهد',true),
('فهد عمر أحمد بامقدم','fahad_ceo','new_system','فهد',true),
('طارق الحمد','staff_006','new_system','طارق الحمد',true),
('طارق سعود عبدالعزيز الحمد','staff_006','new_system','طارق الحمد',true),
('بدر آدم','staff_007','new_system','بدر آدم',true),
('بدر أحمد شعيب آدم','staff_007','new_system','بدر آدم',true),
('فهد الرشيد','rashid','new_system','فهد الرشيد',true),
('فهد وليد الرشيد','rashid','new_system','فهد الرشيد',true),
('حمزة القرني','staff_009','new_system','حمزة القرني',true),
('حمزة هاشم حمزة القرني','staff_009','new_system','حمزة القرني',true),
('عبدالله مصطفى','staff_010','new_system','عبدالله مصطفى',true),
('عبدالله أحمد عبداللطيف مصطفى','staff_010','new_system','عبدالله مصطفى',true),
('نايف الحازمي','staff_011','new_system','نايف الحازمي',true),
('نايف سعد الحازمي','staff_011','new_system','نايف الحازمي',true),
('مشعل البليهي','staff_012','new_system','مشعل البليهي',true),
('مشعل صالح البليهي','staff_012','new_system','مشعل البليهي',true),
('أحمد','ahmad','new_system','أحمد',true),
('أحمد عبدالوهاب عبدالغني الغامدي','ahmad','new_system','أحمد',true),
('عبدالله الرميان','staff_014','new_system','عبدالله الرميان',true),
('عبدالله سليمان صالح الرميان','staff_014','new_system','عبدالله الرميان',true),
('الوليد العتيبي','staff_015','new_system','الوليد العتيبي',true),
('الوليد بدر العتيبي','staff_015','new_system','الوليد العتيبي',true),
('نواف عبدالكريم','staff_016','new_system','نواف عبدالكريم',true),
('نواف احمد عبدالكريم','staff_016','new_system','نواف عبدالكريم',true),
('فيصل الزكري','zakri','new_system','فيصل الزكري',true),
('فيصل فهد الزكري','zakri','new_system','فيصل الزكري',true),
('ماجد الغامدي','majed_projects','new_system','ماجد الغامدي',true),
('ماجد علي الغامدي','majed_projects','new_system','ماجد الغامدي',true),
('يوسف محمد','staff_019','new_system','يوسف محمد',true),
('يوسف حماد حامد محمد','staff_019','new_system','يوسف محمد',true),
('محمد سليمان','staff_020','new_system','محمد سليمان',true),
('محمد موسى عيسى سليمان','staff_020','new_system','محمد سليمان',true),
('عبدالمحسن أحمد','staff_021','new_system','عبدالمحسن أحمد',true),
('عبدالمحسن محمد محمد أحمد','staff_021','new_system','عبدالمحسن أحمد',true),
('ربيعي محمد','staff_022','new_system','ربيعي محمد',true),
('ربيعي أحمد عبدالحميد محمد','staff_022','new_system','ربيعي محمد',true),
('خالد الدسوقي','staff_023','new_system','خالد الدسوقي',true),
('خالد إبراهيم الدسوقي','staff_023','new_system','خالد الدسوقي',true),
('عبدالرحمن الرويلي','staff_024','new_system','عبدالرحمن الرويلي',true),
('عبدالرحمن حسن الرويلي','staff_024','new_system','عبدالرحمن الرويلي',true),
('سعود المجيرش','staff_025','new_system','سعود المجيرش',true),
('سعود علي سعود المجيرش','staff_025','new_system','سعود المجيرش',true),
('إبراهيم آدم','staff_026','new_system','إبراهيم آدم',true),
('إبراهيم أحمد شعيب آدم','staff_026','new_system','إبراهيم آدم',true),
('عبدالعزيز العتيبي','staff_027','new_system','عبدالعزيز العتيبي',true),
('عبدالعزيز غازي العتيبي','staff_027','new_system','عبدالعزيز العتيبي',true),
('عمر الحسين','omar_awqaf','new_system','عمر الحسين',true),
('عمر عبدالعزيز الحسين','omar_awqaf','new_system','عمر الحسين',true),
('ياسر الغامدي','staff_029','new_system','ياسر الغامدي',true),
('ياسر ناصر سالم الغامدي','staff_029','new_system','ياسر الغامدي',true),
('صقر المطيري','staff_030','new_system','صقر المطيري',true),
('صقر نهار عبيهيل المطيري','staff_030','new_system','صقر المطيري',true),
('علي حامد','staff_031','new_system','علي حامد',true),
('علي كاندر كون حامد','staff_031','new_system','علي حامد',true),
('بايزيد حسن','staff_032','new_system','بايزيد حسن',true),
('برجس السبيعي','staff_033','new_system','برجس السبيعي',true),
('برجس ثلاب برجس السبيعي','staff_033','new_system','برجس السبيعي',true),
('فرج القحطاني','staff_034','new_system','فرج القحطاني',true),
('فرج سعود ثفيل القحطاني','staff_034','new_system','فرج القحطاني',true),
('طارق الكثيري','staff_035','new_system','طارق الكثيري',true),
('طارق عبدالعزيز سالم الكثيري','staff_035','new_system','طارق الكثيري',true),
('عبدالرحمن','abdulrahman','new_system','عبدالرحمن',true),
('عبدالرحمن صالح عمر الخراشي','abdulrahman','new_system','عبدالرحمن',true),
('عبدالعزيز العويس','staff_037','new_system','عبدالعزيز العويس',true),
('عبدالعزيز سعود العويس','staff_037','new_system','عبدالعزيز العويس',true),
('وائل الصلاحي','staff_038','new_system','وائل الصلاحي',true),
('وائل جمال الصلاحي','staff_038','new_system','وائل الصلاحي',true),
('سعود المذنبي','staff_039','new_system','سعود المذنبي',true),
('سعود علي المذنبي','staff_039','new_system','سعود المذنبي',true),
('فهد العليان','staff_040','new_system','فهد العليان',true),
('فهد عبدالعزيز ناصر العليان','staff_040','new_system','فهد العليان',true),
('عبدالله العنزي','staff_041','new_system','عبدالله العنزي',true),
('عبدالله سعود جريبيع العنزي','staff_041','new_system','عبدالله العنزي',true),
('عبدالعزيز البيشي','staff_042','new_system','عبدالعزيز البيشي',true),
('عبدالعزيز علي البيشي','staff_042','new_system','عبدالعزيز البيشي',true),
('أحمد الشمري','staff_043','new_system','أحمد الشمري',true),
('أحمد معزي الشمري','staff_043','new_system','أحمد الشمري',true),
('محمد حكمي','staff_044','new_system','محمد حكمي',true),
('محمد بن إبراهيم حكمي','staff_044','new_system','محمد حكمي',true),
('عثمان مقري','staff_045','new_system','عثمان مقري',true),
('عثمان أحمد سلمان مقري','staff_045','new_system','عثمان مقري',true),
('عبدالرحمن القرني','staff_046','new_system','عبدالرحمن القرني',true),
('عبدالرحمن بن عبدالله القرني','staff_046','new_system','عبدالرحمن القرني',true),
('أحمد العمودي','staff_047','new_system','أحمد العمودي',true),
('أحمد محمد العمودي','staff_047','new_system','أحمد العمودي',true),
('محمد حسين','staff_048','new_system','محمد حسين',true),
('محمد كمال حسين','staff_048','new_system','محمد حسين',true),
('عبدالعزيز محمد','staff_049','new_system','عبدالعزيز محمد',true),
('عبدالعزيز عبدالرحمن محمد','staff_049','new_system','عبدالعزيز محمد',true),
('سليمان الدبيخي','staff_050','new_system','سليمان الدبيخي',true),
('سليمان محمد الدبيخي','staff_050','new_system','سليمان الدبيخي',true),
('محمد الخليفي','staff_051','new_system','محمد الخليفي',true),
('محمد علي الخليفي','staff_051','new_system','محمد الخليفي',true),
('بكر الدوسري','staff_052','new_system','بكر الدوسري',true),
('بكر عسل بكر الدوسري','staff_052','new_system','بكر الدوسري',true),
('فيصل الحادي','staff_053','new_system','فيصل الحادي',true),
('فيصل علي صالح الحادي','staff_053','new_system','فيصل الحادي',true),
('أمين الغامدي','staff_054','new_system','أمين الغامدي',true),
('أمين أحمد علي الغامدي','staff_054','new_system','أمين الغامدي',true),
('فهد سبحي','staff_055','new_system','فهد سبحي',true),
('فهد محمد علي سبحي','staff_055','new_system','فهد سبحي',true),
('ناجي أبودريهم','staff_056','new_system','ناجي أبودريهم',true),
('ناجي زارع حمزة أبودريهم','staff_056','new_system','ناجي أبودريهم',true),
('زياد البلوي','staff_057','new_system','زياد البلوي',true),
('زياد عطا الله رغيان البلوي','staff_057','new_system','زياد البلوي',true)
on conflict(alias) do nothing;

-- The old placeholder was a job title, not a named person in staff-original.json.
update public.account_migration_users
set eligible=false
where canonical_key='finance_manager';

update public.profiles p
set active=false,updated_at=now()
from public.account_migration_users a
where a.canonical_key='finance_manager'
  and a.migrated_user_id=p.id;

-- Synchronize linked real staff users.
update public.profiles p
set full_name=a.display_name,
    login_name=a.preferred_login,
    job_title=null,
    active=true,
    must_change_password=true,
    updated_at=now()
from public.account_migration_users a
where a.eligible
  and a.migrated_user_id=p.id;

delete from public.user_roles ur
using public.account_migration_users a
where a.eligible and a.migrated_user_id=ur.user_id;

insert into public.user_roles(user_id,role_code,is_primary)
select migrated_user_id,role_code,true
from public.account_migration_users
where eligible and migrated_user_id is not null
on conflict(user_id,role_code) do update set is_primary=true;

delete from public.user_memberships um
using public.account_migration_users a
where a.eligible and a.migrated_user_id=um.user_id;

-- Executive office.
insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
select a.migrated_user_id,ou.id,'office',true,true
from public.account_migration_users a
join public.organizational_units ou
  on ou.name='مكتب الرئيس التنفيذي' and ou.parent_id is null and ou.active
where a.eligible and a.migrated_user_id is not null
  and a.role_code in ('ceo','ceo_office_manager','ceo_secretary');

-- Assistants.
insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
select a.migrated_user_id,ou.id,'assistant',true,true
from public.account_migration_users a
join public.organizational_units ou
  on ou.name=a.org_name and ou.parent_id is null and ou.active
where a.eligible and a.migrated_user_id is not null
  and a.role_code='assistant';

-- Assistant secretaries/office staff.
insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
select a.migrated_user_id,ou.id,'office',true,true
from public.account_migration_users a
join public.organizational_units ou
  on ou.name=a.org_name and ou.parent_id is null and ou.active
where a.eligible and a.migrated_user_id is not null
  and a.role_code='assistant_secretary';

-- Managers and employees, including branch cities and independent finance.
insert into public.user_memberships(user_id,unit_id,membership_role,is_primary,active)
select a.migrated_user_id,ou.id,
       case when a.role_code='manager' then 'manager' else 'member' end,
       d.ord=1,
       true
from public.account_migration_users a
cross join lateral unnest(a.dept_names) with ordinality as d(name,ord)
join public.organizational_units ou on ou.name=d.name and ou.active
where a.eligible and a.migrated_user_id is not null
  and a.role_code in ('manager','employee');

-- Force one policy refresh on every real linked account, including Faisal and Fahad Al-Rashid.
update public.account_migration_users
set must_change_password=true,
    password_changed_at=null
where eligible;

update public.profiles p
set must_change_password=true,updated_at=now()
from public.account_migration_users a
where a.eligible and a.migrated_user_id=p.id;

create or replace function app_private.permissions_admin_snapshot(
  p_actor uuid,p_section text default 'transactions'
)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_prefix text; v_result jsonb;
begin
  if p_actor is null or not app_private.can_manage_permissions(p_actor) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if p_section not in ('transactions','profiles') then
    raise exception 'unsupported permission section';
  end if;
  v_prefix:=p_section||'.';

  with permission_rows as (
    select p.code,p.name_ar,true editable
    from public.permissions p
    where p.code like v_prefix||'%'
  ),
  accounts as (
    select amu.canonical_key,amu.preferred_login,amu.display_name,amu.role_code,
           r.name_ar role_name,amu.migrated_user_id user_id
    from public.account_migration_users amu
    left join public.roles r on r.code=amu.role_code
    where amu.eligible
  ),
  user_matrix as (
    select a.*,pr.code permission_code,pr.name_ar permission_name,pr.editable,
      case
        when a.user_id is not null then exists(
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role_code=ur.role_code
          where ur.user_id=a.user_id and rp.permission_code=pr.code
        )
        else exists(
          select 1 from public.role_permissions rp
          where rp.role_code=a.role_code and rp.permission_code=pr.code
        )
      end base_enabled,
      coalesce(
        case when a.user_id is null then null else (
          select up.effect from public.user_permissions up
          where up.user_id=a.user_id and up.permission_code=pr.code limit 1
        ) end,
        (
          select apo.effect from public.account_permission_overrides apo
          where apo.canonical_key=a.canonical_key and apo.permission_code=pr.code limit 1
        )
      ) override_effect
    from accounts a cross join permission_rows pr
  ),
  users_json as (
    select canonical_key,preferred_login,display_name,role_code,role_name,user_id,
      jsonb_agg(jsonb_build_object(
        'code',permission_code,'name_ar',permission_name,'editable',editable,
        'base_enabled',base_enabled,'override_effect',override_effect,
        'effective_enabled',case when override_effect='allow' then true
                                 when override_effect='deny' then false
                                 else base_enabled end
      ) order by permission_name) permissions
    from user_matrix
    group by canonical_key,preferred_login,display_name,role_code,role_name,user_id
  )
  select jsonb_build_object(
    'ok',true,'section',p_section,
    'tabs',jsonb_build_array(
      jsonb_build_object('code','transactions','name_ar','المعاملات'),
      jsonb_build_object('code','profiles','name_ar','بياناتي')
    ),
    'permissions',coalesce((select jsonb_agg(jsonb_build_object(
      'code',code,'name_ar',name_ar,'editable',editable) order by name_ar)
      from permission_rows),'[]'::jsonb),
    'users',coalesce((select jsonb_agg(jsonb_build_object(
      'canonical_key',canonical_key,'login_name',preferred_login,'display_name',display_name,
      'role_code',role_code,'role_name',role_name,'user_id',user_id,'permissions',permissions
    ) order by display_name) from users_json),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function app_private.my_profile_current()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid; v_result jsonb;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select jsonb_build_object(
    'ok',true,
    'user_id',p.id,
    'name',p.full_name,
    'email',p.contact_email,
    'can_edit_email',app_private.has_permission(p.id,'profiles.edit_email'),
    'must_change_password',p.must_change_password
  )
  into v_result
  from public.profiles p
  where p.id=v_uid and p.active;
  if v_result is null then raise exception 'profile unavailable' using errcode='42501'; end if;
  return v_result;
end;
$$;

create or replace function app_private.my_profile_set_email_current(p_email text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid; v_email text;
begin
  v_uid:=auth.uid();
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not app_private.has_permission(v_uid,'profiles.edit_email') then
    raise exception 'forbidden' using errcode='42501';
  end if;
  v_email:=nullif(trim(coalesce(p_email,'')),'');
  if v_email is not null and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'invalid email';
  end if;
  update public.profiles set contact_email=v_email,updated_at=now() where id=v_uid and active;
  return jsonb_build_object('ok',true,'email',v_email);
end;
$$;

create or replace function public.my_profile()
returns jsonb language sql stable security invoker set search_path=''
as $$ select app_private.my_profile_current(); $$;

create or replace function public.my_profile_set_email(p_email text)
returns jsonb language sql security invoker set search_path=''
as $$ select app_private.my_profile_set_email_current(p_email); $$;

revoke all on function app_private.my_profile_current() from public,anon;
revoke all on function app_private.my_profile_set_email_current(text) from public,anon;
grant execute on function app_private.my_profile_current() to authenticated;
grant execute on function app_private.my_profile_set_email_current(text) to authenticated;

revoke all on function public.my_profile() from public,anon;
revoke all on function public.my_profile_set_email(text) from public,anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.my_profile_set_email(text) to authenticated;
