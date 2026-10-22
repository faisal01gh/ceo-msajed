CREATE OR REPLACE FUNCTION public.list_my_transactions(p_tab text DEFAULT 'all'::text, p_search text DEFAULT ''::text, p_priority text DEFAULT ''::text, p_status text DEFAULT ''::text, p_department text DEFAULT ''::text, p_employee text DEFAULT ''::text, p_origin text DEFAULT ''::text, p_late_only boolean DEFAULT false, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select app_private.list_transactions_current(
   p_tab,p_search,p_priority,p_status,p_department,p_employee,p_origin,p_late_only,
   p_date_from,p_date_to,p_page,p_page_size
 );
$function$
