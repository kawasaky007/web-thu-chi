# Audit source Flutter

Source được đọc: `/Users/lap14810/app-thu-chi`.

## Kiến trúc hiện tại

- Flutter 3/Dart, Riverpod, GoRouter, Supabase Flutter và `fl_chart`.
- Mobile gọi trực tiếp Supabase Auth, PostgREST và Realtime; không có backend NestJS.
- State được chia theo feature bằng repository + Riverpod provider.
- Cấu hình local lấy từ `.env`; web sẽ đổi sang `NEXT_PUBLIC_SUPABASE_URL` và
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Màn hình và tính năng

| Nhóm | Chức năng đã có |
| --- | --- |
| Auth | Splash, đăng nhập email/password, đăng ký, khôi phục/refresh session, đăng xuất |
| Household | Tạo household, tham gia bằng mã mời, đổi tên, chuyển chủ, rời household, xóa household |
| Dashboard | Tổng thu, tổng chi, số dư và thống kê theo dữ liệu giao dịch |
| Giao dịch | Danh sách, lịch sử, thêm, sửa, xóa, lọc theo tháng và phân trang |
| Nhập số tiền | Tính biểu thức số học và định dạng tiền Việt Nam |
| Danh mục | Realtime, tạo, sửa, xóa, kiểm tra trùng tên và sắp xếp theo loại thu/chi |
| Ngân sách | Theo tháng/danh mục chi, upsert, xóa, kéo đổi thứ tự và sao chép tháng gần nhất |
| Hồ sơ | Danh sách thành viên Realtime và cập nhật tên hiển thị |
| Điều hướng | Dashboard, giao dịch, danh mục, ngân sách và hồ sơ trong app shell |
| Báo cáo/cài đặt | Có page khung; `settings` hiện là alias của hồ sơ và reports chưa là route chính |

## Supabase API đang dùng

- Auth: `onAuthStateChange`, `currentUser`, `currentSession`,
  `signInWithPassword`, `signUp`, `signOut`.
- Bảng: `profiles`, `households`, `categories`, `transactions`, `budgets`.
- CRUD: `select`, `insert`, `upsert`, `update`, `delete`, `maybeSingle`.
- Query: `eq`, `order`, `limit`, lọc theo household/tháng/năm và phân trang.
- Realtime: `.stream(primaryKey: ['id'])` cho profiles, categories,
  transactions và budgets.
- Chưa thấy Edge Function hoặc RPC nghiệp vụ trong Dart; các luồng household
  nhiều bước đang chạy tuần tự từ client.

## Hàm nghiệp vụ cần giữ khi migrate

- Auth: `restoreSession`, `refreshCurrentSession`, `signInWithEmail`,
  `registerWithEmail`, `signOut`.
- Household: `createHouseholdForProfile`, `joinByInviteCode`,
  `updateHouseholdName`, `transferOwnership`, `leaveHousehold`,
  `deleteHousehold`.
- Transactions: `watchTransactions`, `watchTransactionsByMonth`,
  `fetchTransactionsPage`, `createTransaction`, `updateTransaction`,
  `deleteTransaction`.
- Categories: `watchCategories`, `createCategory`, `updateCategory`,
  `deleteCategory`, kiểm tra tên duy nhất và lấy `sort_order` tiếp theo.
- Budgets: `watchBudgetsByMonth`, `upsertBudget`, `updateDisplayOrders`,
  `findLatestBudgetMonthBefore`, `cloneBudgetMonth`.
- Profile: `watchProfiles`, `fetchProfiles`, `updateUserProfileName`.
- Presentation: tính tổng dashboard, thống kê, view-data giao dịch, clone ngân
  sách và calculator biểu thức số tiền.

## Rủi ro cần xử lý trên web

1. Tạo/xóa household gồm nhiều câu lệnh database nhưng chưa có transaction;
   web nên chuyển thành PostgreSQL RPC để không để lại dữ liệu dở dang.
2. Phân quyền phụ thuộc hoàn toàn vào RLS. Phải export và kiểm tra policy thật
   trước khi kết nối dữ liệu production.
3. Realtime stream hiện tải lại danh sách rộng; web cần giới hạn theo household,
   tháng và dùng invalidation để tránh tăng tải.
4. Schema production chưa được export, nên chưa thể khẳng định local migration
   phản ánh đầy đủ constraint, trigger và policy đang chạy.
5. Không đưa `service_role` key vào Next.js hoặc trình duyệt; anon key chỉ an
   toàn khi RLS đúng.

## Kiểm thử Flutter hiện có

- Calculator biểu thức số tiền.
- Clone ngân sách và thứ tự hiển thị ngân sách.
- Thống kê dashboard.
- Chuyển đổi view-data giao dịch.
- Widget smoke test.
