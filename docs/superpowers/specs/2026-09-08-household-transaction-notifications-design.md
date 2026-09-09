# Thông báo khi thành viên household thêm giao dịch mới

Ngày viết: 08/09/2026.

## Bối cảnh

App hiện chưa có cơ chế thông báo giữa các thành viên household. Cơ chế
"nhắc" duy nhất đang có (`src/lib/pwa/recurring-reminder.ts` +
`RecurringReminderSettings`) chỉ là Notification API cục bộ — hiện khi PWA
đang mở trên máy đó, không gửi được giữa các người dùng, không hoạt động khi
app đã đóng. Docs của app đã ghi rõ giới hạn này khi làm tính năng nhắc lịch
định kỳ. Tính năng này cần **thật sự** gửi được thông báo tới các thành viên
khác kể cả khi họ không mở app — nghĩa là cần thêm Web Push thật, không chỉ
Notification API cục bộ.

## Mục tiêu

- Khi 1 thành viên **thêm mới** 1 giao dịch, **các thành viên khác** trong
  household (không phải người vừa thêm) nhận được thông báo qua 2 kênh:
  1. **Trong app**: chuông ở app shell cập nhật ngay (Realtime) khi đang mở
     app, giữ lại lịch sử ngắn khi mở app trở lại.
  2. **Web Push thật**: nhận được thông báo hệ điều hành kể cả khi đã đóng
     app/khóa màn hình, nếu đã cấp quyền.
- Không thông báo dồn dập ngày ra mắt tính năng (không hiện hàng loạt giao
  dịch cũ như "chưa đọc").

## Ngoài phạm vi (non-goals)

- Không áp dụng cho sửa/xóa giao dịch — chỉ **tạo mới**.
- Không gộp nhiều giao dịch liên tiếp của cùng 1 người thành 1 thông báo —
  mỗi giao dịch 1 dòng riêng (đã xác nhận với người dùng, có thể làm gộp sau
  nếu cần).
- Không làm màn hình "quản lý thiết bị đã đăng ký nhận thông báo" (xem/xóa
  từng subscription) — chỉ có nút bật, việc dọn subscription hỏng làm tự
  động ở phía server khi gửi thất bại.
- Không hỗ trợ tùy chỉnh loại giao dịch nào được thông báo (vd chỉ thông báo
  giao dịch lớn hơn X đồng) — thông báo cho mọi giao dịch mới.
- Không tự làm được bước **push migration lên Supabase production** —
  session hiện tại không có Supabase CLI/MCP đã xác thực; người triển khai
  cần tự chạy `supabase db push` hoặc dán SQL vào Supabase Studio.

## Luồng người dùng

**Bật thông báo** (gộp vào UI xin quyền đã có, chuyển vào trang Cá nhân thay
vì nằm trong trang Giao dịch định kỳ như hiện tại — vị trí cũ không còn hợp
lý khi cùng 1 quyền giờ mở khóa cả nhắc lịch định kỳ lẫn push giao dịch mới):
1. Trong trang Cá nhân, thẻ "Thông báo" mới, nút "Bật thông báo".
2. Bấm → `Notification.requestPermission()` (dùng lại logic đã có ở
   `requestRecurringReminderPermission`). Nếu được cấp quyền → tự động
   `PushManager.subscribe()` bằng VAPID public key → gửi subscription lên
   server lưu.
3. Nếu trình duyệt/thiết bị không hỗ trợ Push API (một số trường hợp Safari
   cũ, hoặc chưa cài PWA trên iOS) → vẫn cho phép bật Notification API cục
   bộ như cũ (nhắc lịch định kỳ khi mở app), chỉ báo rõ "Thiết bị này chưa hỗ
   trợ nhận thông báo khi đóng app".

**Khi có giao dịch mới:**
1. Server Action `createTransactionAction` ghi giao dịch thành công.
2. Sau khi trả kết quả cho người tạo (không làm họ phải chờ) — dùng
   `after()` của Next.js chạy nền: lấy danh sách subscription của các thành
   viên khác trong household, gửi push từng subscription.
3. Đồng thời, các client khác trong household đang mở app (nếu có) nhận sự
   kiện Realtime từ bảng `transactions` → chuông tự cập nhật ngay, không cần
   đợi push.

