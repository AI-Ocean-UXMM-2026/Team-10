-- Read-only operator inventory. Run on the already-reviewed nookstep-dev target.
\set ON_ERROR_STOP on
begin read only;
select current_database() as database_name, current_setting('server_version') as postgres_version;
select column_name,data_type,is_nullable,column_default
 from information_schema.columns where table_schema='public' and table_name='shop_items'
 order by ordinal_position;
select c.relname,c.relrowsecurity,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as authenticated_direct_write
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('shop_items','profiles','user_inventory','room_placements','coin_transactions') order by c.relname;
select p.oid::regprocedure as operation,p.prosecdef as security_definer,p.prorettype::regtype as return_type
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('purchase_shop_item','get_my_room_layout','save_room_layout') order by p.oid::regprocedure::text;
select id,name,price_coins,surface_type,room_kind,asset_path,asset_variants,is_active,sort_order
 from public.shop_items where id in ('nook-chair-01','nook-desk-01','nook-lamp-01','nook-sofa-01','nook-books-01','nook-candle-01','nook-painting-01') order by sort_order,id;
-- Aggregate preservation baseline only; no identities, notes or credentials.
select (select count(*) from public.profiles) as profiles,
 (select count(*) from public.study_sessions) as sessions,
 (select count(*) from public.user_inventory) as owned_items,
 (select count(*) from public.room_placements) as placements,
 (select count(*) from public.coin_transactions) as ledger_entries,
 (select coalesce(sum(coins_balance),0) from public.profiles) as total_coins;
commit;
