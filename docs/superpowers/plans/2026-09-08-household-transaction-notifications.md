# Thông báo giao dịch mới trong household — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi một thành viên household thêm giao dịch mới, các thành viên khác nhận được thông báo qua chuông trong app (Realtime, live) và qua Web Push thật (kể cả khi đã đóng app), mỗi giao dịch một dòng, không gộp.

**Architecture:** 2 bảng Postgres mới (`notification_reads` cursor, `push_subscriptions` thiết bị) + 1 RPC SECURITY DEFINER (`get_household_push_targets`) để server đọc subscription chéo giữa các thành viên. Gửi push chạy trong `after()` của `createTransactionAction`, không chặn phản hồi. Chuông app-shell dùng Supabase Realtime Postgres Changes trên `transactions` (INSERT) để cập nhật ngay khi đang mở app; badge/danh sách suy trực tiếp từ bảng `transactions` (không lưu bản ghi thông báo riêng).

**Tech Stack:** Next.js 16 App Router (Server Actions, `after()`), React 19, Supabase (Postgres, RLS, RPC, Realtime), `web-push` (Node), Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-08-household-transaction-notifications-design.md](../specs/2026-09-08-household-transaction-notifications-design.md)

## Global Constraints

- Chỉ **tạo mới** giao dịch mới kích hoạt thông báo — không áp dụng cho sửa/xóa.
- **Không gộp** nhiều giao dịch liên tiếp — mỗi giao dịch một dòng riêng trong danh sách và trong tính `unreadCount`.
- Gửi push **không bao giờ** được làm hỏng hoặc làm chậm phản hồi của `createTransactionAction` — luôn chạy trong `after()`, luôn có `.catch()` nuốt lỗi ở điểm gọi.
- Biến môi trường bắt buộc cho push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (dạng `mailto:...`).
- iOS Safari chỉ nhận Web Push khi app đã "Thêm vào màn hình chính" (cài PWA); tab Safari thường sẽ không nhận được. Ghi rõ trong UI/copy liên quan, không cần code riêng để phát hiện việc này.
- Theo đúng convention hiện có của repo: các hàm gọi Supabase trực tiếp trong `*/data.ts` và các wrapper gọi thư viện ngoài (`web-push`) **không có unit test** — chỉ các hàm pure (parsing, formatting, tính toán) mới TDD. Đã xác nhận bằng cách rà toàn bộ `src/lib/**/*.test.ts` hiện có trước khi viết plan này — không file `data.ts` nào có test cho hàm gọi Supabase.
- Migration **không tự chạy được** trong phiên làm việc này (chưa có Supabase CLI/MCP đã xác thực) — Task 1 chỉ tạo file migration + hand-author kiểu TypeScript tương ứng; áp dụng migration thật lên Supabase là việc người dùng làm sau khi plan hoàn tất.
- `pnpm` chạy trực tiếp được trong môi trường này (đã xác minh) — dùng thẳng `pnpm test`/`pnpm typecheck`/`pnpm lint`/`pnpm check`, không cần vòng qua `node_modules/.bin/`.

---

## Task 1: Migration SQL và kiểu TypeScript tương ứng

**Files:**
- Create: `supabase/migrations/20260908010000_household_notifications.sql`
- Modify: `src/types/database.generated.ts`

**Interfaces:**
- Produces: bảng `notification_reads` (`user_id` PK, `last_read_at`), bảng `push_subscriptions` (`id`, `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`, unique `(user_id, endpoint)`), RPC `get_household_push_targets(p_exclude_user_id uuid) returns table(subscription_id, endpoint, p256dh, auth_key)`. Mọi task sau đều gọi `supabase.from("notification_reads")`, `supabase.from("push_subscriptions")`, `supabase.rpc("get_household_push_targets", ...)` và cần các kiểu này tồn tại để `pnpm typecheck` chạy được.

Không có unit test cho bản thân SQL/kiểu — được xác minh gián tiếp khi Task 4-6 dùng các kiểu này qua `pnpm typecheck`.

- [ ] **Step 1: Tạo file migration**

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

- [ ] **Step 2: Thêm 2 bảng mới vào `database.generated.ts` (mục `Tables`, đúng thứ tự alphabet)**

Tìm khối kết thúc bảng `households` (ngay trước `profiles: {`):

```ts
        Update: {
          created_at?: string | null
          currency_code?: string
          description?: string | null
          id?: string
          invite_code?: string
          monthly_budget?: number | null
          name?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
```

Chèn `notification_reads` ngay trước `profiles: {`:

```ts
        Update: {
          created_at?: string | null
          currency_code?: string
          description?: string | null
          id?: string
          invite_code?: string
          monthly_budget?: number | null
          name?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notification_reads: {
        Row: {
          last_read_at: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
```

Tìm khối kết thúc bảng `profiles` (ngay trước `recurring_occurrences: {`):

```ts
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_occurrences: {
```

Chèn `push_subscriptions` ngay trước `recurring_occurrences: {`:

```ts
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_occurrences: {
```

- [ ] **Step 3: Thêm RPC mới vào mục `Functions` (đúng thứ tự alphabet)**

Tìm khối:

```ts
      get_dashboard_report: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_savings_goals_report: { Args: never; Returns: Json }
```

Chèn `get_household_push_targets` ở giữa:

```ts
      get_dashboard_report: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      get_household_push_targets: {
        Args: { p_exclude_user_id: string }
        Returns: {
          auth_key: string
          endpoint: string
          p256dh: string
          subscription_id: string
        }[]
      }
      get_savings_goals_report: { Args: never; Returns: Json }
```

- [ ] **Step 4: Xác minh typecheck vẫn sạch (chưa có code nào dùng kiểu mới nên chỉ cần không vỡ cú pháp)**

