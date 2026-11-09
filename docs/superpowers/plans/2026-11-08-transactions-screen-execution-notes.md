# Ghi chú thực thi — các quyết định tôi tự ra thay bạn

Ngày: 08-09/11/2026. Plan: `docs/superpowers/plans/2026-11-08-transactions-screen-filters-analytics.md`
Spec: `docs/superpowers/specs/2026-11-08-transactions-screen-filters-analytics-design.md`

12 task, mỗi task một implementer mới + một reviewer mới, cộng một review toàn branch
và một fix wave. Trong quá trình đó tôi phải tự quyết nhiều việc mà plan không trả lời.
Dưới đây là toàn bộ, kèm lý do và cái giá nếu quyết sai — để bạn đảo lại cái nào thấy sai.

**KHÔNG có commit nào.** Working tree là deliverable; bạn review rồi tự commit.

Ruling R5 — gate đổi thành `pnpm --config.verify-deps-before-run=false check`.
Lý do: `.pnpmrc` trỏ `store-dir=/private/tmp/codex-pnpm-store/v11`, thư mục tmp đó
đã bị dọn, nên pnpm coi node_modules lệch store và muốn xoá sạch rồi install lại;
không TTY thì abort (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY). Đã tự tái hiện.
KHÔNG dùng CI=true hay confirmModulesPurge=false vì cả hai cho phép xoá
node_modules thật và cần mạng để dựng lại — đó là môi trường của người dùng, không
phải của tôi. Flag này chỉ bỏ bước kiểm tra lệch store, không chạm node_modules;
đã xác minh `check` đầy đủ xanh 50 file / 232 test. Carry vào mọi dispatch còn lại.
— Nếu sai: không gì, flag là read-only với node_modules.

Ruling R6 — search ở view tháng KHÔNG phân biệt dấu tiếng Việt ("an uong" khớp
"Ăn uống", "đ" khớp "d"). Plan của tôi tự mâu thuẫn ở đây: Review Focus #5 vừa
đòi "an uong" khớp "Ăn uống" vừa nói "như hành vi hiện tại
(toLocaleLowerCase('vi-VN'))" — mà lowercase KHÔNG bỏ dấu, nên hai điều đó không
thể cùng đúng. Chọn bỏ dấu vì đó là thứ người Việt gõ trên điện thoại thật sự
mong đợi, và spec không chốt cách xử lý dấu.
Hệ quả phải ghi nhận: view "Tất cả" (Task 6) search bằng `ilike` ở Postgres nên
VẪN phân biệt dấu; làm nó bỏ dấu cần extension `unaccent` → migration → bị cấm
đợt này. Bất đối xứng này là giới hạn đã biết, phải báo người dùng ở cuối.
— Nếu sai: đổi một hàm normalize trong một file, ~5 phút.

Ruling R7 — Task 12 phải đưa `DELETED_CATEGORY_ID` vào `known.categoryIds` khi
gọi `parseTransactionFilter`. `parseTransactionFilter` cố tình không special-case
hằng này (đúng: nó không nên biết về semantics của danh mục), nên nếu Task 12
dựng `known` chỉ từ danh sách categories thì `__deleted__` bị strip khỏi URL và
filter danh mục đã xoá không sống qua refresh. Carry vào dispatch Task 12.
— Nếu sai: filter danh mục đã xoá không share/refresh được, sửa 1 dòng.

Ruling R8 — plan defect đã được xử lý đúng: danh sách file của Task 1 bỏ sót
`page.tsx`, vốn cũng import `parseMemberFilterParam` từ `member-filter`.
Implementer chuyển verbatim sang filters.ts và repoint. Chấp nhận, không cần sửa.
— Nếu sai: không có rủi ro, typecheck đã xanh.

