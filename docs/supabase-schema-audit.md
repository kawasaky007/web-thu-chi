# Đối chiếu schema Supabase production

Ngày đối chiếu ban đầu: 31/07/2026. Cập nhật migration gần nhất: 03/08/2026.

## Kết quả lấy từ project hiện tại

- Supabase CLI `2.110.0` đã đăng nhập và link project `hvxneruxfezzawchncok`.
- Lịch sử migration remote có mười một migration do web app tạo ở Prompt 04-13:
  `20260731043510`, `20260731050445`, `20260803070000`, `20260803080000` và
  `20260803090000`, `20260803100000`, `20260803110000`, `20260803120000`,
  `20260803130000`, `20260803131000` và `20260803132000`.
- Ba file migration cũ trong source Flutter vẫn không xuất hiện trong migration
  history remote, nên không thể dùng history để chứng minh chúng đã được áp dụng
  bằng CLI.
- Generated TypeScript types được lấy trực tiếp từ schema `public` và lưu tại
  `src/types/database.generated.ts`.
- Production hiện công khai qua API chín bảng: `budgets`, `categories`,
  `households`, `profiles`, `recurring_occurrences`, `recurring_rules`,
  `savings_goal_entries`, `savings_goals`, `transactions`.
- Production hiện công khai mười ba function: bốn function onboarding/helper,
  `get_dashboard_report(p_start, p_end)`, `clone_budget_month(...)` và
  `reorder_budgets(...)`, cùng ba RPC quản trị household. RPC dashboard/budget
  chạy `SECURITY INVOKER`; transfer/leave/delete và materialize recurring chạy
  `SECURITY DEFINER` với kiểm tra owner/member/household nội bộ. Report savings
  chạy `SECURITY INVOKER`, còn ghi ledger chạy `SECURITY DEFINER`.

## Đối chiếu với migration Flutter

| Migration Flutter | Dấu hiệu có trong generated types | Giới hạn xác minh |
| --- | --- | --- |
| `202605200001_create_budgets.sql` | Có bảng `budgets` và các cột nghiệp vụ tương ứng | Types không chứa check constraint, unique constraint, index, RLS, policy, trigger hoặc publication |
| `202605310001_add_display_order_to_budgets.sql` | Có `budgets.display_order` | Không xác minh được backfill và index sắp xếp |
| `202607030001_allow_household_members_select_profiles.sql` | Có function `current_user_household_id()` | Không xác minh được grant và policy select của `profiles` |

Production có thêm `is_same_household(hid)` nhưng function này không nằm trong
ba migration đang lưu ở source Flutter. Không tự tạo lại hoặc thay đổi function
này cho tới khi có full schema dump.

## Migration và RPC của web app

| Migration | Trạng thái remote | Mục đích |
| --- | --- | --- |
| `20260731043510_household_onboarding_rpcs.sql` | Đã push | Tạo/join household nguyên tử, khóa profile bằng `FOR UPDATE`, chạy `SECURITY DEFINER` và chỉ grant execute cho `authenticated` |
| `20260731050445_secure_household_select_policy.sql` | Đã push | Xóa policy đọc household theo invite code và chỉ cho owner/thành viên đọc household hiện tại |
| `20260803070000_secure_categories.sql` | Đã push | Khóa CRUD categories theo household thành viên và thêm unique index tên chuẩn hóa theo household + loại |
| `20260803080000_secure_transactions.sql` | Đã push | Khóa CRUD transactions theo household thành viên, chỉ owner được xóa và thêm index cursor theo ngày |
| `20260803090000_dashboard_report_rpc.sql` | Đã push | Aggregate dashboard theo khoảng thời gian, trả summary/category/member/recent và không tải toàn bộ giao dịch |
| `20260803100000_secure_budgets_and_clone.sql` | Đã push | Khóa RLS budgets theo household, thêm index, RPC clone idempotent và reorder atomic |
| `20260803110000_household_management_rpcs.sql` | Đã push | Gom policy trùng, thêm RPC transaction cho chuyển chủ, rời và xóa household |
| `20260803120000_recurring_transactions.sql` | Đã push | Thêm rule/occurrence định kỳ, RLS household và RPC materialize chống trùng theo ngày đến hạn |
| `20260803130000_savings_goals.sql` | Đã push | Thêm goal/ledger tiết kiệm, RLS household và RPC đóng/rút có row lock |
| `20260803131000_savings_goals_report_rpc.sql` | Đã push | Aggregate số dư và năm biến động gần nhất mỗi goal bằng `SECURITY INVOKER` |
| `20260803132000_idempotent_savings_entries.sql` | Đã push | Thêm unique request ID và biến RPC ledger thành idempotent khi retry |

