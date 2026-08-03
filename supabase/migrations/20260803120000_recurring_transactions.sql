-- Recurring rules stay household-scoped and materialize transactions through
-- one locked RPC, so retries and concurrent clients cannot create duplicates.
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount > 0 and amount <= 1000000000000),
  note text,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count between 1 and 12),
  day_of_week integer,
  day_of_month integer,
  start_date date not null,
  next_due_date date not null,
  end_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_schedule_fields_check check (
    (
      frequency = 'weekly'
      and day_of_week between 0 and 6
      and day_of_month is null
    )
    or (
      frequency = 'monthly'
      and day_of_month between 1 and 31
      and day_of_week is null
    )
  ),
  constraint recurring_rules_date_range_check check (
    next_due_date >= start_date
    and (end_date is null or end_date >= start_date)
  )
);

create table if not exists public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  due_date date not null,
  transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rule_id, due_date),
  unique (transaction_id)
);

create index if not exists recurring_rules_household_due_idx
on public.recurring_rules (household_id, is_active, next_due_date, id);

create index if not exists recurring_occurrences_household_due_idx
on public.recurring_occurrences (household_id, due_date desc, id desc);

alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;

create policy "Household members can select recurring rules"
on public.recurring_rules
for select
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can insert recurring rules"
on public.recurring_rules
for insert
to authenticated
with check (
  household_id = public.current_user_household_id()
  and created_by = auth.uid()
  and exists (
    select 1
    from public.categories as recurring_category
    where recurring_category.id = recurring_rules.category_id
      and recurring_category.household_id = public.current_user_household_id()
      and recurring_category.type = recurring_rules.type
  )
  and exists (
    select 1
    from public.profiles as recurring_member
    where recurring_member.id = recurring_rules.user_id
      and recurring_member.household_id = public.current_user_household_id()
  )
);

create policy "Household members can update recurring rules"
on public.recurring_rules
for update
to authenticated
using (household_id = public.current_user_household_id())
with check (
  household_id = public.current_user_household_id()
  and exists (
    select 1
    from public.categories as recurring_category
    where recurring_category.id = recurring_rules.category_id
      and recurring_category.household_id = public.current_user_household_id()
      and recurring_category.type = recurring_rules.type
  )
  and exists (
    select 1
    from public.profiles as recurring_member
    where recurring_member.id = recurring_rules.user_id
      and recurring_member.household_id = public.current_user_household_id()
  )
);

create policy "Household members can delete recurring rules"
on public.recurring_rules
for delete
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can select recurring occurrences"
on public.recurring_occurrences
for select
to authenticated
using (household_id = public.current_user_household_id());

create or replace function public.materialize_due_recurring_transactions(
  p_rule_id uuid default null,
  p_max_occurrences integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_household_id uuid := public.current_user_household_id();
  vietnam_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  rule_row record;
  occurrence_id uuid;
  created_transaction_id uuid;
  generated_count integer := 0;
  existing_count integer := 0;
  remaining_due_count integer := 0;
  next_month_start date;
  next_month_end date;
begin
  if auth.uid() is null or current_household_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_max_occurrences < 1 or p_max_occurrences > 100 then
    raise exception using errcode = '22023', message = 'INVALID_OCCURRENCE_LIMIT';
  end if;

  for rule_row in
    select
      recurring_rule.*,
      recurring_category.name as category_name,
      recurring_category.type as category_type,
      recurring_member.household_id as member_household_id
    from public.recurring_rules as recurring_rule
    join public.categories as recurring_category
      on recurring_category.id = recurring_rule.category_id
    join public.profiles as recurring_member
      on recurring_member.id = recurring_rule.user_id
    where recurring_rule.household_id = current_household_id
      and recurring_rule.is_active
      and recurring_rule.next_due_date <= vietnam_today
      and (recurring_rule.end_date is null or recurring_rule.next_due_date <= recurring_rule.end_date)
      and (p_rule_id is null or recurring_rule.id = p_rule_id)
    order by recurring_rule.next_due_date, recurring_rule.id
    for update of recurring_rule
  loop
    if rule_row.category_type <> rule_row.type
       or rule_row.member_household_id <> current_household_id then
      raise exception using errcode = '22023', message = 'INVALID_RECURRING_REFERENCE';
    end if;

    while rule_row.next_due_date <= vietnam_today
      and (rule_row.end_date is null or rule_row.next_due_date <= rule_row.end_date)
      and generated_count + existing_count < p_max_occurrences
    loop
      occurrence_id := null;
      created_transaction_id := null;

      insert into public.recurring_occurrences (
        household_id,
        rule_id,
        due_date
      )
      values (
        current_household_id,
        rule_row.id,
        rule_row.next_due_date
      )
      on conflict (rule_id, due_date) do nothing
      returning id into occurrence_id;

      if occurrence_id is not null then
        insert into public.transactions (
          household_id,
          category_id,
          user_id,
          created_by,
          type,
          amount,
          title,
          note,
          transaction_date
        )
        values (
          current_household_id,
          rule_row.category_id,
          rule_row.user_id,
          auth.uid(),
          rule_row.type,
          rule_row.amount,
          rule_row.category_name,
          nullif(trim(rule_row.note), ''),
          rule_row.next_due_date::timestamp at time zone 'Asia/Ho_Chi_Minh'
        )
        returning id into created_transaction_id;

        update public.recurring_occurrences
        set transaction_id = created_transaction_id
        where id = occurrence_id;

        generated_count := generated_count + 1;
      else
        existing_count := existing_count + 1;
      end if;

      if rule_row.frequency = 'weekly' then
        rule_row.next_due_date := rule_row.next_due_date + (rule_row.interval_count * 7);
      else
        next_month_start := (
          date_trunc('month', rule_row.next_due_date)::date
          + make_interval(months => rule_row.interval_count)
        )::date;
        next_month_end := (next_month_start + interval '1 month - 1 day')::date;
        rule_row.next_due_date := least(
          next_month_start + (rule_row.day_of_month - 1),
          next_month_end
        );
      end if;

      update public.recurring_rules
      set next_due_date = rule_row.next_due_date,
          updated_at = now(),
          is_active = case
            when end_date is not null and rule_row.next_due_date > end_date then false
            else is_active
          end
      where id = rule_row.id;
    end loop;

    exit when generated_count + existing_count >= p_max_occurrences;
  end loop;

  select count(*)::integer
  into remaining_due_count
  from public.recurring_rules
  where household_id = current_household_id
    and is_active
    and next_due_date <= vietnam_today
    and (end_date is null or next_due_date <= end_date);

  return jsonb_build_object(
    'generatedCount', generated_count,
    'existingCount', existing_count,
    'remainingDueCount', remaining_due_count,
    'today', vietnam_today
  );
end;
$$;

revoke all on function public.materialize_due_recurring_transactions(uuid, integer)
from public, anon;
grant execute on function public.materialize_due_recurring_transactions(uuid, integer)
to authenticated;

comment on function public.materialize_due_recurring_transactions(uuid, integer) is
  'Creates due household transactions exactly once per recurring rule and due date, using Vietnam local dates.';

-- A departing member can no longer be selected for future transactions.
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

  update public.recurring_rules
  set is_active = false,
      updated_at = now()
  where household_id = current_profile.household_id
    and user_id = current_user_id;

  update public.profiles
  set household_id = null,
      role = 'user',
      updated_at = now()
  where id = current_user_id
  returning * into current_profile;

  return current_profile;
end;
$$;

-- Delete recurring definitions before their category/member references.
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

  delete from public.recurring_rules
  where household_id = current_household.id;

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