Ruling R9 — xác nhận implementation ĐÚNG, không cần sửa: totals/categories/members
tính từ `current` (rows đã lọc), `percent` tương đối trong phạm vi filter. Spec chốt
rõ: "`percent`: phần của tổng panelType TRONG PHẠM VI FILTER, không phải của cả
tháng", và mockup khi lọc 2 danh mục hiện đúng 2 thanh 60%/40%. `currentAll` ở Task 2
chỉ phục vụ `monthCount` là đúng — nó sẽ được Task 4 dùng cho cảnh báo vượt ngân sách
(phải tính trên tổng cả household, không theo filter). Carry sang dispatch Task 4 và 10.
— Nếu sai: panel hiện sai tập danh mục khi đang lọc, sửa trong analytics.ts ~20 phút.

Ruling R10 — chấp nhận mở rộng ngoài spec: `scopeLabel` ghép cả từ khoá search, không
chỉ danh mục + thành viên. Spec chỉ nêu danh mục và thành viên, nhưng search CŨNG thu
hẹp phạm vi; nếu header không nói thì nó mô tả sai thứ đang đo — đúng cái failure mode
mà dòng tự khai báo này được thiết kế để chặn. Giữ.
— Nếu sai: bỏ một đoạn ghép chuỗi, 2 phút.
Task 2: review dispatched (sonnet), diff review-task-2.diff (16632 bytes), snapshot taken.
Task 2: review ✅ spec compliant, Task quality Approved, 0 Critical, 0 Important, 5 Minor.

Ruling R11 — id danh mục không xác định được type phải làm CẢ HAI cờ scope thành true.
Reviewer phát hiện: với filter chỉ chứa DELETED_CATEGORY_ID (hoặc id lạ),
categoryById.get() trả undefined nên cả incomeInScope lẫn expenseInScope đều false
→ UI sẽ ghi "ngoài bộ lọc" ở cả hai ô, trong khi danh sách vẫn có tiền thật. Đây là
lỗ do chính công thức trong spec của tôi tạo ra.
Quyết: filter rỗng → cả hai true; ngược lại một cờ là true nếu có id thuộc đúng type
đó HOẶC có id không tra được type (đã xoá / lạ) — vì không tra được type thì KHÔNG
chứng minh được type đó bị loại, mà hai cờ này tồn tại đúng để phân biệt "filter loại
type này" với "tháng không có". Không chứng minh được loại trừ thì không được khẳng
định loại trừ. Cần test. Giao cho Task 3 (task tiếp theo sửa cùng file analytics.ts).
— Nếu sai: lọc riêng danh mục đã xoá sẽ hiện "ngoài bộ lọc" sai ở 2 ô, sửa 1 hàm.

Ruling R12 — giữ các dòng amount=0 cho danh mục/thành viên chỉ có ở tháng trước.
Implementer lo các dòng này làm nhiễu UI. Nhưng spec của tôi định nghĩa
deltaKind "gone" = amount===0 && previousAmount>0, nên nếu KHÔNG append các dòng
đó thì "gone" là code chết, không bao giờ chạy. Vậy chúng là bắt buộc, không phải
over-implementation. deltaRatio = -1 cho "gone" là đúng (-100%).
Hệ quả giao cho Task 10: panel phải render nhóm này khác biệt và có giới hạn —
tối đa 3 dòng, làm mờ, đặt dưới một đường phân cách, và KHÔNG vẽ thanh 0%. Nếu
tháng trước có 15 danh mục mà tháng này còn 2 thì không được đổ 13 dòng 0 vào panel.
Carry vào dispatch Task 10.
— Nếu sai: panel nhiễu khi đổi tháng, chỉnh render ở một component, ~15 phút.

Ruling R13 — cả hai tháng đều 0 → "unchanged" là chấp nhận được, miễn không có NaN.
0/0 không được lọt ra bất kỳ field nào; reviewer được yêu cầu xác minh riêng điểm này.
— Nếu sai: một nhãn "không đổi" hiển thị cho dòng vô nghĩa, vô hại.

Ruling R14 — viết lại test "inert values" của Task 2 là đúng, không phải xoá test.
Test đó pin trạng thái tạm thời mà Task 3 tồn tại để thay thế. Yêu cầu reviewer xác
minh bản thay thế vẫn phủ case "none" qua previous:null và vẫn còn test pin alerts=[].
— Nếu sai: mất một assertion, reviewer sẽ bắt.

