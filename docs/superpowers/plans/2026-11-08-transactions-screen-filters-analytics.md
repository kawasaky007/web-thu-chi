# Màn hình giao dịch: filter danh mục/thành viên + panel phân tích — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép lọc giao dịch theo danh mục và thành viên với phản hồi tức thì, và hiển thị số liệu phân tích tính trên toàn bộ tháng theo filter đang áp dụng — đồng thời sửa 4 lỗi khiến số tổng, tìm kiếm và phân trang hiện đang sai.

**Architecture:** View "Theo tháng" tải toàn bộ giao dịch của tháng hiện tại và tháng trước về server component, rồi lọc và tính tổng hoàn toàn ở client bằng pure function; filter state nằm ở `useState` và chỉ chiếu lên URL qua `window.history.replaceState` nên không có round-trip. View "Tất cả" giữ nguyên mô hình server-side navigation, chỉ sửa keyset cursor và đẩy search xuống DB. Không có migration SQL.

**Tech Stack:** Next.js 16.2.12 App Router, React 19.2.4, TypeScript, Tailwind CSS 4, Supabase (`@supabase/ssr`), Vitest 4 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-transactions-screen-filters-analytics-design.md`

## Global Constraints

- **KHÔNG commit, KHÔNG `git add`, KHÔNG push ở bất kỳ task nào.** Người dùng tự review rồi tự commit. Bước cuối mỗi task là chạy `pnpm check` và báo cáo kết quả.
- `pnpm` cần Node ≥ v22.13. Mỗi shell mới phải prefix: `export PATH="$HOME/.nvm/versions/node/v24.17.0/bin:$PATH"`.
- Gate của mọi task: `pnpm check` (= `pnpm lint && pnpm typecheck && pnpm test`). Không được làm hỏng bất kỳ test nào trong 50 file test hiện có.
- **Không tạo, không sửa, không apply file nào trong `supabase/migrations/`.** Đợt này không chạm database.
- `MONTH_ROW_CAP = 1500`.
- Mọi xử lý ngày dùng timezone `Asia/Ho_Chi_Minh`. Tiền định dạng qua `Intl.NumberFormat("vi-VN")`.
- Toàn bộ copy hiển thị bằng tiếng Việt. Comment trong code giải thích **tại sao**, không mô tả lại code đang làm gì.
- **React 19 + Testing Library:** khi test gọi trực tiếp một callback đã capture (ví dụ handler của Realtime hay của một prop), phải bọc trong `act(() => { ... })`, nếu không test sẽ fail với cảnh báo về `act`.
- **Testing Library `getByText` chỉ ghép các text node con trực tiếp của một element.** Chuỗi trải qua `<span>` lồng nhau sẽ không khớp — phải tách thành nhiều assertion hoặc dùng `{ exact: false }` trên đúng element chứa text.
- ESLint của repo bật `react-hooks/set-state-in-effect`: không gọi `setState` trong `useEffect` nếu giá trị đã có thể khởi tạo trực tiếp từ prop.

## Review Focus

Năm lớp input mà spec hàm ý nhưng không task nào tự nhiên test tới, xếp theo mức dễ gây đau nhất trước. Mỗi dòng đã được gắn test vào task sở hữu code tương ứng.

1. **Tháng không có giao dịch nào.** `percent` chia cho tổng = 0; `scopeLabel`, panel và dải tổng phải ra số 0 hợp lệ thay vì `NaN`. → test ở Task 2.
2. **`created_at` là `null`** (cột nullable trong DB). Keyset cursor encode/decode và thứ tự sắp phải không vỡ. → test ở Task 6.
3. **`transaction_date` ở biên múi giờ** — ngày 1 của tháng lúc `00:00+07`. Phải thuộc đúng tháng đó, không lọt sang tháng trước. → test ở Task 5.
4. **Cả tháng chỉ có một danh mục duy nhất**, và tháng trước danh mục đó = 0. `percent` phải ra 100, delta phải ra `"new"` chứ không chia cho 0. → test ở Task 2 và Task 3.
5. **Search khác hoa thường và có dấu tiếng Việt.** "an uong" vs "Ăn uống" vs "ĂN UỐNG" phải cho cùng kết quả như hành vi hiện tại (`toLocaleLowerCase("vi-VN")`). → test ở Task 1.

---

## Task 1: Filter model và URL contract

**Files:**
- Create: `src/lib/transactions/filters.ts`
- Create: `src/lib/transactions/filters.test.ts`
- Delete: `src/lib/transactions/member-filter.ts`
- Delete: `src/lib/transactions/member-filter.test.ts`
- Modify: `src/components/transactions/transaction-manager.tsx:46-50` (đổi đường dẫn import sang `filters`)

**Interfaces:**
- Consumes: `TransactionView` từ `@/lib/transactions/data`.
- Produces:

```ts
export type TransactionFilter = { categoryIds: string[]; memberIds: string[]; search: string };
export const EMPTY_TRANSACTION_FILTER: TransactionFilter;
export function applyTransactionFilters(rows: TransactionView[], filter: TransactionFilter): TransactionView[];
export function parseTransactionFilter(
  params: URLSearchParams,
  known: { categoryIds: Set<string>; memberIds: Set<string> },
): TransactionFilter;
export function serializeTransactionFilter(filter: TransactionFilter): URLSearchParams;
export function toggleFilterId(selected: string[], id: string): string[];
export function isTransactionFilterEmpty(filter: TransactionFilter): boolean;
export const DELETED_CATEGORY_ID = "__deleted__";
```

  Đồng thời **giữ nguyên, chuyển nguyên văn** từ `member-filter.ts` ba symbol đang được `transaction-manager.tsx` dùng, để repo không vỡ ở task này: `TransactionsFilterState`, `buildTransactionsHref`, `toggleMemberFilter`. Task 12 sẽ xoá chúng khi không còn ai dùng.

- [ ] **Step 1: Viết test fail**

Chuyển toàn bộ test hiện có trong `member-filter.test.ts` sang `filters.test.ts` không đổi nội dung, rồi thêm:

```ts
const rows = [
  row({ id: "a", categoryId: "food", userId: "u1", title: "Ăn uống", note: "Cơm trưa" }),
  row({ id: "b", categoryId: "shop", userId: "u2", title: "Mua sắm", note: null }),
  row({ id: "c", categoryId: "food", userId: "u2", title: "Cà phê", note: null }),
];

