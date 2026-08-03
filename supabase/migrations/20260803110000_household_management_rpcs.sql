-- Consolidate duplicate household/profile policies before exposing destructive
-- management workflows. Flutter direct create/rename remains supported, while
-- transfer/leave/delete run through checked transactional RPCs.
drop policy if exists "Users can create households" on public.households;
drop policy if exists "Users can create their own household" on public.households;
drop policy if exists "Users can insert own household" on public.households;
drop policy if exists "Users can insert their own households" on public.households;
drop policy if exists "Users can delete own households" on public.households;
drop policy if exists "Users can delete their own household" on public.households;
drop policy if exists "Users can update own household" on public.households;
drop policy if exists "Users can update own households" on public.households;
drop policy if exists "Users can update their own household" on public.households;
drop policy if exists "Users can view own household" on public.households;
drop policy if exists "Users can view own households" on public.households;
drop policy if exists "Users can view their own household" on public.households;
drop policy if exists "Users can view their own households" on public.households;

create policy "Users can create households"
on public.households
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "Household owners can update household"
on public.households
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "Household owners can delete household"
on public.households
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can view own profile" on public.profiles;

create or replace function public.transfer_household_ownership(
  new_owner_id uuid
)
returns public.households
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  current_household public.households;
  new_owner_profile public.profiles;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if new_owner_id is null or new_owner_id = current_user_id then
    raise exception using errcode = '22023', message = 'INVALID_NEW_OWNER';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found or current_profile.household_id is null then
    raise exception using errcode = 'P0002', message = 'HOUSEHOLD_NOT_FOUND';
  end if;

  select *
  into new_owner_profile
  from public.profiles
  where id = new_owner_id
    and household_id = current_profile.household_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'NEW_OWNER_NOT_MEMBER';
  end if;

  select *
  into current_household
  from public.households
  where id = current_profile.household_id
  for update;

  if not found or current_household.owner_id <> current_user_id then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  update public.households
  set owner_id = new_owner_id,
      updated_at = now()
  where id = current_household.id
  returning * into current_household;

  return current_household;
end;
$$;

create or replace function public.leave_current_household()
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  current_owner_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found or current_profile.household_id is null then
    raise exception using errcode = 'P0002', message = 'HOUSEHOLD_NOT_FOUND';
  end if;

  select owner_id
  into current_owner_id
  from public.households
  where id = current_profile.household_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'HOUSEHOLD_NOT_FOUND';
  end if;

  if current_owner_id = current_user_id then
    raise exception using errcode = '42501', message = 'OWNER_MUST_TRANSFER_OR_DELETE';
  end if;

  update public.profiles
  set household_id = null,
      role = 'user',
      updated_at = now()
  where id = current_user_id
  returning * into current_profile;

  return current_profile;
end;
$$;

create or replace function public.delete_current_household(
  confirmation_name text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles;
  current_household public.households;
  deleted_household_id uuid;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = current_user_id
  for update;

  if not found or current_profile.household_id is null then
    raise exception using errcode = 'P0002', message = 'HOUSEHOLD_NOT_FOUND';
  end if;

  -- Lock every member before the household so concurrent leave/transfer calls
  -- cannot create a profile/household lock cycle during deletion.
  perform id
  from public.profiles
  where household_id = current_profile.household_id
  order by id
  for update;

  select *
  into current_household
  from public.households
  where id = current_profile.household_id
  for update;

  if not found or current_household.owner_id <> current_user_id then
    raise exception using errcode = '42501', message = 'OWNER_REQUIRED';
  end if;

  if trim(coalesce(confirmation_name, '')) <> current_household.name then
    raise exception using errcode = '22023', message = 'HOUSEHOLD_NAME_CONFIRMATION_MISMATCH';
  end if;

  delete from public.transactions
  where household_id = current_household.id;

  delete from public.budgets
  where household_id = current_household.id;

  delete from public.categories
  where household_id = current_household.id;

  update public.profiles
  set household_id = null,
      role = 'user',
      updated_at = now()
  where household_id = current_household.id;

  delete from public.households
  where id = current_household.id
  returning id into deleted_household_id;

  return deleted_household_id;
end;
$$;

revoke all on function public.transfer_household_ownership(uuid) from public, anon;
revoke all on function public.leave_current_household() from public, anon;
revoke all on function public.delete_current_household(text) from public, anon;

grant execute on function public.transfer_household_ownership(uuid) to authenticated;
grant execute on function public.leave_current_household() to authenticated;
grant execute on function public.delete_current_household(text) to authenticated;

comment on function public.transfer_household_ownership(uuid) is
  'Atomically transfers the current household to another current member.';

comment on function public.leave_current_household() is
  'Removes a non-owner current user from their household.';

comment on function public.delete_current_household(text) is
  'Permanently deletes the current owner household and all shared financial data after exact-name confirmation.';