Ruling R15 — ƯU TIÊN cảnh báo: budget-exceeded lấp đủ 3 chỗ TRƯỚC, biggest-increase
chỉ được thêm nếu còn chỗ. Implementer làm ngược: luôn giữ riêng 1 chỗ cho
biggest-increase nên khi có >=3 ngân sách vỡ thì chỉ hiện 2.
Spec của tôi viết "Chỗ còn lại dành cho budget-exceeded" — câu này mơ hồ, implementer
đọc thành "increase chiếm chỗ trước". Ý định đúng là ưu tiên ngân sách: budget-exceeded
là severity "warning", biggest-increase là "info"; khi 3 ngân sách cùng vỡ, che một cái
đi để nói "mua sắm tăng mạnh nhất" là đánh đổi sai hướng — warning phải thắng info.
Đưa vào constraints của reviewer làm yêu cầu bắt buộc; nếu code không khớp thì reviewer
sẽ báo spec ❌ và nó vào fix loop (tôi không tự sửa).
— Nếu sai: thứ tự 3 dòng cảnh báo, sửa một hàm sort/slice, ~10 phút.

Ruling R16 — danh mục "new" (tháng trước = 0) ĐƯỢC tính là tăng cho biggest-increase.
Đúng spec ("mức tăng tuyệt đối nhiều nhất và > 0"): danh mục mới có mức tăng tuyệt đối
bằng chính số tiền của nó, và một danh mục mới xuất hiện với 1,4tr đúng là thứ đáng báo
nhất. Giữ.
— Nếu sai: bỏ một điều kiện, 2 phút.
Task 4: review dispatched (sonnet), diff review-task-4.diff (14066 bytes), snapshot taken.
  Reviewer được giao R15 làm yêu cầu bắt buộc — nếu code giữ chỗ cho biggest-increase
  thì phải báo spec ❌ Important, không được bỏ qua.
Task 4: review ❌ spec — 1 Important (alert cap/priority, analytics.ts:55-58), 0 Critical,
  3 Minor. Reviewer xác minh ĐÚNG các điểm then chốt: budget đọc currentAll (không phải
  current), và có test pin điều đó (current=600k dưới hạn mức 1tr, currentAll=1,32tr →
  nếu ai đổi chỗ 2 mảng thì test đổ). Message strings khớp từng ký tự. Cả 5 item coverage có.
Task 4: fix round 1/5 — resume implementer gốc với finding Important + 2 minor cùng file.
  Finding này ĐÚNG như R15 đã dự đoán trước khi review. Implementer đọc brief hợp lý;
  lỗi nằm ở câu chữ spec của tôi, không phải ở họ.
Task 4: fix round 1 implemented (DONE) — budget lấp trước tới 3, biggest-increase chỉ
  thêm nếu còn chỗ và đứng cuối; 2 minor test cũng xong. 44/44 analytics, gate 51/276.
Task 4: re-review dispatched (haiku — diff fix nhỏ 4670 bytes), review-task-4-fix1.diff.
Task 4: re-review — 4/4 finding ADDRESSED, 0 breakage mới, 0 out-of-scope.
  Re-reviewer kiểm chéo tốt: xác nhận budgetSlots và comment sai đã biến mất (grep),
  và chỉ ra test 4-ngân-sách đặt "other" ĐẦU danh sách nên slice không sort sẽ fail —
  tức test thật sự khoá được thứ tự, không chỉ khoá số lượng.
Task 4: complete (no commits per constraint, fix round 1/5, review clean, 1 minor deferred:
  analytics.ts ~336 dòng, có thể tách alerts.ts về sau — không bắt buộc)

Ruling R17 — SỬA shiftMonth trong data.ts (bug production có sẵn, ngoài scope plan
nhưng nằm đúng trên màn hình đang dựng lại). Giao cho Task 6.
Bằng chứng thực nghiệm (tôi tự chạy node, không chỉ suy luận):
  TZ=Asia/Ho_Chi_Minh: shiftMonth("2026-03",+1)="2026-03" (nút tháng sau KHÔNG nhảy),
  ("2026-12",+1)="2026-12", ("2026-03",-1)="2026-01" (lùi 2 tháng), ("2026-05",-1)="2026-03".
  TZ=UTC: đúng cả 5 case.
