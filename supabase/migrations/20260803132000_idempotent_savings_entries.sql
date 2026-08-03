alter table public.savings_goal_entries
add column if not exists request_id uuid;

update public.savings_goal_entries
set request_id = id
where request_id is null;

alter table public.savings_goal_entries
alter column request_id set not null;

create unique index if not exists savings_goal_entries_request_id_unique_idx
on public.savings_goal_entries (request_id);

drop function if exists public.record_savings_goal_entry(uuid, text, numeric, date, text, uuid);

create or replace function public.record_savings_goal_entry(
  p_goal_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_entry_date date,
  p_request_id uuid,
  p_note text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_household_id uuid := public.current_user_household_id();
  vietnam_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  selected_member_id uuid := coalesce(p_user_id, auth.uid());
  goal_row public.savings_goals;
  existing_entry record;
  current_amount numeric := 0;
  next_amount numeric := 0;
  created_entry_id uuid;
begin
  if auth.uid() is null or current_household_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_request_id is null then
    raise exception using errcode = '22023', message = 'SAVINGS_REQUEST_ID_REQUIRED';
  end if;

  if p_entry_type not in ('deposit', 'withdrawal') then
    raise exception using errcode = '22023', message = 'INVALID_SAVINGS_ENTRY_TYPE';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then
    raise exception using errcode = '22023', message = 'INVALID_SAVINGS_AMOUNT';
  end if;

  if p_entry_date is null
     or p_entry_date < date '2000-01-01'
     or p_entry_date > vietnam_today then
    raise exception using errcode = '22023', message = 'INVALID_SAVINGS_ENTRY_DATE';
  end if;

  if char_length(trim(coalesce(p_note, ''))) > 240 then
    raise exception using errcode = '22023', message = 'SAVINGS_NOTE_TOO_LONG';
  end if;

  select *
  into goal_row
  from public.savings_goals
  where id = p_goal_id
    and household_id = current_household_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SAVINGS_GOAL_NOT_FOUND';
  end if;

  select id, goal_id
  into existing_entry
  from public.savings_goal_entries
  where request_id = p_request_id
    and household_id = current_household_id;

  if found then
    if existing_entry.goal_id <> goal_row.id then
      raise exception using errcode = '22023', message = 'SAVINGS_REQUEST_ID_CONFLICT';
    end if;

    select coalesce(sum(
      case when entry_type = 'deposit' then amount else -amount end
    ), 0)
    into current_amount
    from public.savings_goal_entries
    where goal_id = goal_row.id;

    return jsonb_build_object(
      'entryId', existing_entry.id,
      'currentAmount', current_amount,
      'targetAmount', goal_row.target_amount,
      'isCompleted', current_amount >= goal_row.target_amount,
      'replayed', true
    );
  end if;

  if goal_row.status = 'archived' then
    raise exception using errcode = '22023', message = 'SAVINGS_GOAL_ARCHIVED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = selected_member_id
      and household_id = current_household_id
  ) then
    raise exception using errcode = '22023', message = 'SAVINGS_MEMBER_NOT_ALLOWED';
  end if;

  select coalesce(sum(
    case when entry_type = 'deposit' then amount else -amount end
  ), 0)
  into current_amount
  from public.savings_goal_entries
  where goal_id = goal_row.id;

  next_amount := current_amount + case
    when p_entry_type = 'deposit' then p_amount
    else -p_amount
  end;

  if next_amount < 0 then
    raise exception using errcode = '22023', message = 'SAVINGS_WITHDRAWAL_EXCEEDS_BALANCE';
  end if;

  insert into public.savings_goal_entries (
    household_id,
    goal_id,
    user_id,
    created_by,
    request_id,
    entry_type,
    amount,
    note,
    entry_date
  )
  values (
    current_household_id,
    goal_row.id,
    selected_member_id,
    auth.uid(),
    p_request_id,
    p_entry_type,
    p_amount,
    nullif(trim(coalesce(p_note, '')), ''),
    p_entry_date
  )
  returning id into created_entry_id;

  update public.savings_goals
  set status = case
        when next_amount >= target_amount then 'completed'
        when status = 'completed' then 'active'
        else status
      end,
      updated_at = now()
  where id = goal_row.id;

  return jsonb_build_object(
    'entryId', created_entry_id,
    'currentAmount', next_amount,
    'targetAmount', goal_row.target_amount,
    'isCompleted', next_amount >= goal_row.target_amount,
    'replayed', false
  );
end;
$$;

revoke all on function public.record_savings_goal_entry(uuid, text, numeric, date, uuid, text, uuid)
from public, anon;
grant execute on function public.record_savings_goal_entry(uuid, text, numeric, date, uuid, text, uuid)
to authenticated;

comment on function public.record_savings_goal_entry(uuid, text, numeric, date, uuid, text, uuid) is
  'Idempotently records a household savings deposit or withdrawal and prevents negative balances.';