**Xem thông báo trong app:**
1. Chuông ở app shell (đổi từ Link thẳng sang "/recurring" thành nút mở
   popover) hiện số = (lịch định kỳ đến hạn) + (giao dịch mới chưa xem).
2. Mở popover: dòng tổng lịch định kỳ đến hạn (bấm vào → `/recurring`, giữ
   nguyên hành vi cũ) + danh sách tối đa 20 giao dịch mới nhất, mỗi dòng
   "**Tên** đã thêm khoản **chi/thu X đ** · Danh mục · X phút trước".
3. Mở popover = tự đánh dấu đã đọc (update cursor phía server). Danh sách
   đang hiện không biến mất ngay, nhưng lần load trang sau sẽ không còn tính
   là chưa đọc nữa.

## Kiến trúc & thư viện

- Thêm dependency `web-push` (+ `@types/web-push` dev) — thư viện Node.js
  chuẩn cho Web Push Protocol, không có phụ thuộc nền tảng/build script nặng
  như Tesseract.js.
- **VAPID**: tạo 1 lần bằng `npx web-push generate-vapid-keys`. Public key
  vào `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client cần để `subscribe()`), private
  key vào `VAPID_PRIVATE_KEY` (chỉ server, không bao giờ lộ ra client —
  cùng nguyên tắc với `service_role` key hiện có của app). Thêm biến
  `VAPID_SUBJECT` (giá trị dạng `mailto:...`, bắt buộc theo chuẩn VAPID để
  push service liên hệ khi có vấn đề).
- **2 bảng mới + 1 RPC mới** (chi tiết bên dưới) — theo đúng pattern
  RLS + SECURITY DEFINER RPC đã dùng xuyên suốt app.
- Gửi push chạy trong `after()` (API chính thức của Next.js, đã xác nhận
  hoạt động trong Server Actions qua docs) — không chặn phản hồi cho người
  submit form, không cần queue/cron riêng.
- Chuông trong app dùng Supabase Realtime Postgres Changes trên bảng
  `transactions` (INSERT), lọc `household_id` — **lần đầu app này dùng
  Realtime**, cần bật publication cho bảng `transactions` nếu chưa bật.

## Data model

### Migration mới: `supabase/migrations/20260908010000_household_notifications.sql`

```sql
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
```

Lưu ý: `auth` là tên cột hợp lệ trong ngữ cảnh bảng (không trùng schema
`auth` của Supabase vì đây là cột, không phải reference tới schema) nhưng để
tránh nhầm lẫn khi đọc SQL, RPC trả về đổi tên thành `auth_key` — code
TypeScript khi map kết quả RPC cần dùng đúng tên `auth_key` này.

Cần cập nhật `leave_current_household`/`delete_current_household` (đã có ở
migration cũ) để dọn `push_subscriptions`/`notification_reads` không? **Không
cần** — cả hai bảng đều có `on delete cascade` theo `user_id`/`profiles`;
khi rời/xóa household, profile KHÔNG bị xóa (chỉ set `household_id = null`),
nên các dòng push_subscriptions/notification_reads của người đó vẫn hợp lệ
(không thuộc household nào cũng không sao, RPC lọc theo household_id nên tự
động không match nữa).

### Cập nhật generated types

Sau khi push migration, chạy lại generate types như quy trình hiện có của
project (`docs/supabase-schema-audit.md`/`supabase/README.md` đã mô tả quy
trình này), cập nhật `src/types/database.generated.ts`.

## Thành phần code mới

### `src/lib/notifications/format.ts` (hàm pure, TDD)

```ts
export function formatTransactionNotificationText(
  actorName: string,
  type: "income" | "expense",
  amount: number,
  categoryName: string,
): { title: string; body: string }
```

Trả `title: "Có giao dịch mới"`, `body` dạng `"<actorName> đã thêm khoản
<chi/thu> <amount định dạng vi-VN> · <categoryName>"`. Tái dùng
`Intl.NumberFormat("vi-VN")` giống các chỗ format tiền khác trong app.

### `src/lib/notifications/data.ts`