it("không filter thì trả về nguyên danh sách", ...)            // → 3 dòng
it("lọc nhiều danh mục theo OR trong cùng chiều", ...)         // categoryIds: ["food","shop"] → 3
it("kết hợp các chiều bằng AND", ...)                          // categoryIds:["food"], memberIds:["u2"] → ["c"]
it("search khớp title, note, tên danh mục và tên thành viên", ...)
it("search không phân biệt hoa thường và dấu tiếng Việt", ...) // "AN UONG", "ăn uống", "Ăn Uống" → cùng kết quả
it("parseTransactionFilter bỏ qua id không có trong known", ...)
it("parseTransactionFilter đọc được param member cũ", ...)
it("serialize rồi parse lại cho ra filter y nguyên", ...)
it("toggleFilterId thêm rồi bỏ cùng một id", ...)
it("isTransactionFilterEmpty đúng với filter rỗng và sai khi có search", ...)
```

Dùng helper `row()` dựng `TransactionView` tối thiểu trong chính file test.

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/filters.test.ts`
Expected: FAIL — không resolve được `./filters`.

- [ ] **Step 3: Implement `src/lib/transactions/filters.ts`**

Search so khớp bằng `toLocaleLowerCase("vi-VN")` trên 4 trường `title`, `note`, `categoryName`, `memberName` — giữ đúng hành vi của `data.ts:199` hiện tại, chỉ đổi chỗ đặt. `categoryIds` chứa `"__deleted__"` để đại diện cho `categoryId` rỗng (danh mục đã xoá); hằng này export tên `DELETED_CATEGORY_ID`.

- [ ] **Step 4: Xoá `member-filter.ts` và `member-filter.test.ts`, đổi import trong `transaction-manager.tsx`**

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

Expected: PASS toàn bộ.

---

## Task 2: Analytics — tổng, cơ cấu danh mục và thành viên

**Files:**
- Create: `src/lib/transactions/analytics.ts`
- Create: `src/lib/transactions/analytics.test.ts`

**Interfaces:**
- Consumes: `TransactionFilter`, `DELETED_CATEGORY_ID` (Task 1); `TransactionView`, `CategoryOption`, `MemberOption` từ `data.ts`.
- Produces:

