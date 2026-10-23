-- Read-only operator inventory BEFORE approving deployment. No user IDs/emails or row content.
begin read only;
select version();
select count(*) as existing_auth_user_count from auth.users;
select n.nspname as schema_name, c.relname as object_name, c.relkind, c.relrowsecurity,
  pg_catalog.pg_get_userbyid(c.relowner) as owner
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where (n.nspname='public' and c.relname in ('profiles','study_sessions','shop_items','coin_transactions','user_inventory','room_placements'))
  or n.nspname='nookstep_private'
order by schema_name, object_name;
select trigger_name, event_manipulation, action_timing, action_statement
from information_schema.triggers where event_object_schema='auth' and event_object_table='users';
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies where schemaname in ('public','nookstep_private');
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants where table_schema='public'
  and table_name in ('profiles','study_sessions','shop_items','coin_transactions','user_inventory','room_placements')
order by table_name, grantee, privilege_type;
select n.nspname, p.proname, pg_catalog.pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proconfig, p.proacl
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='nookstep_private';
rollback;
