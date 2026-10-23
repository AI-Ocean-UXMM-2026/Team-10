-- Task 08A: additive multi-surface contract. No catalog or account mutations.
-- Rollback: disable expanded writes; retain readers/constraints for saved placements.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.shop_items, public.room_placements in share row exclusive mode;
-- Legacy surface_type remains the catalog's default; identities/prices are untouched.
alter table public.shop_items drop constraint shop_items_room_kind;
alter table public.shop_items add constraint shop_items_room_kind check (
 (surface_type='floor' and room_kind in ('bed','chair','desk','sofa','lamp','aquarium','television','bookcase','green-drawers','sage-armchair','white-bedside','wooden_table','books','candle','laptop','coffeecups','teddy-cream')) or
 (surface_type='tabletop' and room_kind in ('books','candle','laptop','coffeecups','teddy-cream','aquarium','lamp','television')) or
 (surface_type='wall' and room_kind in ('painting','window','clock-charcoal','large-green-landscape')));
alter table public.shop_items add constraint shop_items_identity_kind unique(id,room_kind);
create table public.shop_item_surfaces (
 item_id text not null,
 surface_type text not null check(surface_type in ('floor','tabletop','wall')),
 room_kind text not null,
 primary key(item_id,surface_type,room_kind),
 foreign key(item_id,room_kind) references public.shop_items(id,room_kind) on delete cascade
);
alter table public.shop_item_surfaces enable row level security;
revoke all on public.shop_item_surfaces from public,anon,authenticated,service_role;
grant select on public.shop_item_surfaces to authenticated;
create policy permitted_surfaces_read on public.shop_item_surfaces for select to authenticated using(true);

create function nookstep_private.catalog_surfaces() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into public.shop_item_surfaces(item_id,surface_type,room_kind)
 select new.id, s, new.room_kind from unnest(case
  when new.room_kind in ('books','candle','laptop','coffeecups','teddy-cream','aquarium','lamp','television') then array['floor','tabletop']
  when new.room_kind in ('painting','window','clock-charcoal','large-green-landscape') then array['wall'] else array['floor'] end) s
 on conflict do nothing;
 return new;
end $$;
revoke all on function nookstep_private.catalog_surfaces() from public,anon,authenticated,service_role;
create trigger catalog_permitted_surfaces after insert or update of room_kind,surface_type on public.shop_items
 for each row execute function nookstep_private.catalog_surfaces();
-- Bootstrap metadata for existing catalog rows without updating a catalog row.
insert into public.shop_item_surfaces(item_id,surface_type,room_kind)
 select c.id,s,c.room_kind from public.shop_items c cross join lateral unnest(case
 when c.room_kind in ('books','candle','laptop','coffeecups','teddy-cream','aquarium','lamp','television') then array['floor','tabletop']
 when c.room_kind in ('painting','window','clock-charcoal','large-green-landscape') then array['wall'] else array['floor'] end) s;
alter table public.room_placements drop constraint room_placements_catalog_shape;
alter table public.room_placements add constraint room_placements_catalog_shape
 foreign key(item_id,surface_type,room_kind) references public.shop_item_surfaces(item_id,surface_type,room_kind);
alter table public.room_placements drop constraint room_placements_parent_desk;
-- Keep obsolete generated parent_* columns for old read-contract compatibility;
-- they no longer authorize a parent. Same-user placed-parent FK remains active.

