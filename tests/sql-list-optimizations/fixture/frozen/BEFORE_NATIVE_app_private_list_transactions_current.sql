CREATE OR REPLACE FUNCTION app_private.list_transactions_current(p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_uid uuid; v_ctx jsonb; v_depts text[];
begin
  v_uid:=auth.uid();
  if not app_private.account_access_ready(v_uid) then raise exception 'account unavailable' using errcode='42501'; end if;
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  v_ctx:=public.user_context_internal(v_uid);
  if v_ctx is null or coalesce((v_ctx->>'active')::boolean,false) is not true
     or coalesce((v_ctx->>'must_change_password')::boolean,false) is true then
    raise exception 'account unavailable' using errcode='42501';
  end if;
  select coalesce(array_agg(value),'{}'::text[]) into v_depts
  from jsonb_array_elements_text(coalesce(v_ctx->'dept_names','[]'::jsonb));
  return public.list_transactions_internal(
    v_ctx->>'login_name',v_ctx->>'full_name',v_ctx->>'role',v_ctx->>'org_name',v_depts,
    p_tab,p_search,p_priority,p_status,p_department,p_employee,p_origin,p_late_only,
    p_date_from,p_date_to,p_page,p_page_size
  );
end $function$
