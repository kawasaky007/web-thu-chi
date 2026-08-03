# Bộ prompt migrate theo từng bước

Mỗi prompt là một đơn vị triển khai độc lập. Chỉ chuyển sang prompt tiếp theo
khi lint, typecheck, test, build và kiểm thử mobile của prompt hiện tại đều đạt.

## Prompt 01 - Nền tảng kỹ thuật (đã hoàn tất)

Khởi tạo Next.js App Router, TypeScript, Tailwind CSS, Vitest, PWA cơ bản,
Forest Finance tokens, tài liệu audit và cấu hình môi trường an toàn. Không kết
nối dữ liệu production và không thay đổi source Flutter.

## Prompt 02 - Design system và app shell (đã hoàn tất)

Tạo component dùng lại cho Button, Input, Select, Card, Sheet/Dialog, Toast,
Empty/Error/Loading state, Currency input và mobile bottom navigation. Tạo route
khung cho auth, dashboard, transactions, categories, budgets và profile. Dùng
tiếng Việt, hỗ trợ màn hình từ 320px, keyboard và reduced motion. Chưa kết nối
Supabase thật.

## Prompt 03 - Schema, generated types và Supabase SSR Auth (đã hoàn tất)

Sau khi Supabase CLI đăng nhập, export schema production ở chế độ chỉ đọc, đối
chiếu với migration Flutter và ghi rõ chênh lệch. Cài Supabase client cho Next.js,
tạo browser/server client, cookie SSR, generated TypeScript types và route guard.
Dùng `.env.local` bị Git ignore, không in secret và không dùng `service_role`.

## Prompt 04 - Luồng đăng nhập và onboarding household (đã hoàn tất)

Migrate đăng nhập, đăng ký, đăng xuất, session restore, tạo household và tham
gia bằng mã mời. Đưa thao tác nhiều bước vào PostgreSQL RPC có transaction và
kiểm tra RLS. Viết test cho thành công, mã mời sai, mất session và quyền bị từ chối.

Đã hoàn thành bằng Supabase SSR Auth và hai RPC production. Policy đọc household
qua invite code đã được khóa lại. Có 30 test đạt, build thành công và kiểm thử
mobile 390 x 844 cho redirect/form/validation mà không tạo dữ liệu test.

## Prompt 05 - Danh mục (đã hoàn tất)

Đã tạo migration thay policy rộng `categories` (`SELECT true`, `INSERT true`)
bằng policy khóa theo household hiện tại cho đủ select/insert/update/delete.
Web đã migrate danh sách danh mục thu/chi, tạo, sửa, xóa, kiểm tra trùng tên,
icon/màu và nút đổi thứ tự hiển thị. Query luôn khóa theo household hiện tại;
unique index database bảo vệ trùng tên giữa các client. Có 36 test đạt, build
thành công và route mobile được kiểm tra không ghi dữ liệu test.

## Prompt 06 - Giao dịch (đã hoàn tất)

Đã migrate thêm/sửa/xóa giao dịch, calculator biểu thức `+ - × ÷ %`, định dạng
VND, lịch sử theo tháng, tìm kiếm, tab tất cả với cursor và summary thu/chi/số
dư. Form mobile có chọn loại, category, thành viên, ngày và ghi chú; Server
Actions kiểm tra category/member cùng household. RLS production đã được thu hẹp
về `authenticated`, delete chỉ cho người thực hiện giao dịch. Có 56 test đạt và
build thành công.

## Prompt 07 - Dashboard và báo cáo (đã hoàn tất)

Đã migrate tổng thu, tổng chi, số dư, thống kê theo danh mục, thành viên, nhịp
ngân sách và biểu đồ CSS mobile-first. RPC `get_dashboard_report` query theo
range có offset Việt Nam, chạy `SECURITY INVOKER` theo household hiện tại và chỉ
trả aggregate cùng tối đa năm giao dịch gần đây; client không tải toàn bộ lịch
sử giao dịch. Có test cho tháng trống, chỉ có thu, chỉ có chi và dữ liệu lớn.

## Prompt 08 - Ngân sách (đã hoàn tất)

Đã migrate ngân sách theo tháng và danh mục chi, upsert, xóa, đổi thứ tự bằng RPC
atomic, tổng đã chi/phần còn lại và clone tháng gần nhất. Policy budgets đã khóa
về `authenticated` + household hiện tại, chỉ nhận danh mục chi tiêu; unique
constraint cũ được giữ nguyên. RPC clone idempotent, không ghi đè tháng đích đã
có dữ liệu và có test cho trường hợp đó.

## Prompt 09 - Hồ sơ và quản trị household (đã hoàn tất)

Đã migrate đổi tên hồ sơ/household, sao chép mã mời, danh sách thành viên,
chuyển chủ, rời household và xóa household. Transfer/leave/delete chạy bằng RPC
transaction có lock và kiểm tra `auth.uid()`; xóa yêu cầu nhập chính xác tên
household, chỉ xóa dữ liệu tài chính chung và giữ tài khoản đăng nhập. Policy
households/profiles trùng lặp đã được gom lại theo role `authenticated`.

## Prompt 10 - PWA nâng cao và kiểm thử phát hành (đã hoàn tất)

Đã thêm nháp giao dịch mới tự động lưu theo người dùng trên thiết bị và tự xóa
sau khi Supabase ghi thành công; khi offline nút submit chuyển thành lưu nháp.
Nháp không chứa token hoặc session. Service worker chỉ cache offline shell,
manifest, icon và `/_next/static`; navigation/RSC/API/Supabase luôn network-only.

