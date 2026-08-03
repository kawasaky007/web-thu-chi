-- Savings are earmarked assets, not expenses. Keep a separate immutable ledger
-- so dashboard income/expense remains accurate and goal balances cannot drift.
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  kind text not null default 'general' check (kind in ('general', 'emergency')),
  target_amount numeric not null check (target_amount > 0 and target_amount <= 1000000000000000),
  target_date date,
  color text not null default '#1F3D2B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'saving' check (icon in ('saving', 'shield', 'home', 'travel', 'education', 'car', 'other')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint savings_goals_name_check check (char_length(trim(name)) between 1 and 80)
);

create table if not exists public.savings_goal_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in ('deposit', 'withdrawal')),
  amount numeric not null check (amount > 0 and amount <= 1000000000000),
  note text,
  entry_date date not null,
  created_at timestamptz not null default now(),
  constraint savings_goal_entries_note_check check (note is null or char_length(note) <= 240)
);

create index if not exists savings_goals_household_status_target_idx
on public.savings_goals (household_id, status, target_date, created_at desc, id);

create index if not exists savings_goal_entries_goal_date_idx
on public.savings_goal_entries (goal_id, entry_date desc, created_at desc, id desc);

create index if not exists savings_goal_entries_household_date_idx
on public.savings_goal_entries (household_id, entry_date desc, created_at desc, id desc);

alter table public.savings_goals enable row level security;
alter table public.savings_goal_entries enable row level security;

create policy "Household members can select savings goals"
on public.savings_goals
for select
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can insert savings goals"
on public.savings_goals
for insert
to authenticated
with check (
  household_id = public.current_user_household_id()
  and created_by = auth.uid()
);

create policy "Household members can update savings goals"
on public.savings_goals
for update
to authenticated
using (household_id = public.current_user_household_id())
with check (household_id = public.current_user_household_id());

create policy "Household members can delete empty savings goals"
on public.savings_goals
for delete
to authenticated
using (
  household_id = public.current_user_household_id()
  and not exists (
    select 1
    from public.savings_goal_entries as goal_entry
    where goal_entry.goal_id = savings_goals.id
  )
);

create policy "Household members can select savings goal entries"
on public.savings_goal_entries
for select
to authenticated
using (household_id = public.current_user_household_id());

create or replace function public.record_savings_goal_entry(
  p_goal_id uuid,
  p_entry_type text,
  p_amount numeric,
  p_entry_date date,
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
  current_amount numeric := 0;
  next_amount numeric := 0;
  created_entry_id uuid;
begin
  if auth.uid() is null or current_household_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
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
    'isCompleted', next_amount >= goal_row.target_amount
  );
end;
$$;

revoke all on function public.record_savings_goal_entry(uuid, text, numeric, date, text, uuid)
from public, anon;
grant execute on function public.record_savings_goal_entry(uuid, text, numeric, date, text, uuid)
to authenticated;

comment on function public.record_savings_goal_entry(uuid, text, numeric, date, text, uuid) is
  'Atomically records a household savings deposit or withdrawal and prevents negative goal balances.';
