
insert into public.permissions(code,name_ar) values
('transactions.edit_subject','تعديل موضوع المعاملة'),
('transactions.change_responsible_unit','تغيير الإدارة المسؤولة')
on conflict(code) do update set name_ar=excluded.name_ar;

insert into public.role_permissions(role_code,permission_code) values
('ceo','transactions.edit_subject'),
('ceo','transactions.change_responsible_unit'),
('ceo_office_manager','transactions.edit_subject'),
('ceo_office_manager','transactions.change_responsible_unit'),
('ceo_secretary','transactions.edit_subject'),
('ceo_secretary','transactions.change_responsible_unit')
on conflict do nothing;