```ts
export type DeltaKind = "ratio" | "new" | "gone" | "unchanged" | "none";

export type CategoryAnalytics = {
  categoryId: string | null; name: string; color: string; icon: string;
  count: number; amount: number; percent: number;
  previousAmount: number | null; deltaRatio: number | null;
  deltaKind: DeltaKind; deltaLabel: string | null;
};

export type MemberAnalytics = {
  userId: string; name: string; count: number; amount: number; percent: number;
  previousAmount: number | null; deltaRatio: number | null;
  deltaKind: DeltaKind; deltaLabel: string | null;
};

export type AnalyticsAlert = {
  kind: "budget-exceeded" | "biggest-increase";
  categoryId: string | null; message: string; severity: "warning" | "info";
};

export type TransactionAnalytics = {
  scopeLabel: string; scopeCount: number; monthCount: number;
  income: number; expense: number;
  incomeInScope: boolean; expenseInScope: boolean;
  previous: { income: number; expense: number } | null;
  comparable: boolean;
  categories: CategoryAnalytics[]; members: MemberAnalytics[];
  alerts: AnalyticsAlert[];
};

export type AnalyticsInput = {
  current: TransactionView[];
  currentAll: TransactionView[];
  previous: TransactionView[] | null;
  filter: TransactionFilter;
  categories: CategoryOption[];
  members: MemberOption[];
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
  panelType: "income" | "expense";
};

export function buildTransactionAnalytics(input: AnalyticsInput): TransactionAnalytics;

export type CategoryChipEntry = {
  categoryId: string | null; name: string; color: string; icon: string; amount: number;
};
export function buildCategoryChipOrder(
  categories: CategoryOption[],
  allRows: TransactionView[],
): CategoryChipEntry[];
```

Task này chỉ làm tới `percent`/`scopeLabel`/`members`/`categories`. Các trường `previousAmount`, `deltaRatio`, `deltaKind`, `deltaLabel`, `comparable`, `previous` trả về giá trị "không so sánh" (`null` / `"none"` / `false`); Task 3 mới điền. `alerts` trả `[]`; Task 4 mới điền.

- [ ] **Step 1: Viết test fail**

```ts
it("tổng thu và chi tính trên toàn bộ danh sách truyền vào", ...)
it("scopeCount là số khoản sau filter, monthCount là số khoản cả tháng", ...)
it("categories chỉ gồm panelType đang chọn và sắp theo amount giảm dần", ...)
it("percent của categories cộng lại bằng 1", ...)
it("tháng chỉ có một danh mục thì percent bằng 1", ...)          // Review Focus #4
it("tháng không có giao dịch nào trả về số 0, không NaN", ...)    // Review Focus #1
it("gom giao dịch có categoryId rỗng thành mục Danh mục đã xoá", ...)
it("members sắp theo amount giảm dần và percent theo tổng panelType", ...)
it("incomeInScope false khi filter chỉ gồm danh mục chi", ...)
it("incomeInScope true khi không filter danh mục", ...)
it("scopeLabel là Toàn bộ tháng khi không filter", ...)
it("scopeLabel ghép tối đa 2 tên danh mục rồi +N", ...)
it("buildCategoryChipOrder sắp theo tổng tuyệt đối cả tháng, không phân biệt thu chi", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/analytics.test.ts`
Expected: FAIL — không resolve được `./analytics`.

- [ ] **Step 3: Implement `buildTransactionAnalytics` và `buildCategoryChipOrder`**

`percent`: khi tổng `panelType` bằng 0 thì trả `0` cho mọi mục (không chia). `incomeInScope` = `filter.categoryIds.length === 0 || filter.categoryIds.some(id => category(id)?.type === "income")`; `expenseInScope` đối xứng.

- [ ] **Step 4: Chạy test**

Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 3: Analytics — so sánh tháng trước

**Files:**
- Modify: `src/lib/transactions/analytics.ts`
- Modify: `src/lib/transactions/analytics.test.ts`

**Interfaces:**
- Consumes: mọi type của Task 2.
- Produces: không thêm export mới. Điền `previous`, `comparable`, và 4 trường delta trên `CategoryAnalytics`/`MemberAnalytics`.

`AnalyticsInput` nhận thêm một trường:

```ts
previousTruncated: boolean;   // true → comparable = false
```

- [ ] **Step 1: Viết test fail**

```ts
it("deltaKind ratio và deltaRatio đúng khi tháng trước lớn hơn 0", ...)   // 100 → 122 ⇒ 0.22, "↑22%"
it("deltaKind new khi tháng trước bằng 0 và deltaRatio là null", ...)     // Review Focus #4, không chia cho 0
it("deltaKind gone khi tháng này bằng 0 và tháng trước lớn hơn 0", ...)
it("deltaKind unchanged khi lệch dưới 0.5 phần trăm", ...)                // 1000 → 1004 ⇒ "không đổi"
it("previous null thì comparable false và mọi deltaLabel là null", ...)
it("previousTruncated true thì comparable false", ...)
it("delta của members tính cùng quy tắc với categories", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/analytics.test.ts`
Expected: FAIL ở các test delta mới.

- [ ] **Step 3: Implement quy tắc delta**

`comparable = previous !== null && !previousTruncated`. Thứ tự xét: `comparable === false` → `"none"`; `previousAmount === 0 && amount > 0` → `"new"`; `amount === 0 && previousAmount > 0` → `"gone"`; `Math.abs(deltaRatio) < 0.005` → `"unchanged"`; còn lại `"ratio"`.