Nguyên nhân: monthBounds dựng "YYYY-MM-01T00:00:00" KHÔNG có offset; theo ES spec chuỗi
date-time thiếu offset được parse theo giờ LOCAL. shiftMonth rồi new Date(bounds.start)
nên lệch 7 giờ, và setUTCMonth trên ngày 28-31 gây rollover sai tháng.
Vì sao nó chưa bị phát hiện: shiftMonth được transaction-manager.tsx ("use client") gọi,
đúng trên server (UTC) nhưng sai trong trình duyệt người Việt → chỉ sai sau hydrate.
Cách sửa đã có sẵn trong repo: dashboard-view.tsx dùng
  new Date(Date.UTC(year, month-1+delta, 1)) — độc lập múi giờ, ĐÚNG. Dùng dạng này.
formatVietnameseMonth cũng parse naive như vậy → kiểm và sửa cùng cách.
— Nếu sai: đổi 2 hàm thuần trong data.ts có test chạy ở nhiều TZ; rủi ro thấp,
  còn không sửa thì nút chuyển tháng của chính tính năng này hỏng trên máy người dùng.

Ruling R18 — Task 12 phải validate param month trước khi gọi getTransactionsMonthData.
getTransactionsMonthData throw với month sai định dạng, còn page.tsx hiện tại chỉ làm
`readParam(params.month) ?? currentVietnamMonth()` không validate → "?month=rac" sẽ ra
trang lỗi, trong khi hành vi cũ chỉ bỏ filter tháng. Quy định: không khớp /^\d{4}-\d{2}$/
thì fallback về currentVietnamMonth(). Carry vào dispatch Task 12.
— Nếu sai: URL méo cho trang lỗi thay vì tháng hiện tại, sửa 1 dòng ở page.tsx.

Ruling R19 — NÂNG Minor #5 của reviewer lên Important: budgetLimits phải loại entry
amount <= 0. Reviewer đánh Minor vì từ góc nhìn Task 5 đây là "spec chưa chốt", nhưng
tôi có context chéo task: getBudgetPageData phát 1 entry cho MỌI danh mục với amount=0
khi chưa đặt ngân sách (budgets/data.ts:85-90), và Task 4 (đã xong) coi amount là hạn
mức thật → mọi danh mục có bất kỳ khoản chi nào đều sinh cảnh báo "vượt ngân sách".
Tính năng cảnh báo thành nhiễu thuần. Re-review Task 4 còn vô tình xác nhận: test ở đó
dùng other với amount=0 và tính ra overspend=1.
Quyết: 0 nghĩa là "chưa đặt", không phải "hạn mức 0 đồng" → lọc tại nguồn trong
getTransactionsMonthData, giữ semantics ở một chỗ, Task 4 không phải sửa.
— Nếu sai: cảnh báo ngân sách sai hướng; lọc ở data.ts là 1 dòng + 1 test.

Ruling R20 — RỦI RO CÒN LẠI, phải xác minh thật trước khi merge: mock không thực thi cú
pháp PostgREST, nên điều kiện keyset ghép và chuỗi .or() của search chỉ được test bằng
so khớp chuỗi chính xác. Test chứng minh ta SINH ra đúng chuỗi, không chứng minh Postgres
HIỂU chuỗi đó như ý. Đây là giới hạn cố hữu của việc test query builder bằng mock, không
phải lỗi của implementer — họ tự khai báo.
Quyết: không cố sửa bằng cách thêm integration test (sẽ cần chạm DB thật của người dùng,
ngoài phạm vi và ngoài worktree). Đưa vào danh sách xác minh cuối cùng, và BÁO RÕ cho
người dùng là hai thứ này cần một lần thử tay trên Supabase thật: (1) phân trang view
"Tất cả" với một giao dịch nhập muộn cho ngày cũ, (2) search với từ khoá chứa dấu phẩy
và ngoặc.
— Nếu sai: phân trang hoặc search view "Tất cả" sai trên production dù test xanh.