create function nookstep_private.tabletop_pair(child text,parent text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(parent in ('desk','wooden_table','white-bedside')
 and child in ('books','candle','laptop','coffeecups','teddy-cream','aquarium','lamp','television') and (child<>'television' or parent='wooden_table'),false);
$$;
revoke all on function nookstep_private.tabletop_pair(text,text) from public,anon,authenticated,service_role;
create function nookstep_private.check_tabletop_parent() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 -- Evaluate the FINAL replacement at deferred-trigger time, not a deleted draft.
 if exists(select 1 from public.room_placements child left join public.room_placements parent
   on parent.user_id=child.user_id and parent.item_id=child.parent_item_id
   where child.user_id=new.user_id and (child.item_id=new.item_id or child.parent_item_id=new.item_id) and child.surface_type='tabletop'
   and (parent.item_id is null or parent.surface_type<>'floor'
      or not nookstep_private.tabletop_pair(child.room_kind,parent.room_kind))) then
  raise exception using errcode='23514',message='unsupported_tabletop_parent';
 end if;
 return null;
end $$;
revoke all on function nookstep_private.check_tabletop_parent() from public,anon,authenticated,service_role;
create constraint trigger room_tabletop_parent after insert or update on public.room_placements
 deferrable initially deferred for each row execute function nookstep_private.check_tabletop_parent();

create or replace function nookstep_private.valid_placement(
  surface text, data jsonb, item text, parent text
) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  coordinate text;
  offset_data jsonb;
begin
  if (pg_catalog.jsonb_typeof(data) = 'object'
      and data -> 'version' = '2'::jsonb
      and pg_catalog.jsonb_typeof(data -> 'id') = 'string'
      and data ->> 'id' = item
      and pg_catalog.jsonb_typeof(data -> 'kind') = 'string'
      and pg_catalog.octet_length(data::text) <= 16384) is not true then
    return false;
  end if;

  if surface = 'floor' then
    if parent is not null then return false; end if;
    foreach coordinate in array array['x', 'y'] loop
      if pg_catalog.jsonb_typeof(data -> coordinate) is distinct from 'number' then return false; end if;
      if (data ->> coordinate)::numeric not between -8 and 16
         or pg_catalog.mod((data ->> coordinate)::numeric * 4, 1) <> 0 then return false; end if;
    end loop;
    if (pg_catalog.jsonb_typeof(data -> 'facing') = 'string'
        and data ->> 'facing' in ('frontLeft', 'frontRight', 'backLeft', 'backRight')) is not true then return false; end if;
    offset_data := data -> 'groundOffset';
    if pg_catalog.jsonb_typeof(offset_data) is distinct from 'object' then return false; end if;
    foreach coordinate in array array['x', 'y'] loop
      if pg_catalog.jsonb_typeof(offset_data -> coordinate) is distinct from 'number' then return false; end if;
      if (offset_data ->> coordinate)::numeric <= 0 or (offset_data ->> coordinate)::numeric > 8 then return false; end if;
    end loop;
    return true;
  elsif surface = 'tabletop' then
    if (parent is not null and parent <> item
        and pg_catalog.jsonb_typeof(data -> 'parentId') = 'string' and data ->> 'parentId' = parent
        and pg_catalog.jsonb_typeof(data -> 'surfaceId') = 'string' and data ->> 'surfaceId' = 'desktop') is not true then return false; end if;
    foreach coordinate in array array['u', 'v', 'turn'] loop
      if pg_catalog.jsonb_typeof(data -> coordinate) is distinct from 'number' then return false; end if;
    end loop;
    return (data ->> 'u')::numeric between -2 and 4
      and (data ->> 'v')::numeric between -1 and 2
      and (data ->> 'turn')::numeric in (0, 1, 2, 3)
      and (data ->> 'kind' in ('laptop','teddy-cream','aquarium','lamp','television') or (data ->> 'turn')::numeric = 0);
  elsif surface = 'wall' then
    if parent is not null or (pg_catalog.jsonb_typeof(data -> 'wall') = 'string'
        and data ->> 'wall' in ('left', 'right')) is not true then return false; end if;
    foreach coordinate in array array['u', 'v'] loop
      if pg_catalog.jsonb_typeof(data -> coordinate) is distinct from 'number' then return false; end if;
    end loop;
    return (data ->> 'u')::numeric between -8 and 16
      and (data ->> 'v')::numeric between -11.25 and 22.5;
  end if;
  return false;
end;
$$;
create or replace function nookstep_private.valid_room_entity(surface text, entity jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare allowed_keys text[]; key_name text; offset_x numeric; offset_y numeric; width_value numeric; depth_value numeric;
begin
  if pg_catalog.jsonb_typeof(entity) is distinct from 'object' then return false; end if;
  if not nookstep_private.valid_placement(surface,entity || '{"version":2}'::jsonb,entity->>'id',entity->>'parentId') then return false; end if;
  if surface='floor' then
    allowed_keys := array['id','kind','x','y','facing','groundOffset'];
    if exists(select 1 from pg_catalog.jsonb_object_keys(entity->'groundOffset') k where k not in ('x','y')) then return false; end if;
    case entity->>'kind'
      when 'bed' then width_value:=2; depth_value:=3;
      when 'chair' then width_value:=1; depth_value:=1;
      when 'desk' then width_value:=2; depth_value:=1;
      when 'sofa' then width_value:=2; depth_value:=1;
      when 'lamp' then width_value:=1; depth_value:=1;
      when 'aquarium' then width_value:=2; depth_value:=1;
      when 'television' then width_value:=2; depth_value:=1;
      when 'bookcase' then width_value:=1; depth_value:=1;
      when 'green-drawers' then width_value:=1; depth_value:=1;
      when 'sage-armchair' then width_value:=1; depth_value:=1;
      when 'white-bedside' then width_value:=1; depth_value:=1;
      when 'wooden_table' then width_value:=2; depth_value:=1;
      when 'books' then width_value:=0.5; depth_value:=0.5;
      when 'candle' then width_value:=0.25; depth_value:=0.25;
      when 'laptop' then width_value:=1; depth_value:=0.75;
      when 'coffeecups' then width_value:=0.25; depth_value:=0.25;
      when 'teddy-cream' then width_value:=0.5; depth_value:=0.5;
      else return false;
    end case;
    offset_x := (entity->'groundOffset'->>'x')::numeric; offset_y := (entity->'groundOffset'->>'y')::numeric;
    if not ((offset_x=width_value and offset_y=depth_value) or (offset_x=depth_value and offset_y=width_value)) then return false; end if;
  elsif surface='tabletop' then allowed_keys:=array['id','kind','parentId','surfaceId','u','v','turn'];
  elsif surface='wall' then allowed_keys:=array['id','kind','wall','u','v'];
  else return false; end if;
  for key_name in select pg_catalog.jsonb_object_keys(entity) loop
    if not key_name=any(allowed_keys) then return false; end if;
  end loop;
  return true;
end;
$$;
-- Older clients cannot normalize floor books/new kinds or transferred identities.
-- Keep their RPC, but fail closed before an old reader can omit newer placements.
create function nookstep_private.legacy_room(doc jsonb) returns boolean
language sql immutable set search_path='' as $$ select
 not exists(select 1 from jsonb_array_elements(doc->'items') e where e->>'kind' not in ('bed','chair','desk','sofa','lamp','aquarium','television'))
 and not exists(select 1 from jsonb_array_elements(doc->'decorations') e where e->>'kind' not in ('books','candle','coffeecups','laptop')
  or not exists(select 1 from jsonb_array_elements(doc->'items') p where p->>'id'=e->>'parentId' and p->>'kind'='desk'))
 and not exists(select 1 from jsonb_array_elements(coalesce(doc->'wallDecorations','[]'::jsonb)) e where e->>'kind' not in ('painting','window'));
$$;
revoke all on function nookstep_private.legacy_room(jsonb) from public,anon,authenticated,service_role;
create or replace function public.save_room_layout(p_layout jsonb, p_expected_room_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := nookstep_private.lock_actor(); revision_value bigint; current_layout jsonb; proposed_layout jsonb;
  rows_value jsonb := '[]'::jsonb; entity jsonb; surface text; item_id_value text; parent_value text;
  seen_ids text[] := array[]::text[]; at_time timestamptz;
begin
  if p_expected_room_revision is null or p_expected_room_revision<0 then
    raise exception using errcode='22023',message='expected_room_revision_required';
  end if;
  select p.room_revision into revision_value from public.profiles p where p.id=actor;
  current_layout := nookstep_private.room_document(nookstep_private.room_rows(actor));
  if p_expected_room_revision<>revision_value then
    return pg_catalog.jsonb_build_object('ok',false,'code','layout_conflict','room_revision',revision_value,'layout',current_layout);
  end if;
  if (pg_catalog.jsonb_typeof(p_layout)='object' and p_layout->'version'='2'::jsonb
      and pg_catalog.jsonb_typeof(p_layout->'items')='array'
      and pg_catalog.jsonb_typeof(p_layout->'decorations')='array'
      and (not p_layout ? 'wallDecorations' or pg_catalog.jsonb_typeof(p_layout->'wallDecorations')='array')
      and pg_catalog.octet_length(p_layout::text)<=262144) is not true then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_layout) k where k not in ('version','items','decorations','wallDecorations')) then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  for surface,entity in
    select 'floor', value from pg_catalog.jsonb_array_elements(p_layout->'items')
    union all select 'tabletop',value from pg_catalog.jsonb_array_elements(p_layout->'decorations')
    union all select 'wall',value from pg_catalog.jsonb_array_elements(coalesce(p_layout->'wallDecorations','[]'::jsonb))
  loop
    if not nookstep_private.valid_room_entity(surface,entity) then raise exception using errcode='22023',message='invalid_layout'; end if;
    item_id_value:=entity->>'id'; parent_value:=entity->>'parentId';
    if item_id_value=any(seen_ids) or cardinality(seen_ids)>=256 then raise exception using errcode='22023',message='invalid_layout'; end if;
    seen_ids:=pg_catalog.array_append(seen_ids,item_id_value);
    rows_value:=rows_value || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'item_id',item_id_value,'surface_type',surface,'parent_item_id',parent_value,'placement_data',entity || '{"version":2}'::jsonb));
  end loop;
  -- Hold catalog metadata stable against concurrent administrative changes.
  perform 1 from public.shop_items c where c.id=any(seen_ids) order by c.id for share;
  if exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) r
      where not exists(select 1 from public.user_inventory i where i.user_id=actor and i.item_id=r->>'item_id')) then
    raise exception using errcode='22023',message='item_not_owned';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) r where not exists(
      select 1 from public.shop_item_surfaces c where c.item_id=r->>'item_id' and c.surface_type=r->>'surface_type' and c.room_kind=r->'placement_data'->>'kind'))
      or exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) child where child->>'surface_type'='tabletop' and not exists(
        select 1 from pg_catalog.jsonb_array_elements(rows_value) parent where parent->>'item_id'=child->>'parent_item_id'
          and parent->>'surface_type'='floor' and nookstep_private.tabletop_pair(child->'placement_data'->>'kind',parent->'placement_data'->>'kind'))) then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  if not nookstep_private.legacy_room(p_layout) or not nookstep_private.legacy_room(current_layout) then
    return pg_catalog.jsonb_build_object('ok',false,'code','room_update_required','room_revision',revision_value,'layout',current_layout);
  end if;
  proposed_layout:=nookstep_private.room_document(rows_value);
  if proposed_layout=current_layout then
    return pg_catalog.jsonb_build_object('ok',true,'code','unchanged','room_revision',revision_value,'layout',current_layout);
  end if;
  at_time:=pg_catalog.clock_timestamp();
  delete from public.room_placements p where p.user_id=actor;
  insert into public.room_placements(user_id,item_id,surface_type,parent_item_id,placement_data,updated_at)
    select actor,r->>'item_id',r->>'surface_type',r->>'parent_item_id',r->'placement_data',at_time
    from pg_catalog.jsonb_array_elements(rows_value) r;
  update public.profiles set room_revision=room_revision+1 where id=actor returning room_revision into revision_value;
  return pg_catalog.jsonb_build_object('ok',true,'code','saved','room_revision',revision_value,'layout',proposed_layout);
