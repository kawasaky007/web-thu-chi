# Thu Chi Gia Đình - Web

Web app mobile-first chuyển đổi từ source Flutter `app-thu-chi`, sử dụng Next.js,
TypeScript, Tailwind CSS và Supabase.

## Công nghệ

- Next.js 16 App Router
- React 19 và TypeScript
- Tailwind CSS 4
- Vitest và Testing Library
- PWA service worker, update prompt, offline shell và nháp giao dịch cục bộ
- Xuất/nhập backup giao dịch JSON và CSV ngay trên thiết bị
- Giao dịch định kỳ tuần/tháng và nhắc hạn bằng Notifications API
- Mục tiêu tiết kiệm, quỹ khẩn cấp và ledger đóng/rút riêng
- Playwright E2E trên Chromium mobile
- Supabase SSR Auth với cookie và generated database types

## Chạy local

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Mở `http://localhost:3000`.

## Kiểm tra chất lượng

```bash
pnpm check
pnpm build
pnpm test:e2e
```

## Biến môi trường

Chỉ sử dụng Supabase URL và anon key ở frontend. Không bao giờ đặt
`service_role` key vào `.env.local`, source code hoặc trình duyệt.

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

File `.env.local` bị Git bỏ qua. Bảo mật dữ liệu phụ thuộc vào Supabase Row
Level Security, không phụ thuộc vào việc giấu anon key.

## Đăng nhập Google và Apple

Màn hình `/login` đã hỗ trợ OAuth qua Supabase. Cần bật từng provider trong
Supabase Dashboard tại `Authentication > Providers`, sau đó thêm callback URL
của web app tại `Authentication > URL Configuration`:

```text
http://localhost:3000/auth/callback
https://your-domain.example/auth/callback
```

Google cần OAuth Client ID/Secret trong Google Cloud; Apple cần Services ID,
Team ID, Key ID và Sign in with Apple private key trong Apple Developer. Với cả
hai provider, redirect URI phía Google/Apple là callback của Supabase:

```text
https://your-project-ref.supabase.co/auth/v1/callback
```

Không đưa client secret, Apple private key hoặc `service_role` key vào
`.env.local`, source code hay trình duyệt.

## Trạng thái migration

Prompt 01-13 đã hoàn thành phần nền tảng kỹ thuật, design system, app shell, PWA
nâng cao, Supabase SSR Auth, household onboarding, danh mục, giao dịch và
dashboard/báo cáo, ngân sách, hồ sơ và quản trị household. Luồng
đăng nhập, household, CRUD danh mục và CRUD giao dịch đã dùng dữ liệu production
thật; thao tác onboarding chạy qua PostgreSQL RPC có transaction.

Generated types phản ánh chín bảng và mười ba function đang công khai trong schema
production. Mười một migration của web đã được đẩy lên project hiện tại để thêm RPC
onboarding/dashboard/budget, khóa household/categories/transactions/budgets theo
household hiện tại và tối ưu truy vấn theo ngày.

Đã query trực tiếp production để xác nhận năm bảng gốc đều bật RLS và kiểm tra
policy cần cho Prompt 04-06. Hai bảng recurring mới cũng bật RLS ngay trong
migration đã áp dụng. Categories và transactions đều có policy
household-specific; transactions có unique cursor/index theo ngày và 286 bản ghi
production đã được kiểm tra không có liên kết mồ côi.
Full SQL dump vẫn chưa có vì máy thiếu Docker/`pg_dump`, nên trigger, grant ngoài
phần đã query và Realtime publication chưa được coi là đã audit đầy đủ.

Service worker chỉ cache offline shell, icon và asset build tĩnh; không cache
HTML, RSC, API hoặc response Supabase chứa dữ liệu tài chính. Form giao dịch mới
tự lưu nháp theo người dùng vào localStorage, không chứa token và xóa sau khi
đồng bộ thành công. Manifest có shortcut thêm giao dịch và xem ngân sách.

Trang `/backup` cho phép tải JSON hoặc CSV với header `no-store`, xem trước file
trên thiết bị và chỉ gửi payload sau khi người dùng xác nhận. Import kiểm tra toàn
bộ category/member trước khi ghi, chạy một batch atomic theo RLS và dùng ID gốc
để bỏ qua giao dịch đã tồn tại thay vì ghi đè.

Trang `/recurring` quản lý lịch thu/chi theo tuần hoặc tháng. RPC
`materialize_due_recurring_transactions` khóa rule, dùng unique occurrence theo
`(rule_id, due_date)` và tạo transaction trong cùng database transaction nên an
toàn khi retry hoặc có nhiều client cùng bấm. Ngày đến hạn dùng múi giờ Việt Nam;
tháng ngắn tự lùi về ngày cuối tháng. Nút chuông app shell có badge số lịch đến
hạn. Notifications API chỉ nhắc khi PWA được mở, tối đa một lần/ngày trên từng
thiết bị; không dùng push service và không thể đánh thức app đã đóng hoàn toàn.

Trang `/goals` quản lý mục tiêu tích lũy và quỹ khẩn cấp mà không ghi sai thành
chi tiêu. Số dư được tính từ ledger `deposit`/`withdrawal`; RPC khóa goal, chặn
rút âm và dùng `request_id` để retry không ghi tiền hai lần. Report aggregate
chỉ trả số dư, số entry và năm biến động gần nhất cho từng mục tiêu. UI có tiến
độ, thời hạn, mức đóng góp gợi ý theo tháng, tạm dừng, hoàn thành và lưu trữ.

Kiểm tra hiện tại: 120 unit/component test và 7 Playwright E2E đạt, production
build thành công; auth guard giữ đúng shortcut, offline fallback hoạt động,
backup/API, recurring và goals fail closed khi chưa đăng nhập, viewport 320px không
tràn ngang và browser console không có warning/error. Bộ
kiểm thử không đăng nhập hoặc ghi dữ liệu test vào Supabase production.

Tài liệu bàn giao:

- `docs/flutter-audit.md`: tính năng, API Supabase, hàm nghiệp vụ và rủi ro cần xử lý.
- `docs/ai-migration-prompts.md`: các prompt nhỏ để migrate tuần tự.
- `docs/migration-map.md`: bản đồ feature Flutter sang web.
- `docs/supabase-schema-audit.md`: đối chiếu schema production với migration Flutter.
- `supabase/README.md`: trạng thái schema và Supabase CLI.