Run: `pnpm typecheck`
Expected: PASS, không lỗi.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260908010000_household_notifications.sql src/types/database.generated.ts
git commit -m "feat: add notification_reads/push_subscriptions tables and push target RPC"
```

---

## Task 2: `formatTransactionNotificationText` (pure, TDD)

**Files:**
- Create: `src/lib/notifications/format.ts`
- Test: `src/lib/notifications/format.test.ts`

**Interfaces:**
- Produces: `formatTransactionNotificationText(actorName: string, type: "income" | "expense", amount: number, categoryName: string): { title: string; body: string }` — dùng bởi Task 9 (`createTransactionAction`) để tạo nội dung push, và tham chiếu logic hiển thị giống Task 7 (`NotificationBell`) dùng cho dòng trong app (không import trực tiếp, chỉ dùng chung cách format số tiền).

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, it } from "vitest";

import { formatTransactionNotificationText } from "./format";

describe("formatTransactionNotificationText", () => {
  it("định dạng khoản chi với số tiền chẵn", () => {
    expect(formatTransactionNotificationText("An", "expense", 45000, "Ăn uống")).toEqual({
      title: "Có giao dịch mới",
      body: "An đã thêm khoản chi 45.000 đ · Ăn uống",
    });
  });

  it("định dạng khoản thu và làm tròn số tiền có phần thập phân", () => {
    expect(formatTransactionNotificationText("Bình", "income", 1000000.4, "Lương").body).toBe(
      "Bình đã thêm khoản thu 1.000.000 đ · Lương",
    );
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận lỗi vì chưa có file nguồn**

Run: `pnpm test -- --run src/lib/notifications/format.test.ts`
Expected: FAIL — "Failed to resolve import" hoặc "Cannot find module './format'".

- [ ] **Step 3: Viết implementation**

```ts
export function formatTransactionNotificationText(
  actorName: string,
  type: "income" | "expense",
  amount: number,
  categoryName: string,
): { title: string; body: string } {
  const amountLabel = new Intl.NumberFormat("vi-VN").format(Math.round(amount));
  const typeLabel = type === "income" ? "thu" : "chi";
  return {
    title: "Có giao dịch mới",
    body: `${actorName} đã thêm khoản ${typeLabel} ${amountLabel} đ · ${categoryName}`,
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `pnpm test -- --run src/lib/notifications/format.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/format.ts src/lib/notifications/format.test.ts
git commit -m "feat: add pure formatter for transaction push/notification text"
```

---

## Task 3: `urlBase64ToUint8Array` + `subscribeToPushNotifications`

**Files:**
- Create: `src/lib/notifications/push-client.ts`
- Test: `src/lib/notifications/push-client.test.ts`

**Interfaces:**
- Produces: `urlBase64ToUint8Array(base64String: string): Uint8Array` (pure, TDD), `subscribeToPushNotifications(vapidPublicKey: string): Promise<PushSubscription | null>` (browser-only, không unit test — gọi API trình duyệt thật). Dùng bởi Task 10 (`NotificationSettings`).

Chỉ `urlBase64ToUint8Array` có TDD; `subscribeToPushNotifications` viết trực tiếp không qua RED/GREEN (gọi `navigator.serviceWorker`/`PushManager` thật, không mock được có ý nghĩa trong unit test — khớp với cách `recognizeReceiptImage` được viết ở tính năng quét hóa đơn trước đó).

- [ ] **Step 1: Viết test thất bại cho `urlBase64ToUint8Array`**

```ts
import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array } from "./push-client";

describe("urlBase64ToUint8Array", () => {
  it("giải mã chuỗi base64url cần thêm padding", () => {
    expect(Array.from(urlBase64ToUint8Array("QQ"))).toEqual([65]);
  });

  it("giải mã chuỗi base64url có ký tự thay thế -/_ và không cần padding", () => {
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận lỗi vì chưa có file nguồn**

Run: `pnpm test -- --run src/lib/notifications/push-client.test.ts`
Expected: FAIL — không tìm thấy module `./push-client`.

- [ ] **Step 3: Viết implementation đầy đủ (cả hàm pure và hàm subscribe)**

```ts
"use client";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications(
  vapidPublicKey: string,
): Promise<PushSubscription | null> {
  if (
    typeof window === "undefined"
    || !("serviceWorker" in navigator)
    || !("PushManager" in window)
  ) return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `pnpm test -- --run src/lib/notifications/push-client.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/push-client.ts src/lib/notifications/push-client.test.ts
git commit -m "feat: add browser push subscription helper"
```

---

## Task 4: `getUnreadTransactionNotifications`

**Files:**
- Create: `src/lib/notifications/data.ts`

**Interfaces:**
- Consumes: bảng `notification_reads`/`transactions` từ Task 1; `TransactionType` từ `@/lib/transactions/data`.
- Produces: `type NotificationTransactionItem = { id: string; type: TransactionType; amount: number; categoryId: string | null; userId: string; createdAt: string }`, `getUnreadTransactionNotifications(supabase, userId: string, householdId: string): Promise<{ unreadCount: number; items: NotificationTransactionItem[] }>`. Dùng bởi Task 7 (props kiểu `NotificationTransactionItem`), Task 8 (gọi trong layout).

Không unit test (gọi Supabase thật, khớp convention đã xác nhận ở Global Constraints).

- [ ] **Step 1: Viết implementation**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { TransactionType } from "@/lib/transactions/data";

export type NotificationTransactionItem = {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string | null;
  userId: string;
  createdAt: string;
};

export async function getUnreadTransactionNotifications(
  supabase: SupabaseClient<Database>,
  userId: string,
  householdId: string,
): Promise<{ unreadCount: number; items: NotificationTransactionItem[] }> {
  const { data: cursor, error: cursorError } = await supabase
    .from("notification_reads")
    .select("last_read_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (cursorError) throw cursorError;

  if (!cursor) {
    const { error: insertError } = await supabase
      .from("notification_reads")
      .insert({ user_id: userId });
    // 23505 = hai request đồng thời cùng tạo cursor lần đầu, bỏ qua vì kết quả tương đương.
    if (insertError && insertError.code !== "23505") throw insertError;
    return { unreadCount: 0, items: [] };
  }

  const [countResult, itemsResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .neq("user_id", userId)
      .gt("created_at", cursor.last_read_at),
    supabase
      .from("transactions")
      .select("id, type, amount, category_id, user_id, created_at")
      .eq("household_id", householdId)
      .neq("user_id", userId)
      .gt("created_at", cursor.last_read_at)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (countResult.error) throw countResult.error;
  if (itemsResult.error) throw itemsResult.error;

  const items = itemsResult.data.flatMap((row) => {
    if (row.type !== "income" && row.type !== "expense") return [];
    if (!row.created_at) return [];
    return [{
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      categoryId: row.category_id,
      userId: row.user_id ?? "",
      createdAt: row.created_at,
    } satisfies NotificationTransactionItem];
  });

  return { unreadCount: countResult.count ?? 0, items };
}
```

- [ ] **Step 2: Xác nhận typecheck sạch**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/data.ts
git commit -m "feat: add unread transaction notifications query"
```

---

## Task 5: `web-push` dependency + `sendTransactionPushNotifications`

**Files:**
- Create: `src/lib/notifications/push.ts`
- Modify: `package.json` (qua `pnpm add`)
- Modify: `.env.example`

**Interfaces:**
- Consumes: RPC `get_household_push_targets` từ Task 1.
- Produces: `sendTransactionPushNotifications(supabase, actorUserId: string, payload: { title: string; body: string; url: string }): Promise<void>`. Dùng bởi Task 9 (`createTransactionAction`).

Không unit test (gọi `web-push` thật, khớp convention). `web-push` không có script `postinstall` (đã kiểm tra qua `npm view web-push scripts` — không có `install`/`postinstall`), nên không gặp lại vấn đề pnpm-workspace `allowBuilds` từng gặp với `tesseract.js`.

- [ ] **Step 1: Cài dependency**

```bash
pnpm add web-push
```

```bash
pnpm add -D @types/web-push
```

- [ ] **Step 2: Viết implementation**

```ts
import webpush, { WebPushError } from "web-push";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function sendTransactionPushNotifications(
  supabase: SupabaseClient<Database>,
  actorUserId: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  configureWebPush();

  const { data: targets, error } = await supabase.rpc("get_household_push_targets", {
    p_exclude_user_id: actorUserId,
  });
  if (error) throw error;
  if (!targets || targets.length === 0) return;

  const serializedPayload = JSON.stringify(payload);
  await Promise.all(targets.map(async (target) => {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth_key } },
        serializedPayload,
      );
    } catch (sendError) {
      if (sendError instanceof WebPushError && (sendError.statusCode === 404 || sendError.statusCode === 410)) {
        await supabase.from("push_subscriptions").delete().eq("id", target.subscription_id);
      }
      // Một thiết bị gửi lỗi (mạng, 5xx, ...) không được làm hỏng các thiết bị khác.
    }
  }));
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  const missing = [
    !publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !privateKey && "VAPID_PRIVATE_KEY",
    !subject && "VAPID_SUBJECT",
  ].filter((value): value is string => Boolean(value));
  if (missing.length > 0) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(", ")}`);
  }
  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
}
```

- [ ] **Step 3: Cập nhật `.env.example`**

File hiện tại:

```
# Public Supabase values are safe to expose, but access control must use RLS.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Nội dung mới:

```
# Public Supabase values are safe to expose, but access control must use RLS.
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Web Push (VAPID) — generate once with `npx web-push generate-vapid-keys`.
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:you@example.com
```

- [ ] **Step 4: Xác nhận typecheck sạch**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/notifications/push.ts .env.example
git commit -m "feat: send web push notifications to other household members"
```

---

## Task 6: Server Actions — đánh dấu đã đọc + lưu push subscription

**Files:**
- Modify: `src/app/(app)/profile/actions.ts`

**Interfaces:**
- Consumes: bảng `notification_reads`/`push_subscriptions` từ Task 1; `getProfileContext()`/`ProfileActionState`/`readProfileFormString`/`mapProfileError` đã có sẵn trong file.
- Produces: `markNotificationsReadAction(): Promise<void>`, `savePushSubscriptionAction(previousState: ProfileActionState, formData: FormData): Promise<ProfileActionState>` (form field `"subscription"` chứa JSON của `PushSubscription.toJSON()`). Dùng bởi Task 7 (`markNotificationsReadAction`) và Task 10 (`savePushSubscriptionAction`).

Không test mới cho Server Actions này (khớp convention hiện có của `profile/actions.ts` — file này chưa có test, các action khác trong cùng file cũng không có unit test riêng, được verify qua UI thật).

- [ ] **Step 1: Thêm 2 action mới vào cuối các action hiện có (sau `deleteHouseholdAction`, trước `getProfileContext`)**

Tìm vị trí:

```ts
  const { error } = await context.supabase.rpc("delete_current_household", { confirmation_name: confirmation });
  if (error) return mapProfileError(error);
  revalidateProfilePaths();
  return { status: "success", message: "Đã xóa household và dữ liệu tài chính chung." };
}

async function getProfileContext() {
```

Chèn 2 action mới ở giữa:

```ts
  const { error } = await context.supabase.rpc("delete_current_household", { confirmation_name: confirmation });
  if (error) return mapProfileError(error);
  revalidateProfilePaths();
  return { status: "success", message: "Đã xóa household và dữ liệu tài chính chung." };
}

export async function markNotificationsReadAction(): Promise<void> {
  const context = await getProfileContext();
  if (!context) return;
  await context.supabase
    .from("notification_reads")
    .upsert({ user_id: context.userId, last_read_at: new Date().toISOString() });
}

export async function savePushSubscriptionAction(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const subscription = parsePushSubscriptionInput(readProfileFormString(formData, "subscription"));
  if (!subscription) return { status: "error", message: "Không thể lưu thiết bị nhận thông báo." };

  const context = await getProfileContext();
  if (!context) return sessionError();

  const { error } = await context.supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: context.userId, ...subscription },
      { onConflict: "user_id,endpoint" },
    );
  if (error) return mapProfileError(error);
  return { status: "success" };
}

