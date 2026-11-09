# Màn hình giao dịch: filter theo danh mục/thành viên và panel phân tích sống

Ngày viết: 08/11/2026.

## Bối cảnh

Màn hình giao dịch (`/transactions`) hiện gồm `page.tsx` đọc search params →
`getTransactionPageData()` query Supabase → `TransactionsManager` (879 dòng)
render. Filter là URL-driven: mỗi lần toggle là một `<Link>` kéo theo một lần
render lại toàn server.

Mục tiêu người dùng nêu ra là **"nắm rõ tháng đó chi tiêu thế nào"**, với
filter theo **danh mục** và **thành viên**. Khi rà lại code để làm việc đó,
phát hiện 4 lỗi thật — và cả 4 đều đánh thẳng vào đúng mục tiêu này:

1. **Số tổng tháng sai khi tháng có hơn 30 giao dịch.** Query dùng
   `limit = 30` (`src/lib/transactions/data.ts:111`), rồi `summary` cộng dồn
   trên đúng 30 dòng đó (`data.ts:208`). Card "Tóm tắt tháng" đang hiển thị
   tổng của *trang đầu*, không phải tổng của tháng — mà không báo gì.
2. **Tìm kiếm chỉ quét 30 dòng đã tải.** Lọc chạy client-side *sau* khi đã
   cắt (`data.ts:199`). Khoản khớp ở dòng thứ 45 → báo "Không tìm thấy giao
   dịch".
3. **Nút "Tải thêm giao dịch" vô hiệu ở view "Theo tháng".** `hasMore` vẫn
   true nên nút hiện ra, nhưng page bỏ `cursor` khi `view !== "all"`
   (`src/app/(app)/transactions/page.tsx:29`). Giao dịch từ #31 trở đi không
   có cách nào xem được trong view tháng.
4. **Keyset pagination lệch khóa.** Sort theo
   `transaction_date, created_at, id` (`data.ts:116`) nhưng cursor lọc
   `created_at < ?` (`data.ts:129`). Giao dịch nhập muộn cho ngày cũ bị nhảy
   mất ở trang 2 của view "Tất cả".

Gốc chung của cả 4: **trộn "danh sách phân trang" và "số tổng hợp" vào cùng
một query**. Danh sách cần `LIMIT` để nhanh; số tổng cần quét toàn bộ để
đúng. Dashboard đã tách đúng (RPC `get_dashboard_report` aggregate trong
Postgres), màn hình giao dịch thì chưa.

Các vấn đề UI đi kèm:

- Không có filter danh mục. Filter thành viên nằm trong dropdown, đóng lại là
  không biết đang lọc ai (chỉ còn con số `(2)`).
- Search, toggle tháng/tất cả, filter thành viên, month picker nằm ở 4 khối
  riêng → 4 tầng chrome trước giao dịch đầu tiên.
- Card tóm tắt nằm **dưới** danh sách trên mobile: muốn xem tổng tháng phải
  cuộn qua hết giao dịch.
- Dòng giao dịch lấy **tên thành viên** làm dòng đậm nhất; khi lọc 1 người
  thì cả cột lặp lại "Bạn". Dòng phụ hiện **ngày** — đúng cái ngày đã có ở
  header nhóm ngay phía trên (`transaction-manager.tsx:873`) — và **chưa bao
  giờ hiện giờ**, dù đã được yêu cầu ở đợt trước.

## Mục tiêu

- Filter **theo danh mục** (nhiều lựa chọn) và **theo thành viên** (nhiều lựa
  chọn) trong view "Theo tháng", phản hồi **tức thì** không round-trip server.
- Mọi con số hiển thị được tính trên **toàn bộ** giao dịch của tháng theo
  filter đang áp dụng, không phải trên một trang 30 dòng.
- Panel phân tích sống: cơ cấu danh mục, theo thành viên, **so sánh tháng
  trước**, cảnh báo vượt ngân sách — tất cả tính lại theo filter, và **tự khai
  báo đang đo cái gì**.