`deltaLabel` dựng ở đây (không ở component) vì logic tiếng Việt cần test trực tiếp: `"ratio"` → `"↑22%"` / `"↓8%"` làm tròn phần trăm nguyên; `"new"` → `"mới"`; `"gone"` → `"hết"`; `"unchanged"` → `"không đổi"`; `"none"` → `null`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 4: Analytics — cảnh báo

**Files:**
- Modify: `src/lib/transactions/analytics.ts`
- Modify: `src/lib/transactions/analytics.test.ts`

**Interfaces:**
- Consumes: `AnalyticsAlert`, `AnalyticsInput` (có `budgetLimits`, `currentAll`, `filter`).
- Produces: không thêm export mới. Điền `alerts`.

- [ ] **Step 1: Viết test fail**

```ts
it("cảnh báo vượt ngân sách tính trên currentAll chứ không trên current đã lọc", ...)
```
Test này là trọng tâm của task: `currentAll` có 2 người cùng chi danh mục `food` tổng 1.320.000 với hạn mức 1.000.000, `filter.memberIds = ["u1"]` khiến `current` chỉ còn 600.000. Phải vẫn ra cảnh báo vượt 320.000.

```ts
it("message có hậu tố tính cả household khi filter đang bật", ...)
it("message không có hậu tố đó khi không filter", ...)
it("không cảnh báo ngân sách khi panelType là income", ...)
it("budgetLimits null thì không có cảnh báo ngân sách", ...)
it("biggest-increase chọn danh mục tăng tuyệt đối nhiều nhất", ...)
it("không có biggest-increase khi comparable false", ...)
it("không có biggest-increase khi không danh mục nào tăng", ...)
it("tối đa 3 cảnh báo, nhiều nhất 1 biggest-increase và nó đứng cuối", ...)
it("cảnh báo ngân sách sắp theo số tiền vượt giảm dần", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/analytics.test.ts`
Expected: FAIL ở các test alert mới.

- [ ] **Step 3: Implement `alerts`**

Copy chính xác:
- `budget-exceeded`, `severity: "warning"`: `"{Tên danh mục} vượt ngân sách {số tiền} đ"`, cộng thêm `" (tính cả household)"` khi `!isTransactionFilterEmpty(filter)`.
- `biggest-increase`, `severity: "info"`: `"{Tên danh mục} tăng mạnh nhất, +{số tiền} đ so với tháng trước"`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 5: Data layer — view theo tháng

**Files:**
- Modify: `src/lib/transactions/data.ts`
- Modify: `src/lib/transactions/data.test.ts` (tạo nếu chưa có file test cho `data.ts`)

**Interfaces:**
- Consumes: `getBudgetPageData(supabase, householdId, month)` từ `@/lib/budgets/data` (lấy **chỉ** `budgets[].categoryId` và `budgets[].amount`, **không** lấy `spent`).
- Produces:

```ts
export const MONTH_ROW_CAP = 1500;

export type TransactionsMonthData = {
  categories: CategoryOption[];
  members: MemberOption[];
  current: { rows: TransactionView[]; truncated: boolean };
  previous: { rows: TransactionView[]; truncated: boolean } | null;
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
};

export async function getTransactionsMonthData(
  supabase: SupabaseClient<Database>,
  options: { householdId: string; currentUserId: string; month: string },
): Promise<TransactionsMonthData>;
```

Tháng trước lấy qua `shiftMonth(month, -1)` đã có trong `data.ts` — không cần hàm mới.

`getTransactionPageData` **giữ nguyên** ở task này — `page.tsx` còn dùng tới Task 12.

- [ ] **Step 1: Viết test fail**

Mock `SupabaseClient` bằng builder object trả về data đặt trước (theo khuôn mock đã dùng ở `src/lib/budgets/data.test.ts`).

```ts
it("lấy toàn bộ giao dịch của tháng, không giới hạn 30 dòng", ...)   // 45 rows → current.rows dài 45
it("truncated true khi DB trả về nhiều hơn MONTH_ROW_CAP", ...)      // CAP+1 rows → dài CAP, truncated true
it("truncated false khi vừa đúng MONTH_ROW_CAP", ...)
it("giao dịch ngày 1 lúc 00:00+07 thuộc đúng tháng đó", ...)         // Review Focus #3
it("previous null khi query tháng trước lỗi, current vẫn có dữ liệu", ...)
it("budgetLimits null khi query ngân sách lỗi, current vẫn có dữ liệu", ...)
it("budgetLimits chỉ gồm categoryId và amount", ...)
it("throw khi query tháng hiện tại lỗi", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/data.test.ts`
Expected: FAIL — `getTransactionsMonthData` chưa tồn tại.