function parsePushSubscriptionInput(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "";
    const p256dh = typeof parsed.keys?.p256dh === "string" ? parsed.keys.p256dh : "";
    const auth = typeof parsed.keys?.auth === "string" ? parsed.keys.auth : "";
    if (!endpoint || !p256dh || !auth) return null;
    return { endpoint, p256dh, auth };
  } catch {
    return null;
  }
}

async function getProfileContext() {
```

- [ ] **Step 2: Xác nhận typecheck và test suite hiện có vẫn sạch**

Run: `pnpm typecheck && pnpm test -- --run`
Expected: PASS toàn bộ (không có test nào cho file này bị vỡ vì chỉ thêm export mới, không sửa export cũ).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/profile/actions.ts
git commit -m "feat: add mark-read and push subscription server actions"
```

---

## Task 7: `NotificationBell` component

**Files:**
- Create: `src/components/app/notification-bell.tsx`
- Test: `src/components/app/notification-bell.test.tsx`

**Interfaces:**
- Consumes: `NotificationTransactionItem` (Task 4), `markNotificationsReadAction` (Task 6), `createBrowserSupabaseClient` (có sẵn ở `@/lib/supabase/client`), `CategoryOption`/`MemberOption` (có sẵn ở `@/lib/transactions/data`).
- Produces: `NotificationBell` component, props `{ categories: CategoryOption[]; currentUserId: string; householdId: string; initialItems: NotificationTransactionItem[]; initialUnreadCount: number; members: MemberOption[]; recurringDueCount: number }`. Dùng bởi Task 8 (`app-shell.tsx`).

- [ ] **Step 1: Viết test thất bại**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { markNotificationsReadActionMock } = vi.hoisted(() => ({
  markNotificationsReadActionMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  markNotificationsReadAction: markNotificationsReadActionMock,
}));

const { onMock, subscribeMock, unsubscribeMock, removeChannelMock, createBrowserSupabaseClientMock } = vi.hoisted(() => {
  const channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> } = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  const removeChannelMock = vi.fn();
  const createBrowserSupabaseClientMock = vi.fn(() => ({
    channel: vi.fn(() => channel),
    removeChannel: removeChannelMock,
  }));
  return { onMock: channel.on, subscribeMock: channel.subscribe, unsubscribeMock: channel.unsubscribe, removeChannelMock, createBrowserSupabaseClientMock };
});
vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: createBrowserSupabaseClientMock,
}));