Hai RPC kiểm tra session bằng `auth.uid()`, chuẩn hóa input, từ chối profile đã
có household và cập nhật profile trong cùng transaction. Migration đã được
dry-run/rollback trước khi push; generated types đã được tạo lại sau khi push.

## RLS và policy đã query trực tiếp

Query `pg_class` ngày 31/07/2026 xác nhận năm bảng gốc `budgets`, `categories`,
`households`, `profiles`, `transactions` đều có `relrowsecurity = true`.
Migration recurring đã được áp dụng remote ngày 03/08/2026 và bật RLS ngay khi
tạo cả hai bảng mới; generated types sau push xác nhận chúng được PostgREST công
khai đúng schema dự kiến.

Các điểm quan trọng từ `pg_policies`:

- Policy rộng `Anyone can view household by invite code` đã bị xóa. Policy mới
  `Household members can view own household` chỉ cho owner hoặc household hiện
  tại đọc bản ghi.
- `categories` hiện có đúng bốn policy cho role `authenticated`; select/insert/
  update/delete đều dùng `household_id = current_user_household_id()`.
- Policy categories cũ cho phép `SELECT true`/`INSERT true` hoặc chỉ owner đã được
  xóa. Thành viên household hiện tại có thể quản lý danh mục, còn dữ liệu khác
  household bị RLS chặn.
- Unique index `categories_household_type_name_unique_idx` chuẩn hóa khoảng trắng
  và không phân biệt hoa thường theo household + loại, bảo vệ cả các client cũ.
- `transactions` hiện có policy select/insert/update cho `authenticated` theo
  household hiện tại; insert/update còn kiểm tra `user_id` là member household.
  Delete giữ đúng hành vi Flutter: chỉ member là `user_id` của giao dịch mới xóa.
- Index `transactions_household_date_created_idx` phục vụ lọc tháng và cursor
  pagination. Audit dữ liệu cho thấy 286 giao dịch đều có category/member cùng
  household.
- `households` hiện còn đúng bốn policy select/insert/update/delete; policy owner
  trùng từ schema cũ đã được gom. `profiles` còn select thành viên cùng household,
  insert/update hồ sơ của chính người dùng.
- `budgets` hiện có bốn policy cho role `authenticated`; insert/update chỉ nhận
  category chi tiêu cùng household. Unique constraint
  `household_id,category_id,month,year` được giữ và index
  `budgets_household_month_order_idx` phục vụ màn hình tháng.
- `recurring_rules` có bốn policy CRUD cho `authenticated`, khóa theo household
  và kiểm tra category/member reference. `recurring_occurrences` chỉ có policy
  select; insert/update do RPC đã kiểm tra session thực hiện. Unique constraint
  `rule_id,due_date` là lớp chống tạo giao dịch trùng khi retry hoặc chạy đồng thời.
- `savings_goals` có policy CRUD theo household; delete chỉ thành công khi goal
  chưa có ledger. `savings_goal_entries` chỉ cho client select, còn mọi insert
  chạy qua RPC. Unique `request_id` chống ghi tiền hai lần và RPC khóa goal trước
  khi kiểm tra số dư, nên hai withdrawal đồng thời không thể cùng rút vượt quỹ.

## Phần chưa thể export

`supabase db dump --linked` đã kết nối được project nhưng CLI cần Docker để chạy
`pg_dump`; máy hiện chưa có Docker daemon/`pg_dump` phù hợp. Vì vậy chưa có file
`supabase/schema.sql`.

RLS và policy nêu trên đã được query trực tiếp, nhưng audit vẫn chưa bao phủ đầy
đủ:

- Trigger/function không được PostgREST công khai.
- Index, check/unique constraint, grant và cấu hình Realtime publication.
- Toàn bộ định nghĩa function, ownership/default privilege và dependency ngoài
  các RPC/policy đã tạo hoặc query riêng ở Prompt 04.

Sau khi Docker hoạt động, chạy lại ở chế độ chỉ đọc:

```bash
npx --yes supabase@2.110.0 db dump --linked --schema public --file supabase/schema.sql
```

Sau đó review diff trước khi tạo hoặc chạy bất kỳ migration nào. Không dùng
`service_role` key và không sửa dữ liệu production trong bước audit.