```ts
export type NotificationTransactionItem = {
  id: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  userId: string;
  createdAt: string;
};

export async function getUnreadTransactionNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  householdId: string,
): Promise<{ unreadCount: number; items: NotificationTransactionItem[] }>
```

Logic: đọc `notification_reads` của `userId`. Không có dòng → insert dòng
mới với `last_read_at` mặc định (`now()`), trả `{ unreadCount: 0, items: [] }`
(không hồi tố giao dịch cũ). Có dòng → chạy 2 query song song trên
`transactions` với cùng điều kiện `household_id = householdId AND user_id
<> userId AND created_at > cursor.last_read_at`: (1) `select("id", { count:
"exact", head: true })` lấy `unreadCount` thật (không bị giới hạn), và (2)
query đầy đủ có `order` mới nhất trước + `limit(20)` lấy `items` để hiển
thị. Hai số này **cố ý tách riêng** — `unreadCount` dùng cho badge (đúng cả
khi có hơn 20 giao dịch chưa đọc), `items` chỉ để hiển thị danh sách rút
gọn. **Không join tên danh mục/thành viên ở đây** — trả thẳng
`category_id`/`user_id`, để component phía client tự tra cứu bằng danh sách
`categories`/`members` đã có sẵn trong AppShell (tránh trùng lặp logic join
với chỗ khác, và component cũng cần tra cứu y hệt cho các sự kiện Realtime
đến sau).

### `src/lib/notifications/action-state.ts` + Server Actions mới trong `src/app/(app)/profile/actions.ts` (thêm vào file đã có, không tạo route mới)

```ts
export async function markNotificationsReadAction(): Promise<void>
export async function savePushSubscriptionAction(
  _previousState: ProfileActionState,
  formData: FormData, // chứa endpoint, p256dh, auth dạng JSON string trong 1 field
): Promise<ProfileActionState>
```

`markNotificationsReadAction`: upsert `notification_reads` của user hiện tại
với `last_read_at = now()`. Gọi từ client khi mở popover chuông — không cần
trả state phức tạp, lỗi thì bỏ qua âm thầm (không chặn UI xem thông báo).

`savePushSubscriptionAction`: parse JSON từ form, validate có đủ
`endpoint`/`p256dh`/`auth`, upsert vào `push_subscriptions` với
`onConflict: "user_id,endpoint"`.

### `src/lib/notifications/push.ts` (server-only, không unit test — gọi web-push thật)

```ts
export async function sendTransactionPushNotifications(
  supabase: SupabaseClient<Database>,
  actorUserId: string,
  payload: { title: string; body: string; url: string },
): Promise<void>
```

Gọi `webpush.setVapidDetails(...)` (đọc từ env, throw sớm nếu thiếu biến —
lỗi cấu hình nên phát hiện ngay chứ không âm thầm bỏ qua), gọi RPC
`get_household_push_targets`, `Promise.all` gửi từng subscription bằng
`webpush.sendNotification(...)`. Bắt lỗi mỗi subscription riêng (1 thiết bị
lỗi không được làm hỏng gửi cho thiết bị khác): nếu `WebPushError` với
`statusCode` 404 hoặc 410 → xóa dòng `push_subscriptions` tương ứng; lỗi
khác → bỏ qua (không throw ra ngoài, không được làm hỏng luồng tạo giao
dịch chính vì đây là `after()` chạy sau khi đã trả response).

### `src/lib/notifications/push-client.ts` ("use client")

```ts
export async function subscribeToPushNotifications(
  vapidPublicKey: string,
): Promise<PushSubscription | null>
```

`navigator.serviceWorker.ready` → `pushManager.getSubscription()` (trả về
luôn nếu đã có, tránh subscribe trùng) → nếu chưa có, `pushManager.subscribe({
userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })`.
Trả `null` nếu trình duyệt không có `PushManager` (thay vì throw) để UI hiện
thông báo "chưa hỗ trợ" thay vì crash.

`urlBase64ToUint8Array` là hàm pure chuẩn (chuyển base64url string thành
`Uint8Array`) — viết kèm trong cùng file, có thể TDD với vài chuỗi mẫu.

### `src/components/app/notification-bell.tsx` (UI mới, thay thế Link chuông hiện tại trong `app-shell.tsx`)