import { NotificationBell } from "./notification-bell";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";

const categories: CategoryOption[] = [
  { id: "food", name: "Ăn uống", type: "expense", color: "#087a5b", icon: "food", sortOrder: 1 },
];
const members: MemberOption[] = [
  { id: "user-1", name: "Bạn", email: "an@example.com" },
  { id: "user-2", name: "Bình", email: "binh@example.com" },
];

function renderBell(overrides: Partial<React.ComponentProps<typeof NotificationBell>> = {}) {
  render(
    <NotificationBell
      categories={categories}
      currentUserId="user-1"
      householdId="household-1"
      initialItems={[]}
      initialUnreadCount={0}
      members={members}
      recurringDueCount={0}
      {...overrides}
    />,
  );
}

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onMock.mockReturnValue({ on: onMock, subscribe: subscribeMock, unsubscribe: unsubscribeMock });
    subscribeMock.mockReturnValue({ on: onMock, subscribe: subscribeMock, unsubscribe: unsubscribeMock });
  });

  it("hiện tổng số lịch định kỳ đến hạn và giao dịch chưa xem", () => {
    renderBell({ recurringDueCount: 2, initialUnreadCount: 3 });
    expect(screen.getByRole("button", { name: "5 thông báo chưa xem" })).toBeInTheDocument();
  });

  it("thêm giao dịch mới từ Realtime vào danh sách và tăng số chưa xem", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    handler({
      new: {
        id: "tx-new",
        type: "expense",
        amount: 45000,
        category_id: "food",
        user_id: "user-2",
        created_at: new Date().toISOString(),
      },
    });

    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 thông báo chưa xem" }));
    expect(screen.getByText(/Bình đã thêm khoản chi 45.000 đ/)).toBeInTheDocument();
  });

  it("bỏ qua sự kiện Realtime do chính mình tạo", () => {
    renderBell({ initialUnreadCount: 0 });
    const handler = onMock.mock.calls[0][2] as (payload: unknown) => void;

    handler({
      new: {
        id: "tx-self",
        type: "expense",
        amount: 10000,
        category_id: "food",
        user_id: "user-1",
        created_at: new Date().toISOString(),
      },
    });

    expect(screen.getByRole("button", { name: "Thông báo" })).toBeInTheDocument();
  });

  it("mở popover thì đánh dấu đã đọc và badge chỉ còn số lịch định kỳ", () => {
    renderBell({ recurringDueCount: 1, initialUnreadCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "3 thông báo chưa xem" }));

    expect(markNotificationsReadActionMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "1 thông báo chưa xem" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận lỗi vì chưa có component**

Run: `pnpm test -- --run src/components/app/notification-bell.test.tsx`
Expected: FAIL — không tìm thấy module `./notification-bell`.

- [ ] **Step 3: Viết implementation**

```tsx
"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, X } from "lucide-react";

import { markNotificationsReadAction } from "@/app/(app)/profile/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { NotificationTransactionItem } from "@/lib/notifications/data";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";

export function NotificationBell({
  categories,
  currentUserId,
  householdId,
  initialItems,
  initialUnreadCount,
  members,
  recurringDueCount,
}: {
  categories: CategoryOption[];
  currentUserId: string;
  householdId: string;
  initialItems: NotificationTransactionItem[];
  initialUnreadCount: number;
  members: MemberOption[];
  recurringDueCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`household-transactions-${householdId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "transactions", filter: `household_id=eq.${householdId}` },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new;
          const rowUserId = typeof row.user_id === "string" ? row.user_id : null;
          const rowType = row.type;
          if (!rowUserId || rowUserId === currentUserId) return;
          if (rowType !== "income" && rowType !== "expense") return;
          const item: NotificationTransactionItem = {
            id: String(row.id),
            type: rowType,
            amount: Number(row.amount),
            categoryId: typeof row.category_id === "string" ? row.category_id : null,
            userId: rowUserId,
            createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
          };
          setItems((current) => [item, ...current].slice(0, 20));
          setUnreadCount((current) => current + 1);
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, householdId]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const totalCount = recurringDueCount + unreadCount;

  const openBell = () => {
    setOpen(true);
    setUnreadCount(0);
    void markNotificationsReadAction();
  };

  const closeBell = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="relative inline-block">
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={totalCount > 0 ? `${totalCount} thông báo chưa xem` : "Thông báo"}
        className="relative inline-flex size-11 items-center justify-center rounded-2xl border border-forest/14 bg-paper-raised/82 text-forest transition hover:bg-mist/70"
        onClick={() => (open ? closeBell() : openBell())}
        ref={triggerRef}
        type="button"
      >
        <Bell aria-hidden="true" className="size-5" />
        {totalCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-expense px-1.5 py-0.5 text-[10px] font-extrabold leading-4 text-white shadow-sm">
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            aria-hidden="true"
            className="fixed inset-0 z-40 cursor-default bg-ink/38 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={closeBell}
            tabIndex={-1}
            type="button"
          />
          <section
            aria-label="Thông báo"
            className="month-picker-enter fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-50 max-h-[70vh] overflow-y-auto rounded-[1.75rem] border border-white/60 bg-paper-raised p-4 shadow-[0_28px_90px_rgba(14,14,14,0.24)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-80 sm:rounded-[1.5rem]"
            id={dialogId}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo">Thông báo</p>
              <button aria-label="Đóng thông báo" onClick={closeBell} type="button">
                <X aria-hidden="true" className="size-4 text-forest/45" />
              </button>
            </div>

            {recurringDueCount > 0 ? (
              <Link
                className="mt-3 flex min-h-12 items-center gap-3 rounded-xl bg-yellow/35 px-3 text-sm font-bold text-ink transition hover:bg-yellow/50"
                href="/recurring"
                onClick={closeBell}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-yellow text-ink">
                  <Check aria-hidden="true" className="size-4" />
                </span>
                {recurringDueCount} lịch định kỳ đến hạn
              </Link>
            ) : null}

            <div className="mt-3 space-y-1">
              {items.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm font-medium text-ink/45">Chưa có giao dịch mới nào.</p>
              ) : (
                items.map((item) => <NotificationItemRow categories={categories} item={item} key={item.id} members={members} />)
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function NotificationItemRow({
  categories,
  item,
  members,
}: {
  categories: CategoryOption[];
  item: NotificationTransactionItem;
  members: MemberOption[];
}) {
  const category = categories.find((candidate) => candidate.id === item.categoryId);
  const member = members.find((candidate) => candidate.id === item.userId);
  const amountLabel = new Intl.NumberFormat("vi-VN").format(Math.round(item.amount));
  const typeLabel = item.type === "income" ? "thu" : "chi";

  return (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2 text-sm">
      <span
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
        style={{ backgroundColor: category?.color ?? "#6B7280" }}
      >
        {(member?.name ?? "?").slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          <span className="font-extrabold">{member?.name ?? "Thành viên"}</span> đã thêm khoản {typeLabel} {amountLabel} đ
        </p>
        <p className="mt-0.5 text-xs font-semibold text-ink/45">
          {category?.name ?? "Không rõ danh mục"} · {formatRelativeTime(item.createdAt)}
        </p>
      </div>
    </div>
  );
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });

function formatRelativeTime(iso: string, now = new Date()) {
  const diffMinutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (diffMinutes > -1) return "Vừa xong";
  if (diffMinutes > -60) return relativeTimeFormatter.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours > -24) return relativeTimeFormatter.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return relativeTimeFormatter.format(diffDays, "day");
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `pnpm test -- --run src/components/app/notification-bell.test.tsx`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/components/app/notification-bell.tsx src/components/app/notification-bell.test.tsx
git commit -m "feat: add notification bell with realtime updates"
```

---

## Task 8: Gắn `NotificationBell` vào layout và app-shell

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/app/app-shell.tsx`

**Interfaces:**
- Consumes: `getUnreadTransactionNotifications` (Task 4), `NotificationBell` (Task 7).

Không có test riêng cho bước này (không có `app-shell.test.tsx`/`layout.test.tsx` hiện tại trong repo) — xác minh qua `pnpm typecheck`/`pnpm build` và toàn bộ suite hiện có vẫn xanh.

- [ ] **Step 1: Sửa `src/app/(app)/layout.tsx`**

Nội dung hiện tại:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { getInitials } from "@/lib/auth/display";
import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { getRecurringDueCount } from "@/lib/recurring/data";
import { getTransactionFormOptions } from "@/lib/transactions/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MainAppLayout({ children }: { children: ReactNode }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login?error=session_expired");
  if (!membership.profile?.household_id || !membership.household) {
    redirect("/onboarding");
  }

  const profileName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );
  const supabase = await createServerSupabaseClient();
  const [options, recurringDueCount] = await Promise.all([
    getTransactionFormOptions(supabase, membership.profile.household_id),
    getRecurringDueCount(supabase, membership.profile.household_id),
  ]);

  return (
    <AppShell
      email={membership.profile.email || membership.email}
      householdName={membership.household.name}
      initials={getInitials(profileName)}
      profileName={profileName}
      transactionCategories={options.categories}
      transactionMembers={options.members}
      currentUserId={membership.userId}
      recurringDueCount={recurringDueCount}
      todayLabel={formatVietnameseDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
```

Nội dung mới:

```tsx
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { getInitials } from "@/lib/auth/display";
import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { getUnreadTransactionNotifications } from "@/lib/notifications/data";
import { getRecurringDueCount } from "@/lib/recurring/data";
import { getTransactionFormOptions } from "@/lib/transactions/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MainAppLayout({ children }: { children: ReactNode }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login?error=session_expired");
  if (!membership.profile?.household_id || !membership.household) {
    redirect("/onboarding");
  }

  const profileName = resolveProfileName(
    membership.profile,
    membership.metadataFullName || membership.email.split("@")[0],
  );
  const householdId = membership.profile.household_id;
  const supabase = await createServerSupabaseClient();
  const [options, recurringDueCount, notifications] = await Promise.all([
    getTransactionFormOptions(supabase, householdId),
    getRecurringDueCount(supabase, householdId),
    getUnreadTransactionNotifications(supabase, membership.userId, householdId),
  ]);

  return (
    <AppShell
      email={membership.profile.email || membership.email}
      householdId={householdId}
      householdName={membership.household.name}
      initialNotificationItems={notifications.items}
      initialUnreadCount={notifications.unreadCount}
      initials={getInitials(profileName)}
      profileName={profileName}
      transactionCategories={options.categories}
      transactionMembers={options.members}
      currentUserId={membership.userId}
      recurringDueCount={recurringDueCount}
      todayLabel={formatVietnameseDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
```

(hàm `formatVietnameseDate` ở cuối file giữ nguyên, không đổi)

- [ ] **Step 2: Sửa `src/components/app/app-shell.tsx` — import**

Nội dung hiện tại:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, MessageCircle, PiggyBank, Plus, Sparkles } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Brand } from "@/components/brand";
import { DesktopNavigation, MobileNavigation } from "@/components/app/navigation";
import { TransactionForm } from "@/components/transactions/transaction-manager";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { RecurringReminderNotifier } from "@/components/recurring/recurring-reminder-notifier";
```

Nội dung mới:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MessageCircle, PiggyBank, Plus, Sparkles } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { Brand } from "@/components/brand";
import { DesktopNavigation, MobileNavigation } from "@/components/app/navigation";
import { NotificationBell } from "@/components/app/notification-bell";
import { TransactionForm } from "@/components/transactions/transaction-manager";
import type { NotificationTransactionItem } from "@/lib/notifications/data";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { RecurringReminderNotifier } from "@/components/recurring/recurring-reminder-notifier";
```

- [ ] **Step 3: Sửa `src/components/app/app-shell.tsx` — props**

Nội dung hiện tại:

```tsx
export function AppShell({
  children,
  email,
  householdName,
  initials,
  profileName,
  transactionCategories,
  transactionMembers,
  currentUserId,
  recurringDueCount,
  todayLabel,
}: {
  children: ReactNode;
  email: string;
  householdName: string;
  initials: string;
  profileName: string;
  transactionCategories: CategoryOption[];
  transactionMembers: MemberOption[];
  currentUserId: string;
  recurringDueCount: number;
  todayLabel: string;
}) {
```

Nội dung mới:

```tsx
export function AppShell({
  children,
  email,
  householdId,
  householdName,
  initialNotificationItems,
  initialUnreadCount,
  initials,
  profileName,
  transactionCategories,
  transactionMembers,
  currentUserId,
  recurringDueCount,
  todayLabel,
}: {
  children: ReactNode;
  email: string;
  householdId: string;
  householdName: string;
  initialNotificationItems: NotificationTransactionItem[];
  initialUnreadCount: number;
  initials: string;
  profileName: string;
  transactionCategories: CategoryOption[];
  transactionMembers: MemberOption[];
  currentUserId: string;
  recurringDueCount: number;
  todayLabel: string;
}) {
```

- [ ] **Step 4: Sửa `src/components/app/app-shell.tsx` — thay khối Link chuông**

Nội dung hiện tại:

```tsx
              <Link
                aria-label={recurringDueCount > 0 ? `${recurringDueCount} giao dịch định kỳ đến hạn` : "Giao dịch định kỳ"}
                className="relative inline-flex size-11 items-center justify-center rounded-2xl border border-forest/14 bg-paper-raised/82 text-forest transition hover:bg-mist/70"
                href="/recurring"
              >
                <Bell aria-hidden="true" className="size-5" />
                {recurringDueCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-expense px-1.5 py-0.5 text-[10px] font-extrabold leading-4 text-white shadow-sm">
                    {recurringDueCount > 99 ? "99+" : recurringDueCount}
                  </span>
                ) : null}
              </Link>
```

Nội dung mới:

```tsx
              <NotificationBell
                categories={transactionCategories}
                currentUserId={currentUserId}
                householdId={householdId}
                initialItems={initialNotificationItems}
                initialUnreadCount={initialUnreadCount}
                members={transactionMembers}
                recurringDueCount={recurringDueCount}
              />
```

- [ ] **Step 5: Xác nhận typecheck, lint, và toàn bộ test suite sạch**

Run: `pnpm check`
Expected: PASS toàn bộ (lint + typecheck + 200+ test hiện có, cộng test mới từ Task 2/3/7).

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/layout.tsx src/components/app/app-shell.tsx
git commit -m "feat: wire notification bell into app shell"
```

---

## Task 9: Gửi push khi tạo giao dịch mới + service worker `push` handler

**Files:**
- Modify: `src/app/(app)/transactions/actions.ts`
- Modify: `src/app/(app)/transactions/actions.test.ts`
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: `sendTransactionPushNotifications` (Task 5), `formatTransactionNotificationText` (Task 2), `resolveProfileName` (có sẵn ở `@/lib/auth/profile`).

- [ ] **Step 1: Sửa import và `getTransactionContext` trong `actions.ts`**

Nội dung hiện tại (đầu file):

```ts
"use server";

import { revalidatePath } from "next/cache";

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  readTransactionFormString,
  validateTransactionInput,
} from "@/lib/transactions/validation";
import type { TransactionActionState } from "@/lib/transactions/action-state";
```

Nội dung mới:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { resolveProfileName } from "@/lib/auth/profile";
import { getCurrentMembership } from "@/lib/auth/session";
import { formatTransactionNotificationText } from "@/lib/notifications/format";
import { sendTransactionPushNotifications } from "@/lib/notifications/push";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  readTransactionFormString,
  validateTransactionInput,
} from "@/lib/transactions/validation";
import type { TransactionActionState } from "@/lib/transactions/action-state";
```

Nội dung hiện tại (`getTransactionContext`):

```ts
async function getTransactionContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return {
    householdId,
    userId: membership.userId,
    supabase: await createServerSupabaseClient(),
  };
}
```

Nội dung mới:

```ts
async function getTransactionContext() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!membership || !householdId) return null;
  return {
    householdId,
    userId: membership.userId,
    actorName: resolveProfileName(membership.profile, membership.metadataFullName || membership.email.split("@")[0]),
    supabase: await createServerSupabaseClient(),
  };
}
```

- [ ] **Step 2: Gửi push trong `createTransactionAction` sau khi insert thành công**

Nội dung hiện tại:

```ts
  if (error) return mapTransactionError(error);
  revalidateTransactions();
  return { status: "success", message: "Đã lưu giao dịch.", transactionId: data.id };
}