end;
$$;
create or replace function public.save_room_layout_surfaces(p_layout jsonb, p_expected_room_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := nookstep_private.lock_actor(); revision_value bigint; current_layout jsonb; proposed_layout jsonb;
  rows_value jsonb := '[]'::jsonb; entity jsonb; surface text; item_id_value text; parent_value text;
  seen_ids text[] := array[]::text[]; at_time timestamptz;
begin
  if p_expected_room_revision is null or p_expected_room_revision<0 then
    raise exception using errcode='22023',message='expected_room_revision_required';
  end if;
  select p.room_revision into revision_value from public.profiles p where p.id=actor;
  current_layout := nookstep_private.room_document(nookstep_private.room_rows(actor));
  if p_expected_room_revision<>revision_value then
    return pg_catalog.jsonb_build_object('ok',false,'code','layout_conflict','room_revision',revision_value,'layout',current_layout);
  end if;
  if (pg_catalog.jsonb_typeof(p_layout)='object' and p_layout->'version'='2'::jsonb
      and pg_catalog.jsonb_typeof(p_layout->'items')='array'
      and pg_catalog.jsonb_typeof(p_layout->'decorations')='array'
      and (not p_layout ? 'wallDecorations' or pg_catalog.jsonb_typeof(p_layout->'wallDecorations')='array')
      and pg_catalog.octet_length(p_layout::text)<=262144) is not true then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  if exists(select 1 from pg_catalog.jsonb_object_keys(p_layout) k where k not in ('version','items','decorations','wallDecorations')) then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  for surface,entity in
    select 'floor', value from pg_catalog.jsonb_array_elements(p_layout->'items')
    union all select 'tabletop',value from pg_catalog.jsonb_array_elements(p_layout->'decorations')
    union all select 'wall',value from pg_catalog.jsonb_array_elements(coalesce(p_layout->'wallDecorations','[]'::jsonb))
  loop
    if not nookstep_private.valid_room_entity(surface,entity) then raise exception using errcode='22023',message='invalid_layout'; end if;
    item_id_value:=entity->>'id'; parent_value:=entity->>'parentId';
    if item_id_value=any(seen_ids) or cardinality(seen_ids)>=256 then raise exception using errcode='22023',message='invalid_layout'; end if;
    seen_ids:=pg_catalog.array_append(seen_ids,item_id_value);
    rows_value:=rows_value || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'item_id',item_id_value,'surface_type',surface,'parent_item_id',parent_value,'placement_data',entity || '{"version":2}'::jsonb));
  end loop;
  -- Hold catalog metadata stable against concurrent administrative changes.
  perform 1 from public.shop_items c where c.id=any(seen_ids) order by c.id for share;
  if exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) r
      where not exists(select 1 from public.user_inventory i where i.user_id=actor and i.item_id=r->>'item_id')) then
    raise exception using errcode='22023',message='item_not_owned';
  end if;
  if exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) r where not exists(
      select 1 from public.shop_item_surfaces c where c.item_id=r->>'item_id' and c.surface_type=r->>'surface_type' and c.room_kind=r->'placement_data'->>'kind'))
      or exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) child where child->>'surface_type'='tabletop' and not exists(
        select 1 from pg_catalog.jsonb_array_elements(rows_value) parent where parent->>'item_id'=child->>'parent_item_id'
          and parent->>'surface_type'='floor' and nookstep_private.tabletop_pair(child->'placement_data'->>'kind',parent->'placement_data'->>'kind'))) then
    raise exception using errcode='22023',message='invalid_layout';
  end if;
  proposed_layout:=nookstep_private.room_document(rows_value);
  if proposed_layout=current_layout then
    return pg_catalog.jsonb_build_object('ok',true,'code','unchanged','room_revision',revision_value,'layout',current_layout);
  end if;
  at_time:=pg_catalog.clock_timestamp();
  delete from public.room_placements p where p.user_id=actor;
  insert into public.room_placements(user_id,item_id,surface_type,parent_item_id,placement_data,updated_at)
    select actor,r->>'item_id',r->>'surface_type',r->>'parent_item_id',r->'placement_data',at_time
    from pg_catalog.jsonb_array_elements(rows_value) r;
  update public.profiles set room_revision=room_revision+1 where id=actor returning room_revision into revision_value;
  return pg_catalog.jsonb_build_object('ok',true,'code','saved','room_revision',revision_value,'layout',proposed_layout);
end;
$$;
-- CREATE OR REPLACE retains existing privileges; assert explicit boundaries too.
revoke all on function nookstep_private.valid_placement(text,jsonb,text,text),
 nookstep_private.valid_room_entity(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.save_room_layout(jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.save_room_layout(jsonb,bigint) to authenticated;
revoke all on function public.save_room_layout_surfaces(jsonb,bigint) from public,anon,authenticated,service_role;
grant execute on function public.save_room_layout_surfaces(jsonb,bigint) to authenticated;
-- Existing inventory PK, owned-item FK, same-user parent FK, RLS, actor lock,
-- revision check, duplicate ID rejection and atomic write path remain unchanged.
create or replace function public.get_my_room_layout() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := nookstep_private.lock_actor(); revision_value bigint;
begin
  select p.room_revision into revision_value from public.profiles p where p.id=actor;
  return pg_catalog.jsonb_build_object('room_save_contract','surfaces-v1','ok',true,'code','loaded','room_revision',revision_value,
    'layout',nookstep_private.room_document(nookstep_private.room_rows(actor)));
end;
$$;
notify pgrst, 'reload schema';
commit;