Props: `recurringDueCount: number`, `initialUnreadCount: number`,
`initialItems: NotificationTransactionItem[]`, `categories: CategoryOption[]`,
`members: MemberOption[]`, `currentUserId: string`, `householdId: string`.
Popover theo đúng pattern đã có (`MonthPicker`, `MemberFilterMenu`): nút bấm
mở, đóng khi Escape/click ngoài. Badge = `recurringDueCount + unreadCount`
(state khởi tạo từ `initialUnreadCount`, **không** dùng `items.length` vì
danh sách hiển thị bị giới hạn 20 dòng còn badge cần đúng số thật). Mỗi sự
kiện Realtime nhận thêm vừa prepend vào `items` vừa `unreadCount + 1`. Bên
trong dùng `createBrowserSupabaseClient()` subscribe Realtime `transactions`
INSERT lọc `household_id`, bỏ qua sự kiện có `user_id === currentUserId`.
Mở popover → gọi `markNotificationsReadAction()` (fire-and-forget, không
chặn UI) và set `unreadCount` về 0 tại chỗ (client tự set ngay, không đợi
round-trip server, vì hành động này không thể fail theo cách người dùng cần
biết).

### Cập nhật file đã có

- `src/app/(app)/layout.tsx`: gọi thêm `getUnreadTransactionNotifications`
  song song với `getRecurringDueCount`/`getTransactionFormOptions` đã có
  (cùng 1 `Promise.all`), truyền `initialUnreadCount`/`initialItems`/
  `householdId` xuống `AppShell` → `NotificationBell`.
- `src/components/app/app-shell.tsx`: thay khối `<Link href="/recurring">`
  hiện tại bằng `<NotificationBell .../>`.
- `src/app/(app)/transactions/actions.ts` (`createTransactionAction`): sau
  insert thành công, `after(() => sendTransactionPushNotifications(...).catch(() => {}))`
  với payload từ `formatTransactionNotificationText(membership.profile.full_name
  || ..., references.category.type, validation.data.amount, references.category.name)`
  — tái dùng dữ liệu đã fetch sẵn trong action, không query thêm.
- `public/sw.js`: thêm `push` event handler (hiện notification từ payload
  JSON), tái dùng `notificationclick` handler đã có sẵn.
- **Di chuyển thẻ xin quyền thông báo từ trang Giao dịch định kỳ sang trang
  Cá nhân** (vị trí cũ không còn hợp lý khi cùng 1 quyền giờ mở khóa cả
  push giao dịch mới): xóa `src/components/recurring/recurring-reminder-settings.tsx`
  + file test của nó, bỏ import/usage khỏi
  `src/components/recurring/recurring-manager.tsx`; tạo mới
  `src/components/profile/notification-settings.tsx` (kèm test) trong
  `src/components/profile/profile-manager.tsx`, giữ nguyên logic
  `requestRecurringReminderPermission()`/hiển thị trạng thái quyền đã có,
  thêm bước gọi `subscribeToPushNotifications` ngay sau khi quyền được cấp.
  Component mới đọc `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` trực tiếp
  (biến `NEXT_PUBLIC_` được Next.js inline sẵn cho client component, không
  cần truyền qua props) để gọi `subscribeToPushNotifications(...)`, rồi gửi
  kết quả qua `savePushSubscriptionAction`.
- `.env.example` (hoặc file tương đương đang dùng để liệt kê biến môi
  trường của project): thêm 3 dòng mẫu cho
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, giá
  trị thật điền vào `.env.local` lúc triển khai (không commit giá trị
  thật).

## Trạng thái UI & xử lý lỗi