export async function updateTransactionAction(
```

Nội dung mới:

```ts
  if (error) return mapTransactionError(error);

  after(() => {
    const notification = formatTransactionNotificationText(
      context.actorName,
      references.category.type,
      validation.data.amount,
      references.category.name,
    );
    return sendTransactionPushNotifications(context.supabase, context.userId, {
      title: notification.title,
      body: notification.body,
      url: "/transactions",
    }).catch(() => {
      // Gửi push thất bại không được ảnh hưởng tới giao dịch đã lưu thành công.
    });
  });

  revalidateTransactions();
  return { status: "success", message: "Đã lưu giao dịch.", transactionId: data.id };
}

export async function updateTransactionAction(
```

- [ ] **Step 3: Cập nhật `actions.test.ts` — mock `next/server` và `sendTransactionPushNotifications`**

Nội dung hiện tại (đầu file):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialTransactionActionState } from "@/lib/transactions/action-state";

const getMembership = vi.mocked(getCurrentMembership);
const createClient = vi.mocked(createServerSupabaseClient);
```

Nội dung mới:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn((callback: () => unknown) => { void callback(); }) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/notifications/push", () => ({ sendTransactionPushNotifications: vi.fn().mockResolvedValue(undefined) }));

import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";
import { getCurrentMembership } from "@/lib/auth/session";
import { sendTransactionPushNotifications } from "@/lib/notifications/push";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialTransactionActionState } from "@/lib/transactions/action-state";