- Sửa cả 4 lỗi trên, mỗi lỗi có test regression đặt tên theo đúng lỗi.
- Gom tầng chrome lại, đưa số tổng lên trên danh sách.
- Dòng giao dịch: danh mục làm dòng chính, **giờ** + ghi chú làm dòng phụ.

## Ngoài phạm vi (non-goals)

- **Phát hiện giao dịch bất thường theo baseline lịch sử** (khoản cao gấp
  nhiều lần bình thường, ngày chi đột biến). Cần dữ liệu nhiều tháng và phải
  cân ngưỡng; tách sang đợt sau. Đợt này chỉ có 2 loại cảnh báo rẻ: vượt ngân
  sách và danh mục tăng mạnh nhất.
- **Không thêm filter thu/chi cho danh sách.** Thu/chi trở thành công tắc
  *trong panel*, quyết định panel vẽ cơ cấu chi hay cơ cấu thu — giống
  `CategoryChartCard` của Dashboard. Muốn xem riêng thu nhập thì chọn danh
  mục thu.
- **Không đổi view "Tất cả" ngoài việc sửa lỗi #2 và #4.** View đó không có
  panel phân tích (aggregate toàn bộ lịch sử không ai cần và sẽ kéo theo một
  RPC mới).
- **Không migration SQL.** Đợt này không chạm Supabase.
- Không đổi form thêm/sửa giao dịch (chỉ **di chuyển** sang file riêng, không
  đổi logic).

## Quyết định kiến trúc: tải cả tháng, lọc tại chỗ

Ba hướng đã cân:

- **A — RPC server-side có filter**, aggregate trong Postgres giống
  `get_dashboard_report`. Chính xác tuyệt đối, scale vô hạn. Nhưng mỗi lần tap
  chip là một round-trip, và cần migration SQL phải apply thủ công.
- **B — Tải cả tháng về, lọc + tính tại chỗ.** ← **chọn hướng này**
- **C — Hybrid**: RPC cho số tổng, client cho chip. Hai nguồn chân lý nên số
  dễ lệch nhau; phức tạp nhất, lợi ích ít nhất.

Lý do chọn B:

- Quy mô dữ liệu bị chặn tự nhiên bởi "một tháng". Household 2 người, ~100–300
  giao dịch/tháng ≈ 25KB JSON sau khi thu gọn cột.
- Xoá cả 4 lỗi gốc **không cần một dòng SQL nào** — việc apply migration thủ
  công từng là điểm tắc ở đợt thông báo.
- Filter tức thì là khác biệt cảm nhận lớn nhất giữa "có filter" và "giao diện
  thông minh".
- Logic lọc và aggregate thành pure function → test thẳng, không mock Supabase.

Đánh đổi đã nhận: tháng khổng lồ sẽ nặng. Xử lý bằng cap cứng + banner nói rõ
(xem mục "Cap dữ liệu").

## Tầng dữ liệu

Tách hai chế độ, vì chúng có nhu cầu khác nhau về bản chất.

### View "Theo tháng" — `getTransactionsMonthData()`

```ts
type TransactionsMonthData = {
  categories: CategoryOption[];
  members: MemberOption[];
  current: { rows: TransactionView[]; truncated: boolean };
  previous: { rows: TransactionView[]; truncated: boolean } | null;
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
};
```

- Fetch **toàn bộ** giao dịch của tháng hiện tại **và tháng trước**. Cần raw
  rows của tháng trước (không chỉ tổng) để so sánh được **dưới cùng bộ
  filter** — "vợ chi tháng này so với tháng trước".
- `previous = null` khi query tháng trước lỗi → ẩn toàn bộ delta, trang vẫn
  sống.
- `budgetLimits` lấy từ `getBudgetPageData()` nhưng **chỉ lấy `amount`** (hạn
  mức), không lấy `spent`. Số đã chi tự tính từ rows đã có trong tay — chính
  xác hơn và tránh hai nguồn chân lý. `null` khi query ngân sách lỗi → ẩn khối
  cảnh báo ngân sách.
- `select("*")` → chỉ lấy đúng các cột đang dùng, vì giờ tải cả tháng.
- Không phân trang. Nút "Tải thêm giao dịch" **biến mất khỏi view tháng** —
  lỗi #3 tự hết vì tính năng gãy bị bỏ hẳn, không phải vá.

