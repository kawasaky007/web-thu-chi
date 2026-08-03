# Supabase migration

Supabase CLI `2.110.0` đã đăng nhập và link project hiện tại. Generated types
production nằm tại `src/types/database.generated.ts`; client không dùng
`service_role` key.

Các migration Prompt 04-13 đã được push và khớp local/remote:

- `20260731043510_household_onboarding_rpcs.sql`
- `20260731050445_secure_household_select_policy.sql`
- `20260803070000_secure_categories.sql`
- `20260803080000_secure_transactions.sql`
- `20260803090000_dashboard_report_rpc.sql`
- `20260803100000_secure_budgets_and_clone.sql`
- `20260803110000_household_management_rpcs.sql`
- `20260803120000_recurring_transactions.sql`
- `20260803130000_savings_goals.sql`
- `20260803131000_savings_goals_report_rpc.sql`
- `20260803132000_idempotent_savings_entries.sql`

Migration đầu thêm RPC transaction cho tạo/tham gia household. Migration sau
xóa policy làm lộ household qua invite code và giới hạn đọc theo household hiện
tại. Migration thứ ba khóa CRUD categories theo household thành viên và thêm
unique index chống trùng tên cùng loại. Cả năm bảng production đã được query
trực tiếp và đều đang bật RLS.

Migration giao dịch giới hạn select/insert/update cho thành viên household,
kiểm tra member khi gán `user_id`, giữ delete cho người thực hiện giao dịch và
thêm index theo `transaction_date`/`created_at` cho lọc tháng, cursor pagination.

Migration dashboard thêm `get_dashboard_report(start, end)` dạng `SECURITY INVOKER`;
RPC chỉ trả tổng thu/chi, cơ cấu danh mục, tổng theo thành viên và tối đa năm giao
dịch gần đây. Dashboard vì vậy không tải toàn bộ lịch sử giao dịch về client.

Migration budgets thay bốn policy role `public` bằng policy `authenticated` theo
household, kiểm tra category phải là loại `expense`, thêm index tháng/thứ tự và
hai RPC `clone_budget_month` (idempotent, không ghi đè target) cùng
`reorder_budgets` (atomic).

Migration quản trị household gom các policy trùng trên `households`/`profiles`;
chuyển chủ, rời và xóa household qua ba RPC transaction. RPC xóa yêu cầu xác
nhận chính xác tên household, xóa transaction/budget/category và đưa profile về
trạng thái chưa có household nhưng không xóa tài khoản Auth.

CRUD danh mục và giao dịch đã được triển khai sau khi sửa policy; mọi thao tác
đều khóa theo `current_user_household_id()`, tên category trùng được chặn ở
database và transaction member được kiểm tra ở cả server action/RLS.

Prompt 11 không cần migration mới. Export chỉ đọc dữ liệu theo session hiện tại;
import kiểm tra category/member cùng household rồi dùng một lệnh batch `upsert`
với `ignoreDuplicates`. Policy transactions hiện tại tiếp tục kiểm tra household
và member ở database, còn ID từ backup giúp thao tác nhập lại không tạo bản sao.

Migration Prompt 12 thêm `recurring_rules` và `recurring_occurrences`, đều bật
RLS theo household. Rule kiểm tra category cùng loại thu/chi và member cùng
household; occurrence chỉ cho client đọc, còn ghi dữ liệu đi qua RPC
`materialize_due_recurring_transactions`. RPC khóa rule, unique theo
`rule_id,due_date`, tạo transaction + occurrence nguyên tử, cập nhật kỳ tiếp theo
theo múi giờ Việt Nam và giới hạn backlog mỗi lần gọi. `leave_current_household`
tự dừng rule của thành viên rời đi; `delete_current_household` xóa rule trước
category/member reference. Generated types đã được tạo lại sau khi push.

Prompt 13 thêm `savings_goals` và ledger bất biến `savings_goal_entries`, đều
khóa RLS theo household. `record_savings_goal_entry` chạy transaction có row
lock, kiểm tra member, chặn withdrawal làm số dư âm, tự cập nhật trạng thái hoàn
thành và dùng unique `request_id` để retry idempotent. Client không có policy
insert/update/delete ledger; mọi biến động đi qua RPC. `get_savings_goals_report`
aggregate số dư trong database và chỉ trả năm entry gần nhất mỗi goal, tránh tải
toàn bộ lịch sử về Next.js. Ba migration Prompt 13 đã push và generated types
đã được tạo lại từ remote.

Full SQL dump chưa tạo được vì `supabase db dump` cần Docker/`pg_dump`, trong khi
máy hiện chưa có runtime phù hợp. Không giữ file `schema.sql` rỗng để tránh tạo
cảm giác sai rằng schema đã được export đầy đủ.

Chạy lại khi Docker hoạt động:

```bash
npx --yes supabase@2.110.0 db dump --linked --schema public --file supabase/schema.sql
```

Chi tiết bảng, function, policy đã query, chênh lệch với migration Flutter và
phần chưa thể xác minh nằm trong `docs/supabase-schema-audit.md`.
