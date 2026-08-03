-- Dashboard receives aggregates and a small recent slice instead of loading the
-- household transaction history into the browser.
create or replace function public.get_dashboard_report(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with scoped as (
  select
    t.id,
    t.amount,
    t.category_id,
    t.type,
    t.title,
    t.note,
    t.transaction_date,
    t.created_at,
    t.user_id,
    coalesce(c.name, t.title, 'Danh mục đã xóa') as category_name,
    coalesce(c.color, case when t.type = 'income' then '#0F8B6F' else '#C2410C' end) as category_color,
    coalesce(c.icon, 'other') as category_icon,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.email), ''), 'Thành viên') as member_name
  from public.transactions as t
  left join public.categories as c
    on c.id = t.category_id
   and c.household_id = t.household_id
  left join public.profiles as p
    on p.id = t.user_id
   and p.household_id = t.household_id
  where t.household_id = public.current_user_household_id()
    and t.transaction_date >= p_start
    and t.transaction_date < p_end
),
summary as (
  select
    count(*)::integer as count,
    coalesce(sum(amount) filter (where type = 'income'), 0)::numeric as income,
    coalesce(sum(amount) filter (where type = 'expense'), 0)::numeric as expense
  from scoped
),
category_breakdown as (
  select
    type,
    category_id,
    category_name,
    category_color,
    category_icon,
    count(*)::integer as count,
    sum(amount)::numeric as amount
  from scoped
  where type in ('income', 'expense')
  group by type, category_id, category_name, category_color, category_icon
  order by amount desc
),
member_totals as (
  select
    user_id,
    member_name,
    type,
    count(*)::integer as count,
    sum(amount)::numeric as amount
  from scoped
  where type in ('income', 'expense')
  group by user_id, member_name, type
  order by amount desc
),
recent_transactions as (
  select
    id,
    amount,
    category_id,
    category_name,
    category_color,
    category_icon,
    type,
    title,
    note,
    transaction_date,
    created_at,
    user_id,
    member_name
  from scoped
  where type in ('income', 'expense')
  order by transaction_date desc, created_at desc nulls last, id desc
  limit 5
)
select jsonb_build_object(
  'summary', (select to_jsonb(summary) from summary),
  'category_breakdown', coalesce(
    (select jsonb_agg(to_jsonb(category_breakdown)) from category_breakdown),
    '[]'::jsonb
  ),
  'member_totals', coalesce(
    (select jsonb_agg(to_jsonb(member_totals)) from member_totals),
    '[]'::jsonb
  ),
  'recent_transactions', coalesce(
    (select jsonb_agg(to_jsonb(recent_transactions)) from recent_transactions),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.get_dashboard_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_dashboard_report(timestamptz, timestamptz) to authenticated;

comment on function public.get_dashboard_report(timestamptz, timestamptz) is
  'Returns household-scoped dashboard aggregates and five recent transactions for a date range.';
