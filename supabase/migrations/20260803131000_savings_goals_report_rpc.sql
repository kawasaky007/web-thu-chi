create or replace function public.get_savings_goals_report()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'today', (now() at time zone 'Asia/Ho_Chi_Minh')::date,
    'goals', coalesce((
      select jsonb_agg(goal_report.payload)
      from (
        select jsonb_build_object(
          'id', savings_goal.id,
          'name', savings_goal.name,
          'kind', savings_goal.kind,
          'targetAmount', savings_goal.target_amount,
          'targetDate', savings_goal.target_date,
          'color', savings_goal.color,
          'icon', savings_goal.icon,
          'status', savings_goal.status,
          'createdAt', savings_goal.created_at,
          'currentAmount', coalesce(goal_balance.current_amount, 0),
          'entryCount', coalesce(goal_balance.entry_count, 0),
          'recentEntries', coalesce((
            select jsonb_agg(recent_entry.payload)
            from (
              select jsonb_build_object(
                'id', goal_entry.id,
                'entryType', goal_entry.entry_type,
                'amount', goal_entry.amount,
                'note', goal_entry.note,
                'entryDate', goal_entry.entry_date,
                'createdAt', goal_entry.created_at,
                'userId', goal_entry.user_id,
                'memberName', coalesce(
                  nullif(trim(goal_member.full_name), ''),
                  nullif(trim(goal_member.email), ''),
                  'Thành viên'
                )
              ) as payload
              from public.savings_goal_entries as goal_entry
              left join public.profiles as goal_member
                on goal_member.id = goal_entry.user_id
              where goal_entry.goal_id = savings_goal.id
              order by goal_entry.entry_date desc, goal_entry.created_at desc, goal_entry.id desc
              limit 5
            ) as recent_entry
          ), '[]'::jsonb)
        ) as payload
        from public.savings_goals as savings_goal
        left join lateral (
          select
            coalesce(sum(
              case when entry_type = 'deposit' then amount else -amount end
            ), 0) as current_amount,
            count(*)::integer as entry_count
          from public.savings_goal_entries
          where goal_id = savings_goal.id
        ) as goal_balance on true
        where savings_goal.household_id = public.current_user_household_id()
        order by
          case savings_goal.status
            when 'active' then 0
            when 'paused' then 1
            when 'completed' then 2
            else 3
          end,
          savings_goal.target_date nulls last,
          savings_goal.created_at desc,
          savings_goal.id
      ) as goal_report
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_savings_goals_report() from public, anon;
grant execute on function public.get_savings_goals_report() to authenticated;

comment on function public.get_savings_goals_report() is
  'Returns household savings goal balances and five recent immutable ledger entries per goal.';
