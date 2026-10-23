-- Task 03B. No hosted execution, catalog seed, extra application tables or client writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Invoker helpers are reachable only inside the narrowly granted definer entry points.
create function nookstep_private.lock_actor() returns uuid
language plpgsql set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='28000', message='authentication_required'; end if;
  perform 1 from public.profiles p where p.id=actor for update;
  if not found then raise exception using errcode='P0001', message='profile_not_ready'; end if;
  return actor;
end;
$$;

create function nookstep_private.clean_text(value text) returns text
language sql immutable set search_path = '' as $$
  select nullif(pg_catalog.regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
$$;

create function nookstep_private.active_seconds(quest public.study_sessions, at_time timestamptz) returns integer
language sql immutable set search_path = '' as $$
  select least(quest.planned_minutes * 60,
    quest.accrued_active_seconds + case when quest.status='running' then
      greatest(0, pg_catalog.floor(extract(epoch from (at_time - quest.running_since)))) else 0 end)::integer;
$$;

-- Caller holds the profile and session locks. Expiry is an acknowledged state change,
-- not an exception: raising after it would roll back expiry and leave Start blocked.
create function nookstep_private.expire_quest(quest public.study_sessions, at_time timestamptz)
returns public.study_sessions language plpgsql set search_path = '' as $$
begin
  if quest.status in ('running','paused') and at_time >= quest.started_at + interval '24 hours' then
    update public.study_sessions set status='expired', running_since=null, ended_at=at_time,
      accrued_active_seconds=nookstep_private.active_seconds(quest, at_time)
    where id=quest.id and user_id=quest.user_id returning * into quest;
  end if;
  return quest;
end;
$$;

create function nookstep_private.quest_result(quest public.study_sessions, result_code text, success boolean, at_time timestamptz)
returns jsonb language sql set search_path = '' as $$
  select pg_catalog.jsonb_build_object('ok',success,'code',result_code,
    'session',case when quest.id is null then null else pg_catalog.to_jsonb(quest) end,
    'server_time',at_time,
    'active_seconds',case when quest.id is null then null else nookstep_private.active_seconds(quest,at_time) end,
    'coins_balance',(select p.coins_balance from public.profiles p where p.id=auth.uid()),
    'reward_coins',coalesce((select t.amount from public.coin_transactions t
      where t.user_id=auth.uid() and t.session_id=quest.id and t.kind='session_reward'),0));
$$;

create function public.start_study_quest(
  p_topic text, p_subject text, p_study_mode text, p_finish_line text, p_planned_minutes numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := nookstep_private.lock_actor();
  quest public.study_sessions;
  at_time timestamptz;
  topic_value text := nookstep_private.clean_text(p_topic);
  subject_value text := nookstep_private.clean_text(p_subject);
  finish_value text := nookstep_private.clean_text(p_finish_line);
begin
  if (topic_value is not null and char_length(topic_value)<=120
      and (subject_value is null or char_length(subject_value)<=80)
      and finish_value is not null and char_length(finish_value)<=240
      and p_study_mode in ('understand','practice','remember','review')
      and p_planned_minutes between 5 and 120 and mod(p_planned_minutes,1)=0) is not true then
    raise exception using errcode='22023', message='invalid_quest_input';
  end if;
  select * into quest from public.study_sessions s
    where s.user_id=actor and s.status in ('running','paused') for update;
  at_time := pg_catalog.clock_timestamp();
  if found then
    quest := nookstep_private.expire_quest(quest,at_time);
    if quest.status <> 'expired' then
      return nookstep_private.quest_result(quest,'active_quest_exists',false,at_time);
    end if;
  end if;
  insert into public.study_sessions(user_id,topic,subject,study_mode,finish_line,planned_minutes,started_at,running_since)
    values(actor,topic_value,subject_value,p_study_mode,finish_value,p_planned_minutes::smallint,at_time,at_time)
    returning * into quest;
  return nookstep_private.quest_result(quest,'started',true,at_time);
end;
$$;

create function public.get_my_active_quest() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := nookstep_private.lock_actor(); quest public.study_sessions; at_time timestamptz;
begin
  select * into quest from public.study_sessions s
    where s.user_id=actor and s.status in ('running','paused') for update;
  at_time := pg_catalog.clock_timestamp();
  if quest.id is null then return nookstep_private.quest_result(quest,'no_active_quest',true,at_time); end if;
  quest := nookstep_private.expire_quest(quest,at_time);
  return nookstep_private.quest_result(quest,case when quest.status='expired' then 'expired' else 'active' end,true,at_time);
end;
$$;

-- A private state machine avoids four competing implementations of expiry/accrual.
-- Public entry points below bind the action; callers cannot request arbitrary updates.
create function nookstep_private.change_timer(p_session_id uuid, requested_action text) returns jsonb
language plpgsql set search_path = '' as $$
declare
  actor uuid := nookstep_private.lock_actor(); quest public.study_sessions;
  at_time timestamptz; seconds_value integer; reward_value integer := 0;
begin
  if requested_action not in ('pause','resume','cancel','complete') then
    raise exception using errcode='22023', message='invalid_timer_action';
  end if;
  select * into quest from public.study_sessions s where s.id=p_session_id and s.user_id=actor for update;
  at_time := pg_catalog.clock_timestamp();
  if quest.id is null then return nookstep_private.quest_result(quest,'not_found',false,at_time); end if;
  quest := nookstep_private.expire_quest(quest,at_time);
  if quest.status='expired' then return nookstep_private.quest_result(quest,'expired',false,at_time); end if;
  if (requested_action='pause' and quest.status='paused')
      or (requested_action='resume' and quest.status='running')
      or (requested_action='cancel' and quest.status='cancelled')
      or (requested_action='complete' and quest.status='completed') then
    return nookstep_private.quest_result(quest,'already_' || quest.status,true,at_time);
  end if;
  if quest.status not in ('running','paused') or (requested_action='complete' and quest.status<>'running') then
    return nookstep_private.quest_result(quest,'invalid_transition',false,at_time);
  end if;
  seconds_value := nookstep_private.active_seconds(quest,at_time);
  if requested_action='complete' and seconds_value < quest.planned_minutes*60 then
    return nookstep_private.quest_result(quest,'too_early',false,at_time);
  end if;
  if requested_action='pause' then
    update public.study_sessions set status='paused', running_since=null, accrued_active_seconds=seconds_value
      where id=quest.id and user_id=actor returning * into quest;
  elsif requested_action='resume' then
    update public.study_sessions set status='running', running_since=at_time
      where id=quest.id and user_id=actor returning * into quest;
  else
    update public.study_sessions set status=case when requested_action='cancel' then 'cancelled' else 'completed' end,
      running_since=null, ended_at=at_time, accrued_active_seconds=seconds_value
      where id=quest.id and user_id=actor returning * into quest;
    if requested_action='complete' and quest.planned_minutes>=10 then
      reward_value := quest.planned_minutes;
      -- A uniqueness/integrity error aborts the whole transaction. No half-completion
      -- or balance-only credit can commit; retries see terminal state under the same lock.
      insert into public.coin_transactions(user_id,kind,amount,session_id,created_at)
        values(actor,'session_reward',reward_value,quest.id,at_time);
      update public.profiles set coins_balance=coins_balance+reward_value where id=actor;
    end if;
  end if;
  return nookstep_private.quest_result(quest,quest.status,true,at_time);
end;
$$;

create function public.pause_study_quest(p_session_id uuid) returns jsonb
language sql security definer set search_path = '' as $$ select nookstep_private.change_timer(p_session_id,'pause'); $$;
create function public.resume_study_quest(p_session_id uuid) returns jsonb
language sql security definer set search_path = '' as $$ select nookstep_private.change_timer(p_session_id,'resume'); $$;
create function public.cancel_study_quest(p_session_id uuid) returns jsonb
language sql security definer set search_path = '' as $$ select nookstep_private.change_timer(p_session_id,'cancel'); $$;
create function public.complete_study_quest(p_session_id uuid) returns jsonb
language sql security definer set search_path = '' as $$ select nookstep_private.change_timer(p_session_id,'complete'); $$;

create function nookstep_private.set_followup(p_session_id uuid, target text, requested_action text, p_text text, p_outcome text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  actor uuid := nookstep_private.lock_actor(); quest public.study_sessions; at_time timestamptz;
  text_value text := nookstep_private.clean_text(p_text);
  outcome_value text := nookstep_private.clean_text(p_outcome);
  status_value text;
begin
  if target='reflection' then
    if (requested_action='answer' and text_value is not null and char_length(text_value)<=2000
        and (outcome_value is null or char_length(outcome_value)<=240)) is true then status_value := 'answered';
    elsif requested_action='skip' and p_text is null and p_outcome is null then status_value := 'skipped';
    else raise exception using errcode='22023', message='invalid_learning_check'; end if;
  elsif target='next_step' then
    if requested_action='save' and text_value is not null and char_length(text_value)<=240 and p_outcome is null then status_value := 'saved';
    elsif requested_action='skip' and p_text is null and p_outcome is null then status_value := 'skipped';
    else raise exception using errcode='22023', message='invalid_next_step'; end if;
  else raise exception using errcode='22023', message='invalid_followup'; end if;
  select * into quest from public.study_sessions s where s.id=p_session_id and s.user_id=actor for update;
  at_time := pg_catalog.clock_timestamp();
  if quest.id is null then return nookstep_private.quest_result(quest,'not_found',false,at_time); end if;
  if quest.status<>'completed' then return nookstep_private.quest_result(quest,'invalid_transition',false,at_time); end if;
  if target='reflection' and quest.reflection_status<>'pending' then
    return nookstep_private.quest_result(quest,'followup_already_set',
      quest.reflection_status=status_value and quest.reflection_text is not distinct from text_value
      and quest.reflection_outcome is not distinct from outcome_value,at_time);
  elsif target='next_step' and quest.next_step_status<>'pending' then
    return nookstep_private.quest_result(quest,'followup_already_set',
      quest.next_step_status=status_value and quest.next_step_text is not distinct from text_value,at_time);
  end if;
  if target='reflection' then
    update public.study_sessions set reflection_status=status_value,reflection_text=text_value,reflection_outcome=outcome_value
      where id=quest.id and user_id=actor returning * into quest;
  else
    update public.study_sessions set next_step_status=status_value,next_step_text=text_value
      where id=quest.id and user_id=actor returning * into quest;
  end if;
  return nookstep_private.quest_result(quest,'saved',true,at_time);
end;
$$;
create function public.set_learning_check(p_session_id uuid, p_action text, p_text text default null, p_outcome text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select nookstep_private.set_followup(p_session_id,'reflection',p_action,p_text,p_outcome);
$$;
create function public.set_next_step(p_session_id uuid, p_action text, p_text text default null)
returns jsonb language sql security definer set search_path = '' as $$
  select nookstep_private.set_followup(p_session_id,'next_step',p_action,p_text,null);
$$;

create function public.purchase_shop_item(p_item_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := nookstep_private.lock_actor(); item public.shop_items; balance_value integer; result_code text; owned boolean;
begin
  select * into item from public.shop_items c where c.id=p_item_id for share;
  select p.coins_balance into balance_value from public.profiles p where p.id=actor;
  select exists(select 1 from public.user_inventory i where i.user_id=actor and i.item_id=p_item_id) into owned;
  if owned then result_code := 'already_owned';
  elsif item.id is null or not item.is_active then result_code := 'item_unavailable';
  elsif balance_value<item.price_coins then result_code := 'insufficient_coins';
  else
    insert into public.user_inventory(user_id,item_id,purchased_at) values(actor,item.id,pg_catalog.clock_timestamp());
    insert into public.coin_transactions(user_id,kind,amount,item_id,created_at)
      values(actor,'furniture_purchase',-item.price_coins,item.id,pg_catalog.clock_timestamp());
    update public.profiles set coins_balance=coins_balance-item.price_coins where id=actor returning coins_balance into balance_value;
    result_code := 'purchased'; owned := true;
  end if;
  return pg_catalog.jsonb_build_object('ok',result_code in ('purchased','already_owned'),'code',result_code,
    'item_id',p_item_id,'owned',owned,'coins_balance',balance_value);
end;
$$;

-- Validate the native Room Lab v2 entity shape without mutating/normalizing old saves.
-- The existing CHECK remains unchanged: all legitimate native groundOffset pairs and
-- zero POSITION coordinates already fit it. Zero ground offsets are not native fixtures.
create function nookstep_private.valid_room_entity(surface text, entity jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare allowed_keys text[]; key_name text; offset_x numeric; offset_y numeric; width_value integer; depth_value integer;
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

create function nookstep_private.room_document(rows_value jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_build_object('version',2,
    'items',coalesce(pg_catalog.jsonb_agg((row_value->'placement_data')-'version' order by row_value->>'item_id') filter(where row_value->>'surface_type'='floor'),'[]'::jsonb),
    'decorations',coalesce(pg_catalog.jsonb_agg((row_value->'placement_data')-'version' order by row_value->>'item_id') filter(where row_value->>'surface_type'='tabletop'),'[]'::jsonb),
    'wallDecorations',coalesce(pg_catalog.jsonb_agg((row_value->'placement_data')-'version' order by row_value->>'item_id') filter(where row_value->>'surface_type'='wall'),'[]'::jsonb))
  from pg_catalog.jsonb_array_elements(rows_value) as entries(row_value);
$$;
create function nookstep_private.room_rows(actor uuid) returns jsonb
language sql set search_path = '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) order by p.item_id),'[]'::jsonb)
  from public.room_placements p where p.user_id=actor;
$$;
create function public.get_my_room_layout() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := nookstep_private.lock_actor(); revision_value bigint;
begin
  select p.room_revision into revision_value from public.profiles p where p.id=actor;
  return pg_catalog.jsonb_build_object('ok',true,'code','loaded','room_revision',revision_value,
    'layout',nookstep_private.room_document(nookstep_private.room_rows(actor)));
end;
$$;

create function public.save_room_layout(p_layout jsonb, p_expected_room_revision bigint) returns jsonb
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
      select 1 from public.shop_items c where c.id=r->>'item_id' and c.surface_type=r->>'surface_type' and c.room_kind=r->'placement_data'->>'kind'))
      or exists(select 1 from pg_catalog.jsonb_array_elements(rows_value) child where child->>'surface_type'='tabletop' and not exists(
        select 1 from pg_catalog.jsonb_array_elements(rows_value) parent where parent->>'item_id'=child->>'parent_item_id'
          and parent->>'surface_type'='floor' and parent->'placement_data'->>'kind'='desk')) then
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

-- New functions inherit Supabase/PUBLIC default grants. Remove them on exactly the
-- objects introduced here, then expose only these authenticated domain entry points.
do $$
declare signature text;
begin
  foreach signature in array array[
    'nookstep_private.lock_actor()', 'nookstep_private.clean_text(text)',
    'nookstep_private.active_seconds(public.study_sessions,timestamp with time zone)',
    'nookstep_private.expire_quest(public.study_sessions,timestamp with time zone)',
    'nookstep_private.quest_result(public.study_sessions,text,boolean,timestamp with time zone)',
    'nookstep_private.change_timer(uuid,text)', 'nookstep_private.set_followup(uuid,text,text,text,text)',
    'nookstep_private.valid_room_entity(text,jsonb)', 'nookstep_private.room_document(jsonb)', 'nookstep_private.room_rows(uuid)'
  ] loop
    execute 'revoke all on function ' || signature || ' from public, anon, authenticated, service_role';
  end loop;
  foreach signature in array array[
    'public.start_study_quest(text,text,text,text,numeric)', 'public.get_my_active_quest()',
    'public.pause_study_quest(uuid)', 'public.resume_study_quest(uuid)', 'public.cancel_study_quest(uuid)', 'public.complete_study_quest(uuid)',
    'public.set_learning_check(uuid,text,text,text)', 'public.set_next_step(uuid,text,text)',
    'public.purchase_shop_item(text)', 'public.get_my_room_layout()', 'public.save_room_layout(jsonb,bigint)'
  ] loop
    execute 'revoke all on function ' || signature || ' from public, anon, authenticated, service_role';
    execute 'grant execute on function ' || signature || ' to authenticated';
  end loop;
end;
$$;
commit;