const getMembership = vi.mocked(getCurrentMembership);
const createClient = vi.mocked(createServerSupabaseClient);
const sendPush = vi.mocked(sendTransactionPushNotifications);
```

- [ ] **Step 4: Thêm test mới ngay sau test "tạo giao dịch bằng category và member cùng household"**

```ts
  it("vẫn trả success dù gửi thông báo push thất bại", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", household_id: "household-1", name: "Ăn uống", type: "expense" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1", household_id: "household-1" }, error: null });
    const insertQuery = createChain({ data: { id: "tx-new" }, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(insertQuery),
    };
    createClient.mockResolvedValue(client as never);
    sendPush.mockRejectedValueOnce(new Error("push failed"));

    const result = await createTransactionAction(
      initialTransactionActionState,
      makeFormData({
        amountExpression: "45000",
        categoryId: "cat-1",
        userId: "user-1",
        transactionDate: "2026-08-03",
        note: "",
      }),
    );

    expect(result.status).toBe("success");
    expect(sendPush).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 5: Chạy test file này, xác nhận pass**

Run: `pnpm test -- --run "src/app/(app)/transactions/actions.test.ts"`
Expected: PASS toàn bộ, gồm test mới.

- [ ] **Step 6: Thêm `push` event handler vào `public/sw.js`**

Nội dung hiện tại:

```js
self.addEventListener("notificationclick", (event) => {
```

Nội dung mới (chèn ngay trước):

```js
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Thu Chi Gia Đình";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
```

- [ ] **Step 7: Xác nhận toàn bộ suite vẫn sạch**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(app\)/transactions/actions.ts src/app/\(app\)/transactions/actions.test.ts public/sw.js
git commit -m "feat: send push notification after creating a transaction"
```

---

## Task 10: Chuyển UI xin quyền thông báo — Giao dịch định kỳ → Cá nhân

**Files:**
- Delete: `src/components/recurring/recurring-reminder-settings.tsx`
- Modify: `src/components/recurring/recurring-manager.tsx`
- Create: `src/components/profile/notification-settings.tsx`
- Test: `src/components/profile/notification-settings.test.tsx`
- Modify: `src/components/profile/profile-manager.tsx`

**Interfaces:**
- Consumes: `getRecurringReminderPermission`/`requestRecurringReminderPermission` (có sẵn ở `@/lib/pwa/recurring-reminder`, giữ nguyên không đổi), `subscribeToPushNotifications` (Task 3), `savePushSubscriptionAction` (Task 6).
- Produces: `NotificationSettings` component (không props). `RecurringReminderNotifier` (hiển thị nhắc lịch định kỳ tự động khi mở app) **không đổi** — tính năng nhắc lịch định kỳ hằng ngày vẫn hoạt động độc lập với việc UI xin quyền chuyển vị trí.

Component mới **không** còn gửi thông báo thử bằng `showRecurringDueReminder` (hàm đó gắn với ngữ cảnh "lịch định kỳ", không còn phù hợp khi thẻ này giờ tổng quát cho mọi loại thông báo) — thay bằng toast xác nhận đơn giản.

- [ ] **Step 1: Xóa `recurring-reminder-settings.tsx`**

```bash
rm src/components/recurring/recurring-reminder-settings.tsx
```

- [ ] **Step 2: Bỏ import và usage trong `recurring-manager.tsx`**

Nội dung hiện tại (import):

```tsx
import { PageHeader } from "@/components/app/page-header";
import { RecurringReminderSettings } from "@/components/recurring/recurring-reminder-settings";
import { Button } from "@/components/ui/button";
```

Nội dung mới:

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
```

Nội dung hiện tại (usage):

```tsx
      <RecurringReminderSettings dueCount={data.dueCount} userId={currentUserId} />

      <section className="mt-7 space-y-7">
```

Nội dung mới:

```tsx
      <section className="mt-7 space-y-7">
```

- [ ] **Step 3: Viết test thất bại cho `NotificationSettings`**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/pwa/recurring-reminder", () => ({
  getRecurringReminderPermission: vi.fn(),
  requestRecurringReminderPermission: vi.fn(),
}));
vi.mock("@/lib/notifications/push-client", () => ({
  subscribeToPushNotifications: vi.fn(),
}));
vi.mock("@/app/(app)/profile/actions", () => ({
  savePushSubscriptionAction: vi.fn(),
}));

