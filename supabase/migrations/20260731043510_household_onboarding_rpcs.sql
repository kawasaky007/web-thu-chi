create or replace function public.create_household_for_current_user(
  household_name text
)
returns public.households
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  clean_name text := regexp_replace(trim(coalesce(household_name, '')), '\s+', ' ', 'g');
  current_household_id uuid;
  created_household public.households;
  invite_attempt integer := 0;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if char_length(clean_name) < 2 or char_length(clean_name) > 60 then
    raise exception using errcode = '22023', message = 'INVALID_HOUSEHOLD_NAME';
  end if;

  select household_id
  into current_household_id
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  if current_household_id is not null then
    raise exception using errcode = 'P0001', message = 'HOUSEHOLD_ALREADY_SET';
  end if;

  loop
    invite_attempt := invite_attempt + 1;

    begin
      insert into public.households (name, invite_code, owner_id, currency_code)
      values (
        clean_name,
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
        current_user_id,
        'VND'
      )
      returning * into created_household;

      exit;
    exception
      when unique_violation then
        if invite_attempt >= 5 then
          raise exception using
            errcode = '23505',
            message = 'INVITE_CODE_GENERATION_FAILED';
        end if;
    end;
  end loop;

  update public.profiles
  set household_id = created_household.id,
      updated_at = now()
  where id = current_user_id
    and household_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOUSEHOLD_ALREADY_SET';
  end if;

  return created_household;
end;
$$;

create or replace function public.join_household_by_invite_code(
  invite_code_input text
)
returns public.households
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  clean_invite_code text := upper(
    regexp_replace(trim(coalesce(invite_code_input, '')), '[\s-]+', '', 'g')
  );
  current_household_id uuid;
  joined_household public.households;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if char_length(clean_invite_code) < 6 or char_length(clean_invite_code) > 8 then
    raise exception using errcode = '22023', message = 'INVALID_INVITE_CODE';
  end if;

  select household_id
  into current_household_id
  from public.profiles
  where id = current_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'PROFILE_NOT_FOUND';
  end if;

  if current_household_id is not null then
    raise exception using errcode = 'P0001', message = 'HOUSEHOLD_ALREADY_SET';
  end if;

  select *
  into joined_household
  from public.households
  where invite_code = clean_invite_code;

  if not found then
    raise exception using errcode = 'P0002', message = 'INVALID_INVITE_CODE';
  end if;

  update public.profiles
  set household_id = joined_household.id,
      updated_at = now()
  where id = current_user_id
    and household_id is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'HOUSEHOLD_ALREADY_SET';
  end if;

  return joined_household;
end;
$$;

revoke all on function public.create_household_for_current_user(text) from public, anon;
revoke all on function public.join_household_by_invite_code(text) from public, anon;

grant execute on function public.create_household_for_current_user(text) to authenticated;
grant execute on function public.join_household_by_invite_code(text) to authenticated;

comment on function public.create_household_for_current_user(text) is
  'Atomically creates a household and attaches the current user profile.';

comment on function public.join_household_by_invite_code(text) is
  'Atomically joins the current user profile to a household by invite code.';