Ruling R21 — FOLD vào Task 12: decodeTransactionCursor chỉ validate kiểu, nên cursor bị
sửa tay (base64url JSON hợp lệ nhưng transactionDate không phải ngày / id không phải uuid)
qua được decode rồi throw ở Postgres → 500, TRONG KHI comment ở data.ts:48 hứa "fallback
về trang 1". Code không giữ lời hứa của chính nó. Thuộc cùng lớp với R18 (validate param
month), nên gộp vào Task 12 — task chịu trách nhiệm hardening các entry point.
— Nếu sai: URL cursor méo cho 500 thay vì trang 1; xác suất thấp (cần sửa tay), fix nhỏ.

Ruling R22 — FOLD vào Task 12: test "search tìm được giao dịch ngoài 30 dòng đầu" dựng 45
row fixture nhưng mock bỏ qua .or() nên test KHÔNG dùng các row đó, chỉ assert chuỗi sinh
ra. Fixture gợi ý một mức phủ mà test không có → gây hiểu sai cho người đọc sau. Bỏ fixture
hoặc ghi comment nói rõ assertion là string-only.
— Nếu sai: test gây hiểu nhầm, không ảnh hưởng hành vi.

Ruling R23 — KHÔNG thêm ô "Còn lại"/"Chênh lệch". Dispatch của tôi tự mâu thuẫn (viết
"Chi/Thu/Còn-lại deltas") nhưng spec chốt 3 ô: Chi, Thu, Số khoản. Implementer theo brief
— đúng. Lý do giữ quyết định này: chênh lệch của một phạm vi ĐÃ LỌC thường vô nghĩa (lọc
toàn danh mục chi thì chênh lệch = -chi), còn ô đếm "23/71 cả tháng" trả lời đúng câu hỏi
mới ("tôi đang xem bao nhiêu phần của tháng"). Dashboard vẫn hiện chênh lệch tháng.
NHƯNG đây là thay đổi NGƯỜI DÙNG THẤY ĐƯỢC: card tóm tắt cũ có "Chênh lệch", dải mới
không. Phải nêu rõ trong báo cáo cuối để người dùng quyết có muốn khôi phục không.
— Nếu sai: thêm 1 ô vào strip, ~15 phút.

Ruling R24 — ngưỡng "không đổi" (0,005) phải được EXPORT từ analytics.ts và import vào
component, không nhân bản. Implementer tự khai đã copy vì analytics không export. Hai
nguồn cho một ngưỡng: sửa analytics thì component lệch âm thầm, đúng loại lỗi rubric gọi
là verbatim duplication of a logic block. Tôi đưa yêu cầu này vào constraints của reviewer
và để review sinh ra finding (giống cách làm với R15 ở Task 4), không tự sửa.
— Nếu sai: một hằng số export thêm, 5 phút.

Ruling R25 — CARRY SANG TASK 12 (thông tin bàn giao, không phải lỗi): accessible name của
nút collapse CHỨA scopeLabel, nên query hàng danh mục theo tên bằng regex không neo sẽ khớp
HAI button. Task 12 phải dùng regex neo đầu, ví dụ /^Ăn uống/. Implementer đã gặp đúng lỗi
này ở lần chạy đầu và tự sửa — đây là loại chi tiết mà implementer Task 12 không có cách
nào tự biết.
— Nếu sai: test Task 12 fail mơ hồ, mất thời gian truy.

Ruling R26 — chấp nhận: hàng "gone" vẫn bấm được và vẫn toggle filter. Bấm vào sẽ cho danh
sách rỗng + panel ghi "ĐANG TÍNH TRÊN 0 KHOẢN" — trung thực và tự giải thích, và người dùng
bỏ chọn được. Nhất quán với nguyên tắc "mọi hàng danh mục là một toggle filter". Không chặn.
— Nếu sai: thêm disabled cho nhóm gone, 5 phút.