Đã thêm update prompt có `SKIP_WAITING`, trạng thái offline, shortcut mở thẳng
`/transactions?new=1`, offline fallback và dọn cache theo prefix riêng. Banner
cài app tùy chỉnh đã được gỡ theo yêu cầu; app vẫn cài được từ menu trình duyệt
nhờ manifest nhưng `beforeinstallprompt` bị chặn để không hiện lời mời tự động.
Sheet có focus trap, focus restore, ID ARIA duy nhất; toàn app có skip link và
reduced-motion. Có 80 unit/component test, 4 Playwright E2E cho auth guard,
manifest, offline fallback và viewport 320px; production build và browser smoke
đều đạt, không ghi dữ liệu production.

## Prompt 11 - Sao lưu và khôi phục dữ liệu (đã hoàn tất)

Đã thêm route `/backup` từ trang cá nhân, xuất toàn bộ giao dịch household thành
JSON hoặc CSV và đặt `Cache-Control: private, no-store`. File giữ ID giao dịch,
category/member ID cùng tên/email để có thể ánh xạ lại; CSV hỗ trợ Unicode, ô có
dấu phẩy/xuống dòng và chống formula injection khi mở bằng bảng tính.

Import đọc và kiểm tra file ngay trên thiết bị, hiển thị số dòng/tổng thu/tổng
chi cùng năm giao dịch mẫu trước khi yêu cầu xác nhận. Server kiểm tra lại schema,
giới hạn 1,5 MB/1.000 dòng, category/member trong household và ghi bằng một batch
`upsert` atomic theo RLS. `ignoreDuplicates` giữ nguyên dữ liệu đã có và làm thao
tác idempotent theo ID backup. Không thêm migration hay dịch vụ trả phí, không
chạy import trên production khi kiểm thử. Có 96 unit/component test và 5 E2E đạt.

## Prompt 12 - Giao dịch định kỳ và nhắc hạn PWA (đã hoàn tất)

Đã thêm route `/recurring` cho CRUD lịch thu/chi theo tuần hoặc tháng, chọn danh
mục/thành viên, khoảng lặp, kỳ tiếp theo và ngày kết thúc. Hai bảng
`recurring_rules`/`recurring_occurrences` bật RLS theo household; category và
member được kiểm tra ở Server Action lẫn policy.

RPC `materialize_due_recurring_transactions` chạy `SECURITY DEFINER` với kiểm
tra `auth.uid()`, khóa rule bằng `FOR UPDATE`, tạo occurrence unique theo rule +
ngày và transaction trong cùng database transaction. Retry, timeout hoặc hai
client chạy đồng thời không sinh bản ghi trùng. RPC xử lý backlog có giới hạn,
dùng ngày Việt Nam và giữ ngày gốc cho chu kỳ tháng, kể cả tháng ngắn.

App shell có badge số lịch đến hạn và manifest có shortcut `/recurring`.
Notifications API nhắc tối đa một lần/ngày trên thiết bị khi PWA được mở; UI nói
rõ không có background push và không thể đánh thức app đã đóng hoàn toàn. Có
109 unit/component test, 6 Playwright E2E, production build và browser smoke
320px đạt mà không ghi dữ liệu test vào production.

## Prompt 13 - Mục tiêu tiết kiệm và quỹ khẩn cấp (đã hoàn tất)

Đã thêm route `/goals` cho mục tiêu chung và quỹ khẩn cấp, gồm target amount,
thời hạn, icon/màu, tiến độ, số tiền còn thiếu và mức đóng góp gợi ý mỗi tháng.
Mục tiêu có thể tạm dừng, tiếp tục, hoàn thành tự động hoặc lưu trữ; mục tiêu
trống mới được xóa vĩnh viễn.

Khoản dành riêng không được ghi thành expense vì vẫn là tài sản của household.
Hai bảng `savings_goals` và `savings_goal_entries` dùng ledger deposit/withdrawal
riêng, bật RLS theo household. RPC `record_savings_goal_entry` khóa goal, kiểm
tra member, chặn rút vượt số dư và idempotent bằng `request_id`, nên retry mạng
không ghi tiền hai lần. RPC `get_savings_goals_report` tính aggregate server-side
và chỉ trả năm biến động gần nhất mỗi mục tiêu.

Header và manifest có điểm truy cập `/goals`. Có 120 unit/component test, 7
Playwright E2E, production build và browser smoke 320px đạt; không tạo dữ liệu
test trên Supabase production.

## Tính năng miễn phí nên bổ sung sau feature parity

- Theo dõi nợ/vay, lịch trả nợ và nhắc kỳ thanh toán.
- Chia khoản chi giữa các thành viên và màn hình quyết toán cuối tháng.
- Backup đầy đủ category/ngân sách và chia file tự động khi vượt 1.000 giao dịch.
- Hàng đợi đồng bộ nhiều giao dịch khi có mạng trở lại.
- Phát hiện ngân sách sắp vượt và gợi ý giới hạn dựa trên dữ liệu lịch sử.
- OCR hóa đơn bằng Tesseract.js chạy trên thiết bị; nên để tùy chọn vì khá nặng.
- Widget hệ điều hành hoặc Web Share để ghi nhanh từ ứng dụng khác.

Các tính năng trên dùng thư viện mã nguồn mở và API trình duyệt, nhưng vẫn phải
tuân theo giới hạn miễn phí của Supabase và khả năng hỗ trợ của từng trình duyệt.
