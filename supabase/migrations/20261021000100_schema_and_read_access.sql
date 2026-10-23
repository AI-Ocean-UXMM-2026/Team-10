-- Task 03A only. No catalog seed, study/economy RPCs, or room-save operation.
-- Fail on name collisions rather than silently accepting an unknown existing schema.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema nookstep_private;
revoke all on schema nookstep_private from public, anon, authenticated, service_role;

-- Schema validation only; not a transactional RPC or a geometry/collision engine.
-- Per-row version 2 preserves Room Lab's native entity field names/coordinate units.
create function nookstep_private.valid_placement(
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
      and (data ->> 'kind' = 'laptop' or (data ->> 'turn')::numeric = 0);
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
revoke all on function nookstep_private.valid_placement(text, jsonb, text, text)
  from public, anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  coins_balance integer not null default 0 check (coins_balance >= 0),
  room_revision bigint not null default 0 check (room_revision >= 0),
  created_at timestamptz not null default now() check (isfinite(created_at))
);

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text check (subject is null or (char_length(subject) between 1 and 80 and subject !~ '^[[:space:]]*$' and subject = btrim(subject))),
  topic text not null check (char_length(topic) between 1 and 120 and topic !~ '^[[:space:]]*$' and topic = btrim(topic)),
  study_mode text not null check (study_mode in ('understand', 'practice', 'remember', 'review')),
  finish_line text not null check (char_length(finish_line) between 1 and 240 and finish_line !~ '^[[:space:]]*$' and finish_line = btrim(finish_line)),
  planned_minutes smallint not null check (planned_minutes between 5 and 120),
  status text not null default 'running' check (status in ('running', 'paused', 'completed', 'cancelled', 'expired')),
  started_at timestamptz not null default now() check (isfinite(started_at)),
  running_since timestamptz default now(),
  accrued_active_seconds integer not null default 0 check (accrued_active_seconds >= 0 and accrued_active_seconds <= planned_minutes * 60),
  ended_at timestamptz,
  reflection_status text not null default 'pending' check (reflection_status in ('pending', 'answered', 'skipped')),
  reflection_text text,
  reflection_outcome text,
  next_step_status text not null default 'pending' check (next_step_status in ('pending', 'saved', 'skipped')),
  next_step_text text,
  constraint study_sessions_owner_key unique (user_id, id),
  constraint study_sessions_timer_shape check (
    (status = 'running' and running_since is not null and ended_at is null)
    or (status = 'paused' and running_since is null and ended_at is null)
    or (status in ('completed', 'cancelled', 'expired') and running_since is null and ended_at is not null)
  ),
  constraint study_sessions_timestamp_order check (
    (running_since is null or (isfinite(running_since) and running_since >= started_at))
    and (ended_at is null or (isfinite(ended_at) and ended_at >= started_at))
  ),
  constraint study_sessions_completed_duration check (status <> 'completed' or accrued_active_seconds = planned_minutes * 60),
  constraint study_sessions_reflection_shape check (
    (reflection_status = 'answered' and reflection_text is not null
      and char_length(reflection_text) between 1 and 2000 and reflection_text !~ '^[[:space:]]*$'
      and (reflection_outcome is null or (char_length(reflection_outcome) between 1 and 240 and reflection_outcome !~ '^[[:space:]]*$')))
    or (reflection_status in ('pending', 'skipped') and reflection_text is null and reflection_outcome is null)
  ),
  constraint study_sessions_next_step_shape check (
    (next_step_status = 'saved' and next_step_text is not null
      and char_length(next_step_text) between 1 and 240 and next_step_text !~ '^[[:space:]]*$')
    or (next_step_status in ('pending', 'skipped') and next_step_text is null)
  ),
  constraint study_sessions_followup_after_completion check (
    status = 'completed' or (reflection_status = 'pending' and next_step_status = 'pending')
  )
);
create unique index ux_study_sessions_one_active_per_user on public.study_sessions(user_id)
  where status in ('running', 'paused');
create index ix_study_sessions_owner_started on public.study_sessions(user_id, started_at desc);

create table public.shop_items (
  id text primary key check (char_length(id) between 1 and 120 and id ~ '^[a-z0-9][a-z0-9_-]*$'),
  name text not null check (char_length(name) between 1 and 120 and name !~ '^[[:space:]]*$'),
  category text not null check (char_length(category) between 1 and 80 and category !~ '^[[:space:]]*$'),
  price_coins integer not null check (price_coins > 0),
  surface_type text not null check (surface_type in ('floor', 'tabletop', 'wall')),
  room_kind text not null,
  asset_path text not null check (char_length(asset_path) between 2 and 1024 and asset_path ~ '^/[A-Za-z0-9][A-Za-z0-9_./-]*$' and asset_path !~ '(^|/)\.\.(/|$)'),
  -- Admin-supplied actual sprite variants, not guessed paths or generated artwork.
  asset_variants jsonb not null default '{}'::jsonb check (jsonb_typeof(asset_variants) = 'object' and octet_length(asset_variants::text) <= 16384),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  constraint shop_items_room_kind check (
    (surface_type = 'floor' and room_kind in ('bed', 'chair', 'desk', 'sofa', 'lamp', 'aquarium', 'television'))
    or (surface_type = 'tabletop' and room_kind in ('laptop', 'books', 'coffeecups', 'candle'))
    or (surface_type = 'wall' and room_kind in ('painting', 'window'))
  ),
  constraint shop_items_placement_key unique (id, surface_type, room_kind)
);