| Tình huống | Hành vi |
| --- | --- |
| Trình duyệt không hỗ trợ Notification/Push API | Nút "Bật thông báo" hiện disabled kèm giải thích ngắn |
| Người dùng từ chối quyền | Giữ trạng thái tắt, có thể bấm lại (trình duyệt sẽ tự nhớ nếu đã chặn hẳn, ngoài tầm kiểm soát của app) |
| `subscribeToPushNotifications` trả `null` (không hỗ trợ Push dù có Notification) | Vẫn bật được nhắc lịch định kỳ cục bộ như cũ, báo rõ sẽ không nhận được khi đóng app |
| Gửi push tới 1 subscription lỗi 404/410 | Xóa subscription đó, không ảnh hưởng các thiết bị khác |
| Gửi push lỗi khác (mạng, 5xx từ push service) | Bỏ qua, không retry (không đủ quan trọng để cần queue retry cho v1) |
| Thiếu biến môi trường VAPID | Throw ngay trong `sendTransactionPushNotifications` (lỗi cấu hình, không phải lỗi người dùng) nhưng vẫn được `after()`/catch bọc ngoài nuốt lại — giao dịch vẫn tạo thành công, chỉ không gửi được push; lỗi này cần thấy trong log server, không được làm hỏng luồng tạo giao dịch |
| Realtime mất kết nối tạm thời | Supabase client tự reconnect; khi quay lại app, SSR load lại cursor nên vẫn đúng, không phụ thuộc hoàn toàn vào Realtime để có dữ liệu đúng |

## Testing

- `formatTransactionNotificationText`: TDD, vài case income/expense, số tiền
  có/không phần thập phân.
- `urlBase64ToUint8Array`: TDD, vài chuỗi base64url mẫu có độ dài lẻ (cần
  padding) và chẵn.
- `getUnreadTransactionNotifications`/`sendTransactionPushNotifications`:
  không unit test (gọi Supabase/web-push thật), verify qua browser giống
  quy ước hiện có của các hàm `data.ts`/wrapper gọi API ngoài khác trong
  repo.
- `NotificationBell`: test component kiểu `MemberFilterMenu`/
  `ReceiptScanButton` đã làm — mock Realtime subscription (mock
  `createBrowserSupabaseClient`), mock `markNotificationsReadAction`, assert
  badge count đúng, assert item mới từ Realtime được prepend và bỏ qua đúng
  khi `user_id` là chính mình.
- `createTransactionAction`: test hiện có (`actions.test.ts`) cần thêm mock
  cho `sendTransactionPushNotifications`/`after` để không thực sự gọi
  web-push trong test — kiểm tra action vẫn trả `success` bình thường ngay
  cả khi hàm gửi push throw lỗi (đã bọc catch).

## Rủi ro & giới hạn đã biết

- **iOS Safari**: chỉ nhận được Web Push khi app đã "Thêm vào màn hình
  chính" (cài như PWA); mở bằng tab Safari thường sẽ không nhận được push
  dù đã cấp quyền — cần nói rõ trong UI hoặc ít nhất trong tài liệu bàn giao.
- **Payload size**: giới hạn thực tế khoảng ~4KB sau mã hoá; payload của
  tính năng này (title + body ngắn + url) chỉ vài trăm byte, không có nguy
  cơ vượt giới hạn.
- **Không có retry/queue** cho push gửi lỗi tạm thời (mạng, 5xx) — chấp
  nhận được cho v1 vì kênh Realtime trong app vẫn đảm bảo người dùng thấy
  thông báo khi họ mở app, dù không nhận được push.
- **Household lớn**: gửi `Promise.all` song song cho mọi subscription —
  chấp nhận được với quy mô hộ gia đình (vài người, vài thiết bị), không
  cần hàng đợi cho v1.
- **VAPID subject email**: cần người triển khai tự điền `VAPID_SUBJECT`
  thật khi deploy (không hardcode email cá nhân vào code).

## Xác minh khi triển khai

- `pnpm check` + `pnpm build` sạch, giống quy trình các tính năng trước.
- Migration cần được người có quyền chạy `supabase db push` (session hiện
  tại không có Supabase CLI/MCP đã xác thực) — không tự động hoá được bước
  này, phải bàn giao lại cho người dùng hoặc phiên có quyền truy cập.
- Verify UI thật trong browser vẫn vướng constraint đã nêu ở các tính năng
  trước: `.env.local` trỏ Supabase production, cần tài khoản test hoặc
  người dùng tự thử — với tính năng này còn cần **2 tài khoản/2 thiết bị**
  để thử được luồng "A thêm giao dịch, B nhận thông báo", khó verify hơn
  các tính năng trước.