Ruling R27 — chấp nhận: chữ delta để màu trung tính. Lý do implementer đưa ra đúng: "tăng"
là xấu với chi nhưng tốt với thu, nên tô đỏ mọi mũi tên lên sẽ sai ở panel Thu. Trung tính
thì không bao giờ sai. Có thể tinh chỉnh theo panelType về sau, không bắt buộc.
— Nếu sai: thêm điều kiện màu theo panelType, 10 phút.

Ruling R28 — Sheet nhận thêm prop eyebrow?: string, default "Nhập nhanh". Phát hiện rộng
hơn Task 11: sheet.tsx:101 hardcode "Nhập nhanh" và có ~14 call site, nên hôm nay dòng đó
đang hiện phía trên cả "Xóa household?", "Rời household?", "Sao chép ngân sách"... Đây là
lỗi copy CÓ SẴN toàn app, không do Task 11. Default giữ nguyên hành vi cũ ở 13 chỗ kia nên
tương thích ngược; chỉ sheet danh mục của Task 11 truyền "Danh mục". KHÔNG sửa copy ở 13
chỗ còn lại — ngoài phạm vi plan; sẽ báo người dùng riêng.
— Nếu sai: một prop optional có default, không ảnh hưởng call site nào.

Ruling R29 — thêm formatCompactMoney vào format.ts cho chip danh mục. Code hiện dùng
formatMoney → "8.000.000 đ", nhưng MOCKUP ĐÃ DUYỆT hiện "3,4tr". Với 6 chip cuộn ngang,
mỗi chip gánh icon + tên + số 9 ký tự thì rất ít chip vào được một bề ngang màn hình —
phá đúng lý do hàng chip được sắp theo số tiền (để đọc được như một bảng xếp hạng).
Ngưỡng: >=1 tỷ → "1,2 tỷ"; >=1tr → "3,4tr"; >=1k → "850k"; còn lại số thường. 1 chữ số
thập phân ở tr/tỷ, bỏ ",0", dấu phẩy thập phân kiểu VN, làm tròn không cắt. Sheet +N vẫn
dùng formatMoney đầy đủ (có chỗ, và số chính xác hữu ích hơn trong danh sách).
— Nếu sai: một hàm format thuần có test biên, đổi lại 5 phút.

Ruling R30 — CARRY SANG TASK 12 (bàn giao từ implementer Task 11): query chip danh mục
bằng regex neo đầu /^Ăn uống/; scope query trong sheet bằng within(dialog); dùng CHUỖI
CHÍNH XÁC "Tháng" cho link view vì match không neo sẽ trúng cả month picker và link
prev/next. Component là fully controlled → parent PHẢI feed filter đã cập nhật trở lại,
nếu không chip sẽ không đổi trạng thái.
— Nếu sai: test Task 12 fail mơ hồ hoặc filter "không phản hồi" do parent không feed lại.

Ruling R31 — concern "import MONTH_ROW_CAP kéo Supabase vào client bundle": ĐÚNG BẢN CHẤT,
  SAI CHI TIẾT. Tôi tự kiểm: data.ts import Supabase TYPE-ONLY nên thư viện không bị kéo;
  nhưng nó có runtime import getBudgetPageData → getDashboardReport, tức code truy vấn
  server vào client bundle. Và transaction-filter-bar.tsx ĐÃ value-import shiftMonth từ
  TRƯỚC Fix 2 → chuyện có sẵn, không do fix này sinh ra.
  Quyết: ĐỂ NGUYÊN. Bundler rất có thể tree-shake export không tham chiếu, và tôi CHƯA ĐO.
  Không mở refactor mới ở cuối plan dựa trên lo ngại chưa đo. Việc dọn rẻ sau: tách
  constants.ts + chuyển shiftMonth/formatVietnameseMonth (helper ngày thuần) ra khỏi data.ts.
  — Nếu sai: client bundle có code server chết; đo bằng build + grep rồi tách, ~30 phút.