create table public.user_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete restrict,
  purchased_at timestamptz not null default now() check (isfinite(purchased_at)),
  primary key (user_id, item_id)
);
create index ix_user_inventory_item on public.user_inventory(item_id);

create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('session_reward', 'furniture_purchase')),
  amount integer not null,
  session_id uuid,
  item_id text references public.shop_items(id) on delete restrict,
  created_at timestamptz not null default now() check (isfinite(created_at)),
  constraint coin_transactions_shape check (
    (kind = 'session_reward' and amount > 0 and session_id is not null and item_id is null)
    or (kind = 'furniture_purchase' and amount < 0 and item_id is not null and session_id is null)
  ),
  constraint coin_transactions_session_owner foreign key (user_id, session_id)
    references public.study_sessions(user_id, id),
  -- Deferred so the future purchase transaction can insert its ledger/ownership in either order.
  constraint coin_transactions_purchase_owner foreign key (user_id, item_id)
    references public.user_inventory(user_id, item_id) deferrable initially deferred
);
create unique index ux_coin_tx_one_reward_per_session on public.coin_transactions(session_id)
  where kind = 'session_reward';
create unique index ux_coin_tx_one_purchase_per_item on public.coin_transactions(user_id, item_id)
  where kind = 'furniture_purchase';
create index ix_coin_transactions_owner_created on public.coin_transactions(user_id, created_at desc);
create index ix_coin_transactions_item on public.coin_transactions(item_id) where item_id is not null;

create table public.room_placements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  surface_type text not null check (surface_type in ('floor', 'tabletop', 'wall')),
  placement_data jsonb not null,
  parent_item_id text,
  updated_at timestamptz not null default now() check (isfinite(updated_at)),
  room_kind text generated always as (placement_data ->> 'kind') stored not null,
  parent_surface_type text generated always as (case when parent_item_id is not null then 'floor'::text end) stored,
  parent_room_kind text generated always as (case when parent_item_id is not null then 'desk'::text end) stored,
  primary key (user_id, item_id),
  constraint room_placements_owned_item foreign key (user_id, item_id)
    references public.user_inventory(user_id, item_id) on delete cascade,
  constraint room_placements_catalog_shape foreign key (item_id, surface_type, room_kind)
    references public.shop_items(id, surface_type, room_kind),
  constraint room_placements_parent_desk foreign key (parent_item_id, parent_surface_type, parent_room_kind)
    references public.shop_items(id, surface_type, room_kind),
  -- Whole-room replacement may insert children first, but every parent must be placed at commit.
  constraint room_placements_parent_placed foreign key (user_id, parent_item_id)
    references public.room_placements(user_id, item_id) deferrable initially deferred,
  constraint room_placements_structure check (
    nookstep_private.valid_placement(surface_type, placement_data, item_id, parent_item_id)
  )
);
create index ix_room_placements_item on public.room_placements(item_id);
create index ix_room_placements_parent on public.room_placements(user_id, parent_item_id) where parent_item_id is not null;

-- Explicitly remove automatic Supabase object grants, including PUBLIC inheritance.
-- Scope revocations to these objects; do not change unrelated tables/default privileges.
revoke all on table public.profiles, public.study_sessions, public.shop_items,
  public.coin_transactions, public.user_inventory, public.room_placements
  from public, anon, authenticated, service_role;
grant usage on schema public to authenticated;
grant select on table public.profiles, public.study_sessions, public.shop_items,
  public.coin_transactions, public.user_inventory, public.room_placements to authenticated;

alter table public.profiles enable row level security;
alter table public.study_sessions enable row level security;
alter table public.shop_items enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.user_inventory enable row level security;
alter table public.room_placements enable row level security;

create policy profiles_read_own on public.profiles for select to authenticated
  using ((select auth.uid()) is not null and id = (select auth.uid()));
create policy study_sessions_read_own on public.study_sessions for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy coin_transactions_read_own on public.coin_transactions for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy user_inventory_read_own on public.user_inventory for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
create policy room_placements_read_own on public.room_placements for select to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));
-- Include inactive metadata so delisting never hides an owned piece of furniture.
create policy shop_items_read_catalog on public.shop_items for select to authenticated using (true);

comment on column public.profiles.room_revision is 'Task 03B: lock profile, compare expected revision, save whole room atomically, increment once. No client writes.';
comment on column public.study_sessions.started_at is 'Task 03B: original server time anchors lazy 24-hour expiry; reads alone do not expire sessions.';
comment on column public.room_placements.placement_data is 'Version 2 per-entity Room Lab data; preserves native fields. Structural checks are not visual bounds/collision validation.';
commit;