- [ ] **Step 3: Implement `getTransactionsMonthData`**

4 query song song qua `Promise.all`: tháng hiện tại, tháng trước, categories, profiles; cộng thêm `getBudgetPageData`. Query tháng trước và query ngân sách bọc trong `.catch()` riêng để lỗi của chúng không làm vỡ cả hàm — đây là nguyên tắc "tính năng phụ không kéo trang chính chết theo" của spec. Query giao dịch dùng `.limit(MONTH_ROW_CAP + 1)` và thay `select("*")` bằng danh sách cột đang thật sự dùng để dựng `TransactionView`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 6: Data layer — view "Tất cả": keyset ghép và search ở DB

**Files:**
- Modify: `src/lib/transactions/data.ts`
- Modify: `src/lib/transactions/data.test.ts`

**Interfaces:**
- Consumes: `TransactionFilter` (Task 1).
- Produces:

```ts
export type TransactionsAllData = {
  categories: CategoryOption[]; members: MemberOption[];
  rows: TransactionView[]; nextCursor: string | null; hasMore: boolean;
};

export async function getTransactionsAllData(
  supabase: SupabaseClient<Database>,
  options: { householdId: string; currentUserId: string; filter: TransactionFilter; cursor?: string },
): Promise<TransactionsAllData>;

export type TransactionCursor = { transactionDate: string; createdAt: string | null; id: string };
export function encodeTransactionCursor(cursor: TransactionCursor): string;
export function decodeTransactionCursor(value: string): TransactionCursor | null;
```

- [ ] **Step 1: Viết test fail**

```ts
it("keyset giữ được giao dịch nhập muộn cho ngày cũ", ...)
```
Đây là test regression cho lỗi #4. Dựng: trang 1 kết thúc ở dòng `transaction_date = "2026-10-20"`, `created_at = "2026-10-20T01:00:00Z"`. Trang 2 phải vẫn lấy được dòng `transaction_date = "2026-10-19"` nhưng `created_at = "2026-11-05T09:00:00Z"` (nhập muộn). Assert điều kiện `.or()` được dựng theo khóa ghép, không phải `created_at < cursor`.

```ts
it("search tìm được giao dịch nằm ngoài 30 dòng đầu", ...)
```
Test regression cho lỗi #2: assert filter được đẩy vào query (`.or()` có `title.ilike`, `note.ilike`, `category_id.in`, `user_id.in`), không phải lọc sau khi đã `slice`.

```ts
it("encode rồi decode cursor cho ra giá trị y nguyên", ...)
it("decode trả null với chuỗi rác", ...)
it("cursor xử lý được created_at null", ...)              // Review Focus #2
it("search resolve tên danh mục và tên thành viên thành id trước khi query", ...)
it("nextCursor null khi không còn trang sau", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/lib/transactions/data.test.ts`
Expected: FAIL — `getTransactionsAllData` chưa tồn tại.

- [ ] **Step 3: Implement `getTransactionsAllData` và cặp encode/decode cursor**

Cursor encode JSON rồi base64url. Điều kiện phân trang: `transaction_date < d OR (transaction_date = d AND (created_at, id) < (c, i))`, dựng bằng `.or()`. `created_at` null sắp cuối trong cùng ngày — khớp với `nulls last` của `ORDER BY` hiện tại. Search: resolve `categoryIds`/`memberIds` khớp từ khoá từ hai danh sách đã fetch, rồi ghép vào `.or()` cùng `title.ilike`/`note.ilike`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 7: Tách `TransactionForm` ra file riêng

**Files:**
- Create: `src/components/transactions/transaction-form.tsx`
- Modify: `src/components/transactions/transaction-manager.tsx` (bỏ phần form)
- Modify: `src/components/app/app-shell.tsx:11`
- Modify: `src/components/transactions/transaction-form.test.tsx:4`
- Modify: `src/components/transactions/transaction-manager.test.tsx:4`

**Interfaces:**
- Produces: `export function TransactionForm(props)` — **giữ nguyên chữ ký hiện tại**, không đổi một tham số nào.

**Đây là thay đổi cơ học. Không đổi một dòng logic nào.** Mục đích là để Task 12 làm việc trên một `transaction-manager.tsx` nhỏ hơn. Chuyển kèm các helper chỉ form dùng: `CalculatorPad`, `localDateInput`, `formatDraftTime`, `COLLAPSED_CATEGORY_LIMIT`. `formatMoney` được cả hai bên dùng nên để lại ở `transaction-manager.tsx` và `transaction-form.tsx` import từ đó, hoặc chuyển sang `src/lib/transactions/format.ts` nếu thấy gọn hơn — chọn một và dùng nhất quán.

