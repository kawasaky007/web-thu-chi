-- Cursor "đã xem thông báo tới đâu" của từng người dùng — không lưu từng
-- thông báo riêng, suy thẳng từ bảng transactions đã có.
create table if not exists public.notification_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;

drop policy if exists "Users manage their own notification cursor" on public.notification_reads;

create policy "Users manage their own notification cursor"
on public.notification_reads
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Mỗi thiết bị đã đăng ký nhận push là 1 dòng.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;

create policy "Users manage their own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Cho phép server lấy subscription của CÁC THÀNH VIÊN KHÁC trong household
-- để gửi push, mà không cần mở RLS cho phép đọc chéo giữa các user.
-- Dùng thẳng auth.uid() thay vì nhận tham số từ client để không ai gọi được
-- với user id tuỳ ý.
create or replace function public.get_household_push_targets()
returns table (subscription_id uuid, endpoint text, p256dh text, auth_key text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ps.id, ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  join public.profiles p on p.id = ps.user_id
  where p.household_id = public.current_user_household_id()
    and ps.user_id <> auth.uid();
$$;

revoke all on function public.get_household_push_targets() from public, anon;
grant execute on function public.get_household_push_targets() to authenticated;

comment on function public.get_household_push_targets() is
  'Returns push subscriptions of other members in the caller''s household, for server-side push sending.';

-- Dọn 1 subscription đã hỏng (404/410) sau khi gửi thất bại — subscription
-- thuộc về thành viên KHÁC trong household, không phải người gọi, nên cần
-- security definer giống RPC ở trên.
create or replace function public.delete_household_push_subscription(
  p_subscription_id uuid
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions ps
  using public.profiles p
  where ps.id = p_subscription_id
    and p.id = ps.user_id
    and p.household_id = public.current_user_household_id();
$$;

revoke all on function public.delete_household_push_subscription(uuid) from public, anon;
grant execute on function public.delete_household_push_subscription(uuid) to authenticated;

comment on function public.delete_household_push_subscription(uuid) is
  'Deletes a push subscription belonging to any member of the caller''s household, for server-side dead-subscription cleanup after a 404/410 send failure.';

-- Bật Realtime cho transactions (INSERT) nếu chưa có trong publication.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end;
$$;
