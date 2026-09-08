-- Cursor "đã xem thông báo tới đâu" của từng người dùng — không lưu từng
-- thông báo riêng, suy thẳng từ bảng transactions đã có.
create table public.notification_reads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now()
);

alter table public.notification_reads enable row level security;

create policy "Users manage their own notification cursor"
on public.notification_reads
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Mỗi thiết bị đã đăng ký nhận push là 1 dòng.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
on public.push_subscriptions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Cho phép server lấy subscription của CÁC THÀNH VIÊN KHÁC trong household
-- để gửi push, mà không cần mở RLS cho phép đọc chéo giữa các user.
create or replace function public.get_household_push_targets(
  p_exclude_user_id uuid
)
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
    and ps.user_id <> p_exclude_user_id;
$$;

revoke all on function public.get_household_push_targets(uuid) from public, anon;
grant execute on function public.get_household_push_targets(uuid) to authenticated;

comment on function public.get_household_push_targets(uuid) is
  'Returns push subscriptions of other members in the caller''s household, for server-side push sending.';

-- Bật Realtime cho transactions (INSERT) nếu chưa có trong publication.
alter publication supabase_realtime add table public.transactions;
