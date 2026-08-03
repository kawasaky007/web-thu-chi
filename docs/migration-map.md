# Bản đồ migration Flutter sang web

## Nguyên tắc

- Giữ nguyên Supabase project và dữ liệu hiện tại.
- Đạt đủ tính năng Flutter trước khi bổ sung tính năng mới.
- Mobile-first; tablet và desktop chỉ mở rộng bố cục.
- Nghiệp vụ nhiều bước phải dùng PostgreSQL RPC có transaction.
- RLS là lớp bảo vệ bắt buộc cho mọi bảng.

## Feature parity

| Flutter | Web dự kiến |
| --- | --- |
| Auth email/password | Supabase SSR Auth + cookie |
| Household onboarding | Server Action + RPC |
| Dashboard | Aggregate RPC theo tháng |
| Transactions | Server Actions + cursor pagination |
| Categories | CRUD theo household |
| Budgets | CRUD, reorder và clone tháng |
| Profile | Hồ sơ và quản trị household |
| PWA | Install/update prompt, offline shell và local draft |
| Backup | Export/import giao dịch JSON và CSV theo RLS |
| Tính năng web bổ sung | Giao dịch định kỳ tuần/tháng, materialize chống trùng và nhắc hạn PWA |
| Tính năng web bổ sung | Mục tiêu tiết kiệm, quỹ khẩn cấp và ledger đóng/rút idempotent |

## Thứ tự triển khai

1. Nền tảng kỹ thuật.
2. Design system Forest Finance.
3. Supabase schema, generated types, SSR Auth và RLS.
4. Household onboarding.
5. Danh mục và giao dịch.
6. Dashboard và báo cáo.
7. Ngân sách và hồ sơ.
8. PWA nâng cao, offline draft và kiểm thử phát hành.
9. Sao lưu/khôi phục giao dịch với preview và chống nhập trùng.
10. Giao dịch định kỳ, RPC ghi kỳ đến hạn và Notifications API.
11. Mục tiêu tiết kiệm, quỹ khẩn cấp và aggregate ledger server-side.

Chi tiết prompt có thể dùng trực tiếp nằm tại `docs/ai-migration-prompts.md`.
Danh sách API và hàm Flutter nằm tại `docs/flutter-audit.md`.