import { NotificationSettings } from "@/components/profile/notification-settings";
import { ToastProvider } from "@/components/ui/toast";
import { savePushSubscriptionAction } from "@/app/(app)/profile/actions";
import { getRecurringReminderPermission, requestRecurringReminderPermission } from "@/lib/pwa/recurring-reminder";
import { subscribeToPushNotifications } from "@/lib/notifications/push-client";

const getPermission = vi.mocked(getRecurringReminderPermission);
const requestPermission = vi.mocked(requestRecurringReminderPermission);
const subscribeToPush = vi.mocked(subscribeToPushNotifications);
const saveSubscription = vi.mocked(savePushSubscriptionAction);

function renderSettings() {
  render(
    <ToastProvider>
      <NotificationSettings />
    </ToastProvider>,
  );
}

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
    getPermission.mockReturnValue("default");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("đăng ký push và báo đã bật khi được cấp quyền", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockResolvedValue({
      toJSON: () => ({ endpoint: "https://push.example/1", keys: { p256dh: "key", auth: "secret" } }),
    } as never);
    saveSubscription.mockResolvedValue({ status: "success" });

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    await waitFor(() => expect(saveSubscription).toHaveBeenCalledOnce());
    expect(await screen.findByText("Đã bật")).toBeInTheDocument();
  });

  it("báo thiết bị chưa hỗ trợ push khi subscribe trả về null", async () => {
    requestPermission.mockResolvedValue("granted");
    subscribeToPush.mockResolvedValue(null);

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    await waitFor(() => expect(saveSubscription).not.toHaveBeenCalled());
    expect(await screen.findByText("Đã bật")).toBeInTheDocument();
  });

  it("báo lỗi khi trình duyệt chặn quyền thông báo", async () => {
    requestPermission.mockResolvedValue("denied");

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Bật thông báo" }));

    expect(await screen.findByText("Quyền thông báo đã bị chặn trong cài đặt trình duyệt.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận lỗi vì chưa có component**

Run: `pnpm test -- --run src/components/profile/notification-settings.test.tsx`
Expected: FAIL — không tìm thấy module `@/components/profile/notification-settings`.

- [ ] **Step 5: Viết implementation**

```tsx
"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, ShieldCheck } from "lucide-react";

import { savePushSubscriptionAction } from "@/app/(app)/profile/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { initialProfileActionState } from "@/lib/profile/action-state";
import { subscribeToPushNotifications } from "@/lib/notifications/push-client";
import {
  getRecurringReminderPermission,
  requestRecurringReminderPermission,
  type ReminderPermission,
} from "@/lib/pwa/recurring-reminder";

export function NotificationSettings() {
  const [permission, setPermission] = useState<ReminderPermission | "loading">("loading");
  const [pending, setPending] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => setPermission(getRecurringReminderPermission()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const enableNotifications = async () => {
    setPending(true);
    try {
      const result = await requestRecurringReminderPermission();
      setPermission(result);
      if (result !== "granted") {
        if (result === "denied") {
          notify("Trình duyệt đang chặn thông báo. Bạn có thể mở lại trong cài đặt website.", "error");
        }
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const subscription = vapidPublicKey ? await subscribeToPushNotifications(vapidPublicKey) : null;
      if (!subscription) {
        notify("Đã bật nhắc hạn trên thiết bị này. Thiết bị chưa hỗ trợ nhận thông báo khi đóng app.");
        return;
      }

      const formData = new FormData();
      formData.set("subscription", JSON.stringify(subscription.toJSON()));
      const saveResult = await savePushSubscriptionAction(initialProfileActionState, formData);
      notify(
        saveResult.status === "success" ? "Đã bật thông báo." : "Đã cấp quyền nhưng chưa lưu được thiết bị, thử bật lại sau.",
        saveResult.status === "success" ? "success" : "error",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-[1.75rem] border border-forest/10 bg-paper-raised/72 p-5 shadow-[0_18px_50px_rgba(31,61,43,0.07)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex items-start gap-4">
        <div className={permission === "granted" ? "grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-soft text-income" : "grid size-11 shrink-0 place-items-center rounded-2xl bg-mist text-forest"}>
          {permission === "denied" || permission === "unsupported" ? <BellOff aria-hidden="true" className="size-5" /> : <BellRing aria-hidden="true" className="size-5" />}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-extrabold">Thông báo</h2>
            {permission === "granted" ? <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2 py-1 text-[10px] font-extrabold uppercase text-income"><ShieldCheck aria-hidden="true" className="size-3" />Đã bật</span> : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-ink/52">
            Nhận thông báo khi thành viên household thêm giao dịch mới và khi có lịch định kỳ đến hạn, kể cả lúc đã đóng app.
          </p>
          {permission === "unsupported" ? <p className="mt-2 text-xs font-bold text-expense">Thiết bị này chưa hỗ trợ thông báo web; trên iPhone hãy cài PWA ra màn hình chính trước.</p> : null}
          {permission === "denied" ? <p className="mt-2 text-xs font-bold text-expense">Quyền thông báo đã bị chặn trong cài đặt trình duyệt.</p> : null}
        </div>
      </div>
      {permission === "default" ? <Button disabled={pending} onClick={enableNotifications} variant="secondary">{pending ? "Đang bật..." : "Bật thông báo"}</Button> : null}
    </section>
  );
}
```

- [ ] **Step 6: Chạy test, xác nhận pass**

Run: `pnpm test -- --run src/components/profile/notification-settings.test.tsx`
Expected: PASS (3 test).

- [ ] **Step 7: Gắn `NotificationSettings` vào `profile-manager.tsx`**

Nội dung hiện tại (import):

```tsx
import {
  deleteHouseholdAction,
  leaveHouseholdAction,
  renameHouseholdAction,
  transferOwnershipAction,
  updateProfileNameAction,
} from "@/app/(app)/profile/actions";
import { PageHeader } from "@/components/app/page-header";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
```

Nội dung mới:

```tsx
import {
  deleteHouseholdAction,
  leaveHouseholdAction,
  renameHouseholdAction,
  transferOwnershipAction,
  updateProfileNameAction,
} from "@/app/(app)/profile/actions";
import { PageHeader } from "@/components/app/page-header";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationSettings } from "@/components/profile/notification-settings";
import { Button } from "@/components/ui/button";
```

Nội dung hiện tại (JSX cột trái):

```tsx
        <div className="space-y-4">
          <Card className="h-fit">
            <CardContent className="flex flex-col items-center p-6 text-center sm:p-8">
              <div className="grid size-24 place-items-center rounded-full bg-forest text-2xl font-extrabold text-paper shadow-[0_18px_45px_rgba(31,61,43,0.22)]">
                {getInitials(profileName)}
              </div>
              <h2 className="mt-5 text-2xl font-extrabold tracking-[-0.04em]">{profileName}</h2>
              <p className="mt-1 text-sm font-medium text-ink/46">{email}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 text-xs font-extrabold text-ink">
                {isOwner ? <Crown aria-hidden="true" className="size-3.5" /> : <UserRound aria-hidden="true" className="size-3.5" />}
                {isOwner ? "Chủ household" : "Thành viên"}
              </span>
              <Button className="mt-5 w-full" onClick={() => setEditor("profile")} variant="secondary">
                <Pencil aria-hidden="true" className="size-4" /> Sửa tên hiển thị
              </Button>
            </CardContent>
          </Card>
          <LogoutButton />
        </div>
```

Nội dung mới:

```tsx
        <div className="space-y-4">
          <Card className="h-fit">
            <CardContent className="flex flex-col items-center p-6 text-center sm:p-8">
              <div className="grid size-24 place-items-center rounded-full bg-forest text-2xl font-extrabold text-paper shadow-[0_18px_45px_rgba(31,61,43,0.22)]">
                {getInitials(profileName)}
              </div>
              <h2 className="mt-5 text-2xl font-extrabold tracking-[-0.04em]">{profileName}</h2>
              <p className="mt-1 text-sm font-medium text-ink/46">{email}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 text-xs font-extrabold text-ink">
                {isOwner ? <Crown aria-hidden="true" className="size-3.5" /> : <UserRound aria-hidden="true" className="size-3.5" />}
                {isOwner ? "Chủ household" : "Thành viên"}
              </span>
              <Button className="mt-5 w-full" onClick={() => setEditor("profile")} variant="secondary">
                <Pencil aria-hidden="true" className="size-4" /> Sửa tên hiển thị
              </Button>
            </CardContent>
          </Card>
          <NotificationSettings />
          <LogoutButton />
        </div>
```

- [ ] **Step 8: Xác nhận toàn bộ suite, lint, typecheck sạch**

Run: `pnpm check`
Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add -A -- src/components/recurring/recurring-reminder-settings.tsx src/components/recurring/recurring-manager.tsx src/components/profile/notification-settings.tsx src/components/profile/notification-settings.test.tsx src/components/profile/profile-manager.tsx
git commit -m "refactor: move notification permission UI from recurring page to profile"
```

---

## Sau khi hoàn tất plan (việc người dùng tự làm, ngoài phạm vi subagent)

1. Chạy `npx web-push generate-vapid-keys` để tạo cặp khóa VAPID thật, điền vào `.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
2. Áp dụng migration `20260908010000_household_notifications.sql` lên Supabase production (`supabase db push` hoặc dán SQL vào Supabase Studio) — phiên làm việc này không có Supabase CLI/MCP đã xác thực.
3. Chạy `supabase gen types` lại theo quy trình đã có của project, đối chiếu phần hand-authored ở Task 1 Step 2-3 khớp với output thật, sửa nếu có sai khác.
4. Verify luồng thật trong browser bằng 2 tài khoản/2 thiết bị trong cùng household (A thêm giao dịch, B nhận được cả chuông live-update lẫn push).