- [ ] **Step 1: Di chuyển code, cập nhật 3 import site**

Không viết test mới. Test hiện có của form chính là lưới an toàn: nếu `transaction-form.test.tsx` (225 dòng) còn pass thì việc di chuyển là đúng.

- [ ] **Step 2: `pnpm check`**

Expected: PASS toàn bộ, **đặc biệt là `transaction-form.test.tsx` không đổi một assertion nào**. Nếu có test fail thì việc di chuyển đã làm đổi logic — quay lại sửa, không sửa test.

- [ ] **Step 3: Báo cáo, KHÔNG commit**

---

## Task 8: Component danh sách giao dịch

**Files:**
- Create: `src/components/transactions/transaction-list.tsx`
- Create: `src/components/transactions/transaction-list.test.tsx`
- Modify: `src/components/transactions/transaction-manager.tsx` (bỏ phần danh sách)

**Interfaces:**
- Consumes: `TransactionView`; `deleteTransactionAction`.
- Produces:

```ts
export function TransactionList(props: {
  rows: TransactionView[];
  highlightId: string | null;
  showMemberName: boolean;
  onEdit: (transaction: TransactionView) => void;
  onDeleted: (id: string) => void;
}): React.JSX.Element;

export function formatTransactionDayLabel(date: string, today: string): string;
export function formatTransactionTime(createdAt: string | null): string | null;
```

Chuyển `TransactionRow`, `DeleteTransactionButton`, `groupTransactions`, `formatSignedMoney` từ `transaction-manager.tsx` sang đây.

- [ ] **Step 1: Viết test fail**

```ts
it("formatTransactionDayLabel trả Hôm nay cho ngày hôm nay", ...)
it("formatTransactionDayLabel trả Hôm qua cho ngày hôm qua", ...)
it("formatTransactionDayLabel trả ngày dd/mm/yyyy cho ngày xa hơn", ...)
it("formatTransactionTime trả null khi createdAt null", ...)
it("dòng chính là tên danh mục, không phải tên thành viên", ...)
it("dòng phụ hiện giờ và ghi chú, không lặp lại ngày của header nhóm", ...)
it("ẩn tên thành viên khi showMemberName false", ...)
it("hiện tên thành viên khi showMemberName true", ...)
it("nhóm theo ngày và hiện tổng chênh lệch của ngày đó", ...)
it("cuộn tới và tô sáng dòng khớp highlightId", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail**

Run: `pnpm test src/components/transactions/transaction-list.test.tsx`
Expected: FAIL — không resolve được `./transaction-list`.

- [ ] **Step 3: Implement `TransactionList`**

Giữ nguyên hành vi xoá lạc quan và highlight 3 giây đang có. `formatTransactionTime` dùng `Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" })`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 9: Component dải tổng và banner cap

**Files:**
- Create: `src/components/transactions/transaction-summary-strip.tsx`
- Create: `src/components/transactions/transaction-summary-strip.test.tsx`

**Interfaces:**
- Consumes: `TransactionAnalytics` (Task 2–4).
- Produces:

```ts
export function TransactionSummaryStrip(props: {
  analytics: TransactionAnalytics;
  truncated: boolean;
}): React.JSX.Element;
```

- [ ] **Step 1: Viết test fail**

```ts
it("hiện ba ô Chi, Thu và Số khoản", ...)
it("ô Số khoản hiện scopeCount trên monthCount", ...)            // "23 / 71 cả tháng"
it("hiện ngoài bộ lọc thay vì số 0 khi incomeInScope false", ...)
it("hiện số 0 khi incomeInScope true mà tháng không có thu nhập", ...)
it("hiện delta so tháng trước khi comparable true", ...)
it("ẩn delta và ghi không đủ dữ liệu so sánh khi comparable false", ...)
it("hiện banner cap khi truncated true", ...)
it("không hiện banner khi truncated false", ...)
```

Lưu ý Global Constraints về `getByText`: câu "23 / 71 cả tháng" trải qua nhiều `<span>` — assert từng phần hoặc dùng `getByText` trên đúng element lá.

- [ ] **Step 2: Chạy để chắc chắn fail** — Expected: FAIL.

- [ ] **Step 3: Implement `TransactionSummaryStrip`**

Copy banner cap đúng nguyên văn spec: `"Tháng này có hơn 1.500 giao dịch. Số liệu tính trên 1.500 khoản gần nhất."`

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 10: Component panel phân tích

**Files:**
- Create: `src/components/transactions/transaction-analytics-panel.tsx`
- Create: `src/components/transactions/transaction-analytics-panel.test.tsx`

**Interfaces:**
- Consumes: `TransactionAnalytics`.
- Produces:

