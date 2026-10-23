-- Separate rollout unit: schema/access controls must exist before enabling the trigger.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Briefly serialize trigger installation/backfill with signup INSERTs. On lock timeout,
-- the migration aborts without installing a partial provisioning mechanism.
lock table auth.users in share row exclusive mode;

create function nookstep_private.provision_auth_profile()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  -- Never trust raw_user_meta_data for balances/ownership. Defaults supply both zeros.
  insert into public.profiles (id, created_at)
  values (new.id, coalesce(new.created_at, pg_catalog.now()))
  on conflict (id) do nothing;
  return new;
end;
$$;
-- Trigger-only function: no direct API execution, including via service_role.
revoke all on function nookstep_private.provision_auth_profile()
  from public, anon, authenticated, service_role;

create trigger nookstep_on_auth_user_created
  after insert on auth.users
  for each row execute function nookstep_private.provision_auth_profile();

-- Existing Auth IDs, accounts and sessions stay intact; only missing profiles are added.
-- There is deliberately no conflict UPDATE, coin seed or starter ownership.
insert into public.profiles (id, created_at)
select users.id, coalesce(users.created_at, pg_catalog.now()) from auth.users as users
on conflict (id) do nothing;

-- Do not swallow trigger errors: a failed profile insert rolls back the new signup,
-- allowing a retry after repair instead of leaving a successful but unusable account.
commit;