Ruling R32 — chấp nhận Fix 9c khác danh sách field tôi đưa: implementer GIỮ categoryColor
  và categoryIcon trong row tháng trước đã thu gọn, vì mergeKeys của analytics đọc chúng từ
  `sample` của tháng trước cho các danh mục "hết" KHÔNG còn trong registry. Danh sách field
  của tôi sai; họ kiểm và sửa lại. Vẫn bỏ được 6 field không ai đọc (~nửa row theo bytes).
  — Nếu sai: danh mục "hết" mất màu/icon trong panel.
Ruling R33 — ghi nhận (không sửa): Fix 12 (hourCycle h23) KHÔNG THỂ fail trên ICU của máy
  này — cả hai cách viết đều resolve về h23 ở đây, nên test của nó là pin chứ không bắt
  regression. Giữ vì nó đúng về spec Intl và vô hại.
Ruling R34 — ghi nhận: lần chạy gate ĐẦU của fix wave bị flake (2 vitest worker-start
  timeout, 930s) do tranh chấp máy trên ổ ngoài; lần chạy lại sạch 13.6s, không đổi code.
  Vitess trên ổ ngoài này dễ vỡ khi chạy đồng thời — cần báo người dùng.
Final fix wave: 9 assertion CŨ bị đổi ở 6 file — phải audit từng cái ở scoped re-review.

---

## Sau khi commit — xác minh R20 (2026-11-09)

Người dùng hỏi "thử tay trên Supabase thật là làm gì". Hoá ra phần lớn làm được mà
KHÔNG cần session đăng nhập: gọi REST API bằng anon key (`NEXT_PUBLIC_`, key công khai)
ở chế độ chỉ đọc. R20 nói "sẽ cần chạm DB thật của người dùng, ngoài phạm vi" — đúng với
integration test trong CI, nhưng sai với một probe đọc chạy tay. Giả định đó làm R20 ở
lại danh sách "chờ người dùng" lâu hơn mức cần thiết.

Ruling R38 — ĐÓNG phần cú pháp của R20 bằng probe chỉ-đọc. Năm chuỗi sinh ra từ
  keysetFilter/searchFilter đều parse: keyset lồng 3 tầng `or(and(or(and())))`, keyset khi
  cursor có created_at null, search chứa `, ( ) \ " % _ *`, và `category_id.in.(…)`.
  RLS chặn anon nên trả `[]` chứ không có dòng nào — nhưng câu hỏi là PARSE, không phải dữ
  liệu, nên `[]` + HTTP 200 là câu trả lời đủ.
  Quan trọng hơn kết quả: probe được chứng minh là FAIL ĐƯỢC — cú pháp vỡ và dấu phẩy
  không bọc nháy đều cho `PGRST100 failed to parse logic tree`. Không có hai ca đó thì
  bảng kết quả chỉ là một probe luôn xanh, đúng bệnh đã bắt ở Task 7.
  — Nếu sai: không sai được; chuỗi hoặc parse hoặc không, và cả hai hướng đã quan sát.

Ruling R39 — kiểu cột (câu (f) của R20) xác định được qua lỗi cast, KHÔNG phải đoán:
  `transactions.transaction_date` và `created_at` đều là `timestamp without time zone`.
  Thước đo được chuẩn hoá trước trên ba cột đã biết kiểu từ migration: savings_goals
  .created_at → "timestamp with time zone", savings_goals.target_date → "date",
  transactions.id → "uuid". Đọc đúng cả ba rồi mới tin kết quả ở hai cột cần biết.
  Hệ quả LÀNH: biên tháng vẫn đúng. vietnamMonthBounds gửi `...T00:00:00+07:00`, Postgres
  cast sang timestamp naive thì BỎ IM offset, còn `2026-11-01 00:00:00`; mà actions.ts ghi
  `toTimestamp(date) = "${date}T00:00:00"` cũng là nửa đêm naive theo ngày VN. Naive so với
  naive → khớp. Cái `+07:00` là nhiễu vô hại, không phải lỗi, không sửa.
  — Nếu sai: đã chuẩn hoá thước đo nên khả năng rất thấp; kiểm lại bằng 1 câu SQL.

