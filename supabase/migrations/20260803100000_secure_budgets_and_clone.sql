-- Budgets belong to a household. The old policies were granted to public,
-- which made the table depend on auth.uid() alone for access control.
drop policy if exists "Users can delete household budgets" on public.budgets;
drop policy if exists "Users can insert household budgets" on public.budgets;
drop policy if exists "Users can update household budgets" on public.budgets;
drop policy if exists "Users can view household budgets" on public.budgets;
drop policy if exists "Household members can select budgets" on public.budgets;
drop policy if exists "Household members can insert budgets" on public.budgets;
drop policy if exists "Household members can update budgets" on public.budgets;
drop policy if exists "Household members can delete budgets" on public.budgets;

create policy "Household members can select budgets"
on public.budgets
for select
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can insert budgets"
on public.budgets
for insert
to authenticated
with check (
  household_id = public.current_user_household_id()
  and exists (
    select 1
    from public.categories as budget_category
    where budget_category.id = budgets.category_id
      and budget_category.household_id = public.current_user_household_id()
      and budget_category.type = 'expense'
  )
);

create policy "Household members can update budgets"
on public.budgets
for update
to authenticated
using (household_id = public.current_user_household_id())
with check (
  household_id = public.current_user_household_id()
  and exists (
    select 1
    from public.categories as budget_category
    where budget_category.id = budgets.category_id
      and budget_category.household_id = public.current_user_household_id()
      and budget_category.type = 'expense'
  )
);

create policy "Household members can delete budgets"
on public.budgets
for delete
to authenticated
using (household_id = public.current_user_household_id());

create index if not exists budgets_household_month_order_idx
on public.budgets (household_id, year, month, display_order, category_id);

create or replace function public.clone_budget_month(
  p_source_month integer,
  p_source_year integer,
  p_target_month integer,
  p_target_year integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_household_id uuid := public.current_user_household_id();
  inserted_count integer := 0;
begin
  if auth.uid() is null or current_household_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if p_source_month < 1 or p_source_month > 12
     or p_target_month < 1 or p_target_month > 12
     or p_source_year < 2000 or p_target_year < 2000 then
    raise exception using errcode = '22023', message = 'INVALID_BUDGET_MONTH';
  end if;

  if (p_target_year, p_target_month) <= (p_source_year, p_source_month) then
    raise exception using errcode = '22023', message = 'TARGET_MONTH_MUST_BE_AFTER_SOURCE';
  end if;

  -- A non-empty target is treated as already cloned. This makes retries safe
  -- after a network timeout and never overwrites a user's target month.
  if exists (
    select 1
    from public.budgets
    where household_id = current_household_id
      and month = p_target_month
      and year = p_target_year
  ) then
    return 0;
  end if;

  insert into public.budgets (
    household_id,
    category_id,
    month,
    year,
    amount,
    display_order,
    created_by,
    updated_at
  )
  select
    current_household_id,
    source.category_id,
    p_target_month,
    p_target_year,
    source.amount,
    source.display_order,
    auth.uid(),
    now()
  from public.budgets as source
  where source.household_id = current_household_id
    and source.month = p_source_month
    and source.year = p_source_year
  on conflict (household_id, category_id, month, year) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.reorder_budgets(
  p_ordered_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_household_id uuid := public.current_user_household_id();
  updated_count integer := 0;
begin
  if auth.uid() is null or current_household_id is null then
    raise exception using errcode = '42501', message = 'AUTH_REQUIRED';
  end if;

  if coalesce(cardinality(p_ordered_ids), 0) = 0 then
    return 0;
  end if;

  with requested as (
    select budget_id, (ordinality - 1)::integer as next_order
    from unnest(p_ordered_ids) with ordinality as row_data(budget_id, ordinality)
  )
  update public.budgets as budget
  set display_order = requested.next_order,
      updated_at = now()
  from requested
  where budget.id = requested.budget_id
    and budget.household_id = current_household_id;

  get diagnostics updated_count = row_count;
  if updated_count <> cardinality(p_ordered_ids) then
    raise exception using errcode = '42501', message = 'BUDGET_ORDER_NOT_ALLOWED';
  end if;

  return updated_count;
end;
$$;

revoke all on function public.clone_budget_month(integer, integer, integer, integer) from public, anon;
revoke all on function public.reorder_budgets(uuid[]) from public, anon;
grant execute on function public.clone_budget_month(integer, integer, integer, integer) to authenticated;
grant execute on function public.reorder_budgets(uuid[]) to authenticated;

comment on function public.clone_budget_month(integer, integer, integer, integer) is
  'Idempotently clones household budgets from an earlier month into an empty target month.';

comment on function public.reorder_budgets(uuid[]) is
  'Atomically updates display order for the current household budget rows.';