```ts
export function TransactionAnalyticsPanel(props: {
  analytics: TransactionAnalytics;
  panelType: "income" | "expense";
  selectedCategoryIds: string[];
  onPanelTypeChange: (type: "income" | "expense") => void;
  onToggleCategory: (categoryId: string) => void;
}): React.JSX.Element;
```

- [ ] **Step 1: Viết test fail**

```ts
it("header hiện scopeCount và scopeLabel", ...)       // "ĐANG TÍNH TRÊN 23 KHOẢN" + "Ăn uống, Mua sắm · Minh Thư"
it("bấm công tắc Thu gọi onPanelTypeChange với income", ...)
it("bấm thanh một danh mục gọi onToggleCategory với id đó", ...)
it("thanh danh mục đang được chọn có trạng thái nhấn", ...)   // aria-pressed
it("hiện deltaLabel của từng danh mục khi có", ...)
it("hiện bảng theo thành viên", ...)
it("hiện các cảnh báo trong analytics.alerts", ...)
it("không hiện khối cảnh báo khi alerts rỗng", ...)
it("hiện empty state khi categories rỗng", ...)
it("gập được: bấm header ẩn phần thân", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail** — Expected: FAIL.

- [ ] **Step 3: Implement `TransactionAnalyticsPanel`**

Thanh danh mục là `<button aria-pressed>` chứ không phải `<Link>` — nó đổi client state, không điều hướng. Trạng thái gập để ở `useState` trong chính component, mặc định mở.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 11: Component thanh filter

**Files:**
- Create: `src/components/transactions/transaction-filter-bar.tsx`
- Create: `src/components/transactions/transaction-filter-bar.test.tsx`

**Interfaces:**
- Consumes: `TransactionFilter`, `toggleFilterId` (Task 1); `CategoryChipEntry` (Task 2); `MemberOption`.
- Produces:

```ts
export function TransactionFilterBar(props: {
  month: string;
  view: "month" | "all";
  chipOrder: CategoryChipEntry[];
  members: MemberOption[];
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  hrefForMonth: (month: string) => string;
  hrefForView: (view: "month" | "all") => string;
}): React.JSX.Element;
```

Số chip danh mục hiện trực tiếp: `VISIBLE_CATEGORY_CHIPS = 6`; phần còn lại vào nút `+N` mở `Sheet`.

- [ ] **Step 1: Viết test fail**

```ts
it("hiện tối đa 6 chip danh mục rồi nút cộng N", ...)
it("không hiện nút cộng N khi danh mục ít hơn hoặc bằng 6", ...)
it("chip danh mục hiện tên và số tiền", ...)
it("bấm chip danh mục gọi onFilterChange với id được thêm vào", ...)
it("bấm lại chip đang chọn gọi onFilterChange với id được bỏ ra", ...)
it("bấm nút cộng N mở sheet có toàn bộ danh mục kèm số tiền", ...)
it("bấm chip thành viên gọi onFilterChange", ...)
it("hiện chip filter đang áp dụng, bấm x để bỏ từng cái", ...)
it("hiện nút Xoá hết khi có filter và ẩn khi không", ...)
it("bấm icon search bung ô nhập inline", ...)
it("nhập search gọi onFilterChange với search mới", ...)
it("điều hướng tháng dùng Link lấy từ hrefForMonth", ...)
```

- [ ] **Step 2: Chạy để chắc chắn fail** — Expected: FAIL.

- [ ] **Step 3: Implement `TransactionFilterBar`**

Chip danh mục và chip thành viên là `<button>` (đổi state, không điều hướng). Điều hướng tháng và đổi view dùng `<Link>` vì chúng cần dữ liệu mới. Sheet `+N` dùng `Sheet` có sẵn ở `@/components/ui/sheet`.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: `pnpm check` — báo cáo, KHÔNG commit**

---

## Task 12: Nối dây — `page.tsx` và orchestrator

**Files:**
- Modify: `src/app/(app)/transactions/page.tsx`
- Modify: `src/components/transactions/transaction-manager.tsx`
- Modify: `src/components/transactions/transaction-manager.test.tsx`
- Modify: `src/lib/transactions/data.ts` (xoá `getTransactionPageData` và type `TransactionPageData`)
- Modify: `src/lib/transactions/filters.ts` (xoá `TransactionsFilterState`, `toggleMemberFilter`, và bản `buildTransactionsHref` cũ)

**Interfaces:**
- Consumes: tất cả 11 task trước.
- Produces: `TransactionsManager` với props mới:

```ts
{
  view: "month" | "all";
  month: string;
  currentUserId: string;
  highlightId: string | null;
  initialFilter: TransactionFilter;
  initialPanelType: "income" | "expense";
  monthData: TransactionsMonthData | null;   // null khi view === "all"
  allData: TransactionsAllData | null;       // null khi view === "month"
  openNew: boolean;
}
```

`page.tsx` đọc thêm `category` và `panel` khỏi search params, gọi `getTransactionsMonthData` hoặc `getTransactionsAllData` tuỳ `view`, và dựng `known` cho `parseTransactionFilter` từ `categories`/`members` đã fetch.

- [ ] **Step 1: Viết test fail**

Bốn test regression của 4 lỗi gốc, đặt tên đúng như spec:

```ts
it("summary tính trên toàn bộ tháng kể cả khi có hơn 30 giao dịch", ...)
```
Truyền `monthData.current.rows` 45 dòng, assert dải tổng hiện tổng của cả 45.

```ts
it("view theo tháng không còn nút tải thêm", ...)
```
Assert `queryByText("Tải thêm giao dịch")` là null khi `view === "month"`.

Lỗi #2 và #4 đã có test ở Task 6; ở đây chỉ assert `page.tsx` truyền `filter` xuống `getTransactionsAllData` thay vì lọc sau.

Và các test hành vi mới:

```ts
it("bấm chip danh mục đổi cả danh sách và panel, không gọi router.push", ...)
```
Đây là test bảo vệ lời hứa "tức thì": spy `window.history.replaceState` phải được gọi, và mock `useRouter().push` phải **không** được gọi.

```ts
it("bấm thanh danh mục trong panel cho kết quả giống bấm chip", ...)
it("đổi công tắc Thu/Chi cập nhật param panel qua replaceState", ...)
it("showMemberName false khi lọc đúng một thành viên", ...)
it("hiện empty state có nút Xoá bộ lọc khi filter cho 0 kết quả", ...)
it("bỏ qua id danh mục không tồn tại trong URL", ...)
it("ở view tháng, panel nằm trong cột sticky bên phải trên màn hình xl", ...)
```
Test cuối assert cấu trúc lớp: container có `xl:grid-cols-[1fr_22rem]` và cột panel có `xl:sticky`. Trên mobile panel phải nằm **trên** danh sách trong thứ tự DOM, nên assert panel xuất hiện trước danh sách trong DOM order — không dùng CSS order để đảo, vì thứ tự đọc của screen reader phải khớp thứ tự nhìn.

- [ ] **Step 2: Chạy để chắc chắn fail** — Expected: FAIL.

- [ ] **Step 3: Implement orchestrator**

`transaction-manager.tsx` giữ `filter` và `panelType` ở `useState` khởi tạo từ prop, và `useEffect` đồng bộ lên URL bằng `window.history.replaceState` — **không** `router.push`/`router.replace`. Dẫn xuất qua `useMemo`: `applyTransactionFilters` → `buildTransactionAnalytics` → `buildCategoryChipOrder`. `showMemberName = filter.memberIds.length !== 1`.

Khi gọi `buildTransactionAnalytics`: `current` là rows đã lọc, `currentAll` là `monthData.current.rows` **chưa lọc** (cảnh báo ngân sách cần nó), `previous` là `monthData.previous?.rows` đã lọc cùng filter hoặc `null`, và `previousTruncated` là `monthData.previous?.truncated ?? false`.

Layout: ở `view === "month"` bọc trong `grid xl:grid-cols-[1fr_22rem]`, panel ở cột phải với `xl:sticky xl:top-*`. Thứ tự DOM: thanh filter → dải tổng → panel → danh sách.

Ở `view === "all"` thì filter đi qua `<Link>` như hiện tại và không render panel.

- [ ] **Step 4: Chạy test** — Expected: PASS.

- [ ] **Step 5: Xoá code đã chết**

`getTransactionPageData`, `TransactionPageData`, `TransactionsFilterState`, `toggleMemberFilter`, bản `buildTransactionsHref` cũ. `pnpm typecheck` sẽ chỉ ra chỗ nào còn dùng.

- [ ] **Step 6: `pnpm check` — báo cáo, KHÔNG commit**

Expected: PASS toàn bộ.

---

## Sau khi xong 12 task

- [ ] Chạy `pnpm check` lần cuối trên toàn bộ branch.
- [ ] Đo payload thật của một tháng (DevTools → Network, response của `/transactions`) và báo số liệu — spec dự đoán ~25KB cho ~200 giao dịch; nếu lệch xa thì đó là tín hiệu cần cân lại `MONTH_ROW_CAP`.
- [ ] Kiểm tra back/forward của trình duyệt sau khi filter, vì `history.replaceState` không tạo entry mới. Nếu hành vi khó chịu thì áp phương án thoái lui đã ghi trong mục Rủi ro của spec.
- [ ] **KHÔNG commit.** Báo cáo để người dùng tự review và tự commit.