Ruling R40 — LỖI THẬT do spec của tôi, đã sửa: created_at là naive + `default now()` nên
  lưu giờ UTC mà không có dấu hiệu nào nói đó là UTC. PostgREST trả `2026-11-09T07:12:33
  .123456`, và theo spec ES chuỗi date-time không offset được parse theo giờ MÁY. Trên máy
  UTC+7: nhập 14:12 hiện 07:12; nhập 22:30 hiện 15:30; nhập 02:00 thì lệch ngày nên ẨN giờ
  luôn. Code cũ (12016b8) chưa bao giờ hiện created_at thành giờ — formatTransactionTime là
  thứ đợt này thêm, nên lỗi này do đợt này sinh ra. Cùng lớp với bug shiftMonth tôi đã bắt
  ở Task 2; tôi bắt ở đó rồi bỏ sót ở đây.
  Quyết: neo vào UTC trong parseDbTimestamp, private trong transaction-list.tsx vì đúng một
  chỗ gọi. Đường backup ghi created_at thì vô tình đã đúng (toISOString() là UTC, Postgres
  bỏ "Z" và giữ lại đúng giờ UTC) → không chạm.
  Hai điều kiện trong helper được thử trước khi viết, không phải phòng xa: nối "Z" vào chuỗi
  ĐÃ có offset cho ra Invalid Date, và dạng chỉ-có-ngày thì spec đã quy định là UTC rồi.
  — Nếu sai (giả sử TimeZone của DB không phải UTC): giờ lệch theo hướng ngược lại; người
  dùng đã kiểm `current_setting('TimeZone')` = UTC trước khi tôi sửa.

Ruling R41 — nguyên nhân gốc của R40 là HÌNH DẠNG FIXTURE, nên sửa ở đó mới là sửa:
  mọi fixture created_at trong transaction-list.test.tsx đều có "Z" — dạng `timestamptz`
  trả về, không phải dạng cột này trả về. Test không sai logic, sai hình dạng input, và
  test sai hình dạng input thì xanh đỏ gì cũng vô nghĩa.
  Thêm một tầng nữa: trên TZ=UTC, "parse local" và "parse UTC" cho CÙNG kết quả, nên test
  chỉ chạy ở UTC không bao giờ fail dù code sai. Vì vậy fixture đổi sang dạng naive VÀ lặp
  qua 4 TZ (dùng lại đúng pattern vi.stubEnv("TZ") của bộ test shiftMonth ở Task 2). Trước
  khi sửa: nhóm TZ=UTC pass sạch 7/7, ba TZ còn lại đổ 15 — ba TZ đó mới là cái test.
  Thêm 1 test cursor dùng dạng naive thật: decodeTransactionCursor vốn đã an toàn
  (CURSOR_DATE_PATTERN có lường phần giờ), nhưng KHÔNG test nào chứng minh — mà nếu nó
  không nhận thì mỗi lần "tải thêm" ở view "Tất cả" lặng lẽ rơi về trang đầu, không lỗi.
  — Nếu sai: không sai; gate 58 file / 452 test xanh (trước đó 427).

Ruling R42 — ghi nhận (KHÔNG sửa): index `(household_id, transaction_date desc, created_at
  desc, id desc)` ở secure_transactions.sql:62 có NULLS FIRST (mặc định của desc), trong khi
  query mới dùng `created_at desc NULLS LAST` để khớp điều kiện keyset. Hai thứ lệch nhau
  nên Postgres không dùng được index cho bước sort. Chưa đau ở vài trăm dòng.
  Quyết: không sửa — fix đúng là một index khớp nulls last, tức migration SQL, thứ đợt này
  cố ý không ship. Báo người dùng.
  — Nếu sai: view "Tất cả" chậm dần khi household nhiều giao dịch; fix là 1 index.

### Còn mở (buộc phải có session đăng nhập — tôi không nhập mật khẩu người dùng)

1. `?view=all` lật tới trang 3: không dòng nào lặp hay mất.
2. Thêm giao dịch ngày tháng trước (hôm nay nhập) → phải nằm đúng trang theo ngày.

Các mục (c) (d) (e) (f) của R20 đã đóng bằng R38/R39.