### View "Tất cả" — `getTransactionsAllData()`

Giữ nguyên hành vi hiện tại (danh sách keyset-paginated, filter qua URL,
không panel phân tích), sửa đúng 2 chỗ:

- **Keyset đúng khóa (lỗi #4):** cursor thành khóa ghép
  `(transaction_date, created_at, id)` encode base64url, khớp với `ORDER BY`.
  Điều kiện lọc:
  `transaction_date < d OR (transaction_date = d AND (created_at, id) < (c, i))`
  dựng bằng `.or()`.
- **Search xuống DB (lỗi #2):** resolve trước các `categoryId`/`memberId` khớp
  từ khoá trong JS (đã có sẵn 2 danh sách này), rồi
  `.or("title.ilike.%q%,note.ilike.%q%,category_id.in.(…),user_id.in.(…)")`.
  Giữ đúng 4 trường như search client hiện tại nhưng quét toàn bộ dữ liệu.

### Module pure (không chạm Supabase)

`src/lib/transactions/filters.ts` — gộp luôn `member-filter.ts` hiện tại (26
dòng) vào đây, file cũ bị xoá:

```ts
type TransactionFilter = {
  categoryIds: string[];
  memberIds: string[];
  search: string;
};

applyTransactionFilters(rows: TransactionView[], filter: TransactionFilter): TransactionView[]
parseTransactionFilter(params: URLSearchParams, known: { categoryIds: Set<string>; memberIds: Set<string> }): TransactionFilter
serializeTransactionFilter(filter: TransactionFilter): URLSearchParams
```

- Các chiều filter kết hợp bằng **AND**; trong cùng một chiều là **OR**.
- `parseTransactionFilter` **bỏ qua id không có trong `known`** (URL cũ, sửa
  tay) thay vì throw.
- Giữ tương thích param `member=` cũ đang được dùng.

`src/lib/transactions/analytics.ts`:

```ts
buildTransactionAnalytics(input: {
  current: TransactionView[];      // đã lọc
  currentAll: TransactionView[];   // chưa lọc, cả tháng — cho cảnh báo ngân sách
  previous: TransactionView[] | null;  // đã lọc cùng filter
  filter: TransactionFilter;
  categories: CategoryOption[];
  members: MemberOption[];
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
  panelType: "income" | "expense";
}): TransactionAnalytics
```

```ts
type DeltaKind = "ratio" | "new" | "gone" | "unchanged" | "none";

type CategoryAnalytics = {
  categoryId: string | null;   // null = gom "Danh mục đã xoá"
  name: string;
  color: string;
  icon: string;
  count: number;
  amount: number;
  percent: number;             // 0..1, trong phạm vi cùng panelType
  previousAmount: number | null;
  deltaRatio: number | null;
  deltaKind: DeltaKind;
  deltaLabel: string | null;   // "↑22%", "mới", "không đổi"
};

type MemberAnalytics = {  // cùng hình dạng, thay categoryId bằng userId
  userId: string; name: string; count: number; amount: number;
  percent: number; previousAmount: number | null;
  deltaRatio: number | null; deltaKind: DeltaKind; deltaLabel: string | null;
};

type AnalyticsAlert = {
  kind: "budget-exceeded" | "biggest-increase";
  categoryId: string | null;
  message: string;
  severity: "warning" | "info";
};

type TransactionAnalytics = {
  scopeLabel: string;       // "Ăn uống, Mua sắm · Minh Thư" | "Toàn bộ tháng"
  scopeCount: number;       // số khoản trong filter
  monthCount: number;       // số khoản cả tháng
  income: number;
  expense: number;
  incomeInScope: boolean;   // false → UI hiện "ngoài bộ lọc", không hiện "0"
  expenseInScope: boolean;
  previous: { income: number; expense: number } | null;
  comparable: boolean;      // false → ẩn mọi delta
  categories: CategoryAnalytics[];  // theo panelType, sắp theo amount giảm dần
  members: MemberAnalytics[];
  alerts: AnalyticsAlert[];         // tối đa 3
};
```

`deltaLabel` được dựng **trong module pure** (không ở component) vì logic
tiếng Việt của nó không tầm thường và cần test trực tiếp.

Quy tắc delta:

- `previousAmount > 0` → `deltaKind: "ratio"`, `deltaRatio = (amount - prev) / prev`.
- `previousAmount === 0 && amount > 0` → `"new"`, `deltaRatio = null`,
  label `"mới"`. **Không chia cho 0.**
- `amount === 0 && previousAmount > 0` → `"gone"`.
- `Math.abs(deltaRatio) < 0.005` (tức làm tròn tới phần trăm nguyên ra `0%`)
  → `"unchanged"`, label `"không đổi"`.
- `comparable === false` → mọi mục `"none"`, `deltaLabel = null`.

Định nghĩa các trường dễ hiểu sai:

- `percent` của `CategoryAnalytics` và `MemberAnalytics`: phần của **tổng
  `panelType` trong phạm vi filter**, không phải của cả tháng.
- `scopeCount`: số khoản sau filter, mọi loại. `monthCount`: số khoản cả
  tháng, mọi loại, chưa filter. (UI đọc là `23 / 71 cả tháng`.)
- `incomeInScope`: `true` khi `filter.categoryIds` rỗng, **hoặc** có ít nhất
  một danh mục `type: "income"` trong đó. `expenseInScope` đối xứng. Phân biệt
  này quan trọng: filter loại trừ thu nhập → UI ghi "ngoài bộ lọc"; còn nếu
  tháng **thật sự** không có thu nhập nào thì `incomeInScope` vẫn `true` và UI
  hiện `0` — đó là con số đúng.
- `comparable`: `false` khi `previous === null` (query tháng trước lỗi)
  **hoặc** tháng trước bị cắt bởi cap. Chỉ cần một trong hai là ẩn hết delta.
- `scopeLabel`: ghép tên danh mục đã chọn (nhiều nhất 2 tên, phần còn lại
  thành `+N`) rồi `·` rồi tên thành viên đã chọn. Không filter gì →
  `"Toàn bộ tháng"`.

Quy tắc cảnh báo:

- `budget-exceeded`: chỉ khi `panelType === "expense"`. So **tổng cả household
  của tháng** (`currentAll`) với hạn mức, **không** so theo filter — ngân sách
  là của danh mục, không của từng người; nếu lọc 1 người rồi tính thì sẽ báo
  "chưa vượt" sai. Khi filter đang bật, message ghi rõ:
  `"Ăn uống vượt ngân sách 320.000 đ (tính cả household)"`.
- `biggest-increase`: chỉ khi `comparable`. Danh mục tăng tuyệt đối nhiều nhất
  và mức tăng > 0 → `"Mua sắm tăng mạnh nhất, +1.400.000 đ so với tháng trước"`.
- Tối đa 3 cảnh báo, trong đó nhiều nhất **1** `biggest-increase` (luôn đứng
  cuối). Chỗ còn lại dành cho `budget-exceeded`, sắp theo số tiền vượt giảm
  dần.

## State filter và URL contract

Điểm căng: filter client-side thì tức thì, nhưng URL cần giữ để
share/refresh/back được — mà đổi URL bằng `router.push` là một round-trip
server, đúng thứ ta vừa tránh.

**Quy tắc:** filter state nằm ở `useState` (khởi tạo từ URL), đồng bộ ngược
lên URL bằng `window.history.replaceState` — cách Next.js App Router hỗ trợ
chính thức cho đúng tình huống này. URL vẫn share/refresh/bookmark được nhưng
**không** trigger navigation. Chân lý ở React state; URL là *bản chiếu* của
state, không phải nguồn của state.

| Param | Ý nghĩa | Cách đổi |
|---|---|---|
| `month=YYYY-MM` | tháng đang xem | navigation (`<Link>`) — tháng khác cần dữ liệu khác |
| `view=all` | chuyển view "Tất cả" | navigation |
| `category=id1,id2` | filter danh mục | **replaceState** (view tháng) / navigation (view all) |
| `member=id1,id2` | filter thành viên | **replaceState** (view tháng) / navigation (view all) |
| `q=` | từ khoá | **replaceState** (view tháng, lọc client) / navigation (view all, search ở DB) |
| `panel=income` | panel vẽ cơ cấu thu; mặc định `expense` | **replaceState** |
| `cursor=` | keyset, chỉ view "Tất cả" | navigation |
| `highlight=` | deep-link từ thông báo | giữ nguyên, không vỡ |
| `new=1` | mở form thêm | giữ nguyên |

Quy tắc gọn: **view tháng = client-side tức thì; view "Tất cả" = server-side
navigation.** Sự khác biệt này là có chủ ý, không phải thiếu nhất quán: view
tháng có toàn bộ dữ liệu trong tay nên lọc được tại chỗ, view "Tất cả" thì
không.

## Layout

Vấn đề lớn nhất trên mobile hiện tại: 4 tầng chrome trước giao dịch đầu tiên,
và card tóm tắt nằm dưới danh sách.

Thứ tự mới (mobile, trên xuống):

1. **Thanh tháng + icon search** trên một dòng. Search gập thành icon, bung
   inline khi bấm — thay vì chiếm một dòng thường trực.
2. **Dải tổng 3 ô** luôn hiện: Chi (kèm delta vs tháng trước), Thu, Số khoản
   (`23 / 71 cả tháng` — cho biết đang xem bao nhiêu phần của tháng).
   Ô nào bị filter loại hết thì ghi **`ngoài bộ lọc`**, không hiện số `0`:
   "Thu 0" dễ bị đọc thành "tháng này không có thu nhập", hai chuyện khác nhau.
3. **Chip danh mục**, cuộn ngang, **sắp theo số tiền giảm dần của tháng đang
   xem** (không theo `sort_order`) — tính trên **tổng tiền tuyệt đối cả tháng,
   không phân biệt thu/chi và không theo filter đang bật**, vì chip là filter
   chung cho cả hai loại và thứ tự không được nhảy khi bấm chính nó. Mỗi
   chip: icon + tên + số tiền. Nhờ vậy
   hàng chip tự là một bảng xếp hạng đọc được ngay. Danh mục 0 đ trong tháng
   tụt vào nút `+N` mở sheet toàn bộ danh mục (sheet cũng hiện số tiền).
4. **Chip thành viên** có avatar + tên. Thay hẳn dropdown hiện tại: household
   chỉ 2–4 người, dropdown cho 2 lựa chọn là overkill và gây đúng lỗi "đóng
   lại là không biết đang lọc ai".
5. **Panel phân tích**, gập được, mặc định mở. Header tự khai báo:
   `ĐANG TÍNH TRÊN 23 KHOẢN` + `Ăn uống, Mua sắm · Minh Thư`, kèm công tắc
   Chi/Thu. Dòng tự khai báo này là chi tiết quan trọng nhất của thiết kế: khi
   số liệu đổi theo filter, người dùng phải biết chắc con số đang đo cái gì —
   không thì panel động trở thành nguồn hiểu sai.
   Thân panel: thanh cơ cấu danh mục (bấm vào = toggle filter danh mục đó,
   dùng chung state với chip row), bảng theo thành viên, khối cảnh báo.
6. **Danh sách** nhóm theo ngày. Header nhóm dùng nhãn tương đối: "Hôm nay",
   "Hôm qua", rồi mới đến ngày.

Dòng giao dịch đổi thứ tự thông tin:

- Dòng chính: **tên danh mục** (trước đây là tên thành viên).
- Dòng phụ: **giờ** (`14:32`) + ghi chú — thay cho ngày đang lặp lại header
  nhóm. Đây cũng là yêu cầu "chưa hiện thời gian" từ đợt trước, nay mới làm.
- Tên thành viên **chỉ hiện khi không lọc về một người duy nhất**.

Desktop (≥`xl`): giữ 2 cột — danh sách bên trái, panel phân tích sticky bên
phải (mở rộng hơn, có cả bảng theo thành viên).

Nguyên tắc chung: điều khiển co lại tới mức nhỏ nhất còn đọc được, không gian
dành cho câu trả lời. Thiết kế này gỡ 2 tầng điều khiển (dropdown thành viên,
dòng search) và thêm 2 tầng *nội dung* (dải tổng, panel).

Đánh đổi đã nhận: **sắp chip theo số tiền làm vị trí chip nhảy khi đổi tháng**,
phá muscle memory. Chấp nhận vì ở đây thứ tự *chính là dữ liệu*, và mục tiêu
đã nêu là ưu tiên đọc hiểu hơn tốc độ bấm lại.

## Cap dữ liệu

`MONTH_ROW_CAP = 1500`. Query `.limit(CAP + 1)` để biết có bị cắt, rồi cắt còn
`CAP`. Case thường (~200 giao dịch) ≈ 25KB; worst case ≈ 150–200KB.

- `current.truncated` → banner trên dải tổng: *"Tháng này có hơn 1.500 giao
  dịch. Số liệu tính trên 1.500 khoản gần nhất."* Lỗi #1 chính là *âm thầm*
  tính sai trên 30 khoản, nên nguyên tắc ở đây là **thà ồn ào còn hơn sai im
  lặng**.
- `previous.truncated` → **`comparable = false`, ẩn toàn bộ delta**, thay bằng
  "không đủ dữ liệu so sánh". Delta tính từ dữ liệu thiếu không phải số "hơi
  lệch", nó là số **sai**.
- Banner vẫn hiện khi đang filter: cap áp ở tầng fetch nên filter không cứu
  được.

## Xử lý lỗi

Nguyên tắc: **tính năng phụ không được kéo trang chính chết theo.**

| Tình huống | Hành vi |
|---|---|
| Query tháng hiện tại lỗi | `throw` lên error boundary. **Không** render panel với số 0 — "0 đ" trông y như "không chi gì", sai nghiêm trọng hơn là báo lỗi. |
| Query tháng trước lỗi | Bắt riêng → `previous: null` → `comparable: false`, ẩn delta. Trang sống. |
| Query ngân sách lỗi | `budgetLimits: null` → ẩn cảnh báo ngân sách. Phần còn lại sống. |
| Danh mục đã xoá, giao dịch còn trỏ tới | Gom thành một chip "Danh mục đã xoá" (`categoryId: null`) để vẫn lọc được — tiền không biến mất khỏi tổng. |
| URL có id danh mục/member không tồn tại | `parseTransactionFilter` bỏ qua id lạ, không throw. |
| Filter cho ra 0 kết quả | Empty state kèm nút "Xoá bộ lọc". |

## Kế hoạch test

Phần lớn coverage ở 2 module pure, không mock Supabase.

`src/lib/transactions/filters.test.ts` (thay `member-filter.test.ts`)
- Mọi tổ hợp danh mục × thành viên × search; AND giữa các chiều, OR trong
  chiều.
- `parseTransactionFilter` bỏ id lạ; round-trip
  `serialize` → `parse` giữ nguyên filter.
- Tương thích ngược param `member=` cũ.

`src/lib/transactions/analytics.test.ts`
- `%` cộng lại bằng 100 trong cùng `panelType`; sắp theo amount giảm dần.
- Delta: tăng / giảm / `"unchanged"` / `"new"` khi tháng trước = 0 (**không
  chia cho 0**) / `"gone"`.
- `previous: null` → `comparable: false`, mọi `deltaLabel` là `null`.
- `budget-exceeded` tính trên `currentAll` **chứ không** trên `current` đã
  lọc; message có hậu tố "(tính cả household)" khi filter đang bật.
- `biggest-increase` chọn đúng danh mục tăng tuyệt đối nhiều nhất; không xuất
  hiện khi `comparable: false`.
- Cảnh báo cắt ở 3, ưu tiên `budget-exceeded` theo số tiền vượt giảm dần.
- `incomeInScope: false` khi filter loại hết thu nhập.

`src/components/transactions/transaction-manager.test.tsx`
- Bấm chip danh mục → danh sách và panel đổi; bấm thanh danh mục trong panel
  cho kết quả giống bấm chip (dùng chung state).
- Bấm chip thành viên → đổi.
- Spy `window.history.replaceState` được gọi **và assert `router.push` KHÔNG
  được gọi** — bài test bảo vệ lời hứa "tức thì".
- Banner truncated hiện khi `truncated: true`.
- Dải tổng hiện "ngoài bộ lọc" thay vì "0".
- Dòng giao dịch hiện giờ; ẩn tên thành viên khi lọc đúng 1 người.
- Empty state có nút xoá filter.

**4 test regression, đặt tên theo đúng lỗi** để không ai vô tình làm lại:

1. `summary tính trên toàn bộ tháng kể cả khi có hơn 30 giao dịch`
2. `search tìm được giao dịch nằm ngoài 30 dòng đầu`
3. `view theo tháng không còn nút tải thêm`
4. `keyset giữ được giao dịch nhập muộn cho ngày cũ`

Gate: `pnpm check` (lint + typecheck + toàn bộ test hiện có không hỏng cái
nào).

## File bị tác động

`transaction-manager.tsx` đang 879 dòng và sẽ còn phình thêm, nên tách cùng
lúc:

| File | Việc |
|---|---|
| `src/lib/transactions/filters.ts` | **mới** — gộp `member-filter.ts` |
| `src/lib/transactions/filters.test.ts` | **mới** — gộp `member-filter.test.ts` |
| `src/lib/transactions/member-filter.ts` | **xoá** |
| `src/lib/transactions/member-filter.test.ts` | **xoá** |
| `src/lib/transactions/analytics.ts` | **mới** |
| `src/lib/transactions/analytics.test.ts` | **mới** |
| `src/lib/transactions/data.ts` | sửa: `getTransactionsMonthData`, `getTransactionsAllData`, keyset ghép, search ở DB, thu gọn cột |
| `src/app/(app)/transactions/page.tsx` | sửa: đọc `category`/`panel`, gọi theo view |
| `src/components/transactions/transaction-manager.tsx` | sửa: còn là orchestrator (state + sync URL) |
| `src/components/transactions/transaction-filter-bar.tsx` | **mới** — thanh tháng, search, chip danh mục, chip thành viên, sheet `+N` |
| `src/components/transactions/transaction-summary-strip.tsx` | **mới** — dải 3 ô + banner truncated |
| `src/components/transactions/transaction-analytics-panel.tsx` | **mới** — panel |
| `src/components/transactions/transaction-list.tsx` | **mới** — nhóm theo ngày, dòng giao dịch, nút xoá |
| `src/components/transactions/transaction-form.tsx` | **mới** — **di chuyển thuần**, không đổi logic |

Việc tách `TransactionForm` ra file riêng kéo theo 3 chỗ phải sửa import:
`src/components/app/app-shell.tsx:11`,
`src/components/transactions/transaction-form.test.tsx:4`, và
`src/components/transactions/transaction-manager.test.tsx:4`. Đây là thay đổi
cơ học, cố ý giữ **không đổi một dòng logic nào** để review dễ.

## Rủi ro

- **Payload tăng.** Từ 30 dòng lên cả tháng. Giảm bằng thu gọn cột + cap, và
  đo lại sau khi làm. Nếu một household thật vượt 1500 giao dịch/tháng thì
  banner sẽ nói rõ, và lúc đó mới cân chuyển sang hướng A cho riêng phần
  aggregate.
- **`history.replaceState` + App Router.** Nếu hành vi không như mong đợi
  (URL không cập nhật, hoặc back/forward loạn), phương án thoái lui là
  `router.replace(href, { scroll: false })` — vẫn giữ filter client-side, chỉ
  mất tính "không round-trip" của phần URL. Panel và danh sách vẫn tức thì vì
  chúng đọc từ state, không từ URL.
- **Vị trí chip nhảy khi đổi tháng** (do sắp theo số tiền). Đã nhận; nếu dùng
  thực tế thấy khó chịu thì chuyển sang sắp cố định và hiện số tiền trong chip
  là đủ.
