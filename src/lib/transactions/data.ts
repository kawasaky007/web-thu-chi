import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { getBudgetPageData } from "@/lib/budgets/data";
import { categoryTypeLabel } from "@/lib/categories/constants";
import { vietnamMonthBounds } from "@/lib/dashboard/data";
import { DELETED_CATEGORY_ID, type TransactionFilter } from "@/lib/transactions/filters";

export type TransactionType = "income" | "expense";

export type CategoryOption = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  sortOrder: number;
};

export type MemberOption = {
  id: string;
  name: string;
  email: string;
};

export type TransactionView = {
  id: string;
  householdId: string;
  userId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  title: string;
  note: string | null;
  transactionDate: string;
  createdAt: string | null;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  memberName: string;
  memberEmail: string;
  canDelete: boolean;
};

export async function getTransactionFormOptions(
  supabase: SupabaseClient<Database>,
  householdId: string,
) {
  const [categoryResult, profileResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, type, color, icon, sort_order")
      .eq("household_id", householdId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("household_id", householdId)
      .order("full_name", { ascending: true }),
  ]);

  if (categoryResult.error) throw categoryResult.error;
  if (profileResult.error) throw profileResult.error;

  const categories = categoryResult.data.flatMap((category) => {
    if (category.type !== "income" && category.type !== "expense") return [];
    return [{
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color ?? (category.type === "income" ? "#0F8B6F" : "#C2410C"),
      icon: category.icon ?? "other",
      sortOrder: category.sort_order ?? 0,
    } satisfies CategoryOption];
  });
  const members = profileResult.data.map((profile) => ({
    id: profile.id,
    name: profile.full_name?.trim() || profile.email?.trim() || "Thành viên",
    email: profile.email?.trim() || "",
  } satisfies MemberOption));
  return { categories, members };
}

// Trần số dòng cho view theo tháng. Một hộ gia đình hiếm khi vượt ngưỡng này;
// nếu vượt, UI phải báo "chưa đủ dữ liệu" thay vì hiển thị tổng sai.
export const MONTH_ROW_CAP = 1500;

export type MonthRows = { rows: TransactionView[]; truncated: boolean };

// Tháng trước chỉ phục vụ hai việc: lọc lại bằng cùng bộ lọc, rồi cộng dồn để so sánh. Các cột còn
// lại (id, householdId, createdAt, transactionDate, memberEmail, canDelete) không chỗ nào đọc, nên
// không gửi qua ranh giới server→client — với cả tháng dữ liệu thì đó là phân nửa payload.
// categoryColor/categoryIcon phải giữ: danh mục chỉ còn ở tháng trước và không còn trong registry
// lấy màu/icon từ chính dòng mẫu.
export type PreviousTransactionRow = Pick<
  TransactionView,
  | "type"
  | "amount"
  | "categoryId"
  | "userId"
  | "title"
  | "note"
  | "categoryName"
  | "memberName"
  | "categoryColor"
  | "categoryIcon"
>;

export type PreviousMonthRows = { rows: PreviousTransactionRow[]; truncated: boolean };

export type TransactionsMonthData = {
  categories: CategoryOption[];
  members: MemberOption[];
  current: MonthRows;
  previous: PreviousMonthRows | null;
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
};

// Chỉ các cột cần để dựng TransactionView — tải cả tháng nên không dùng select("*").
const MONTH_COLUMNS =
  "id, household_id, user_id, category_id, type, amount, title, note, transaction_date, created_at";

type RawTransactionRow = {
  id: string;
  household_id: string | null;
  user_id: string | null;
  category_id: string | null;
  type: string | null;
  amount: number;
  title: string | null;
  note: string | null;
  transaction_date: string;
  created_at: string | null;
};

type ViewContext = {
  householdId: string;
  currentUserId: string;
  categoryById: Map<string, CategoryOption>;
  memberById: Map<string, MemberOption>;
};

// Một bản mapper duy nhất cho cả view tháng và view "Tất cả": trước đây mỗi nhánh giữ một bản sao
// và chúng đã bắt đầu lệch nhau. Trả mảng (0 hoặc 1 phần tử) để chỗ gọi dùng flatMap bỏ type lạ.
function toTransactionView(transaction: RawTransactionRow, context: ViewContext): TransactionView[] {
  if (transaction.type !== "income" && transaction.type !== "expense") return [];
  const category = context.categoryById.get(transaction.category_id ?? "");
  const member = context.memberById.get(transaction.user_id ?? "");
  return [{
    id: transaction.id,
    householdId: transaction.household_id ?? context.householdId,
    userId: transaction.user_id ?? "",
    categoryId: transaction.category_id ?? "",
    type: transaction.type,
    amount: Number(transaction.amount),
    title: transaction.title?.trim() || category?.name || "Giao dịch",
    note: transaction.note?.trim() || null,
    transactionDate: transaction.transaction_date,
    createdAt: transaction.created_at,
    categoryName: category?.name || transaction.title?.trim() || categoryTypeLabel(transaction.type),
    categoryColor: category?.color || (transaction.type === "income" ? "#0F8B6F" : "#C2410C"),
    categoryIcon: category?.icon || "other",
    memberName: transaction.user_id === context.currentUserId ? "Bạn" : member?.name || "Không rõ",
    memberEmail: member?.email || "",
    canDelete: transaction.user_id === context.currentUserId,
  } satisfies TransactionView];
}

// Chiếu thật (không ép kiểu) từ cùng một mapper duy nhất: giữ hai bản mapper là cách chúng đã lệch nhau.
function toPreviousRow(transaction: RawTransactionRow, context: ViewContext): PreviousTransactionRow[] {
  return toTransactionView(transaction, context).map((view) => ({
    type: view.type,
    amount: view.amount,
    categoryId: view.categoryId,
    userId: view.userId,
    title: view.title,
    note: view.note,
    categoryName: view.categoryName,
    memberName: view.memberName,
    categoryColor: view.categoryColor,
    categoryIcon: view.categoryIcon,
  }));
}

export async function getTransactionsMonthData(
  supabase: SupabaseClient<Database>,
  options: { householdId: string; currentUserId: string; month: string },
): Promise<TransactionsMonthData> {
  // Dùng ranh giới +07:00 (không dùng monthBounds vì nó không gắn múi giờ):
  // giao dịch 00:00 ngày 1 giờ VN phải thuộc tháng đó chứ không lọt sang tháng trước.
  const currentBounds = vietnamMonthBounds(options.month);
  if (!currentBounds) throw new Error(`Tháng không hợp lệ: ${options.month}`);
  const previousMonth = shiftMonth(options.month, -1);
  const previousBounds = vietnamMonthBounds(previousMonth);

  const fetchMonth = (bounds: { start: string; end: string }) =>
    supabase
      .from("transactions")
      .select(MONTH_COLUMNS)
      .eq("household_id", options.householdId)
      .gte("transaction_date", bounds.start)
      .lt("transaction_date", bounds.end)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      // +1 để phát hiện bị cắt: nhận được CAP+1 dòng nghĩa là còn dữ liệu chưa tải.
      .limit(MONTH_ROW_CAP + 1);

  const [currentResult, previousResult, formOptions, budgetLimits] = await Promise.all([
    fetchMonth(currentBounds),
    // Bắt cả lỗi mạng (reject) lẫn lỗi trả về trong { error } để Promise.all không bị phá bởi tháng trước.
    previousBounds ? fetchMonth(previousBounds).then(
          (result) => result,
          (error: unknown) => {
            console.error("[transactions] Không tải được giao dịch tháng trước", previousMonth, error);
            return null;
          },
        ) : Promise.resolve(null),
    getTransactionFormOptions(supabase, options.householdId),
    getBudgetPageData(supabase, options.householdId, options.month)
      .then((page) =>
        page.budgets
          // amount = 0 nghĩa là chưa đặt ngân sách (getBudgetPageData trả mỗi danh mục một dòng),
          // không phải hạn mức 0đ; giữ lại sẽ khiến mọi danh mục có chi tiêu đều bị cảnh báo vượt.
          .filter((b) => b.amount > 0)
          .map((b) => ({ categoryId: b.categoryId, amount: b.amount })),
      )
      .catch((error: unknown) => {
        console.error("[transactions] Không tải được ngân sách tháng", options.month, error);
        // Ngân sách chỉ là cảnh báo phụ: mất nó thì trang vẫn dùng được, chỉ ẩn phần cảnh báo.
        // Khác với tháng hiện tại, ở đây không có con số nào bị hiển thị sai.
        return null;
      }),
  ]);

  // Tháng hiện tại lỗi thì phải throw: trả mảng rỗng sẽ hiện "0 đ", giống hệt "chưa chi gì" — còn tệ hơn trang lỗi.
  if (currentResult.error) throw currentResult.error;

  const { categories, members } = formOptions;
  const context: ViewContext = {
    householdId: options.householdId,
    currentUserId: options.currentUserId,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    memberById: new Map(members.map((m) => [m.id, m])),
  };

  const toMonthRows = (data: NonNullable<typeof currentResult.data>): MonthRows => ({
    rows: data.slice(0, MONTH_ROW_CAP).flatMap((transaction) => toTransactionView(transaction, context)),
    truncated: data.length > MONTH_ROW_CAP,
  });

  // Tháng trước chỉ phục vụ so sánh; lỗi thì bỏ so sánh (previous = null) chứ không kéo cả trang chết theo.
  let previous: PreviousMonthRows | null = null;
  if (previousResult?.error) {
    console.error("[transactions] Không tải được giao dịch tháng trước", previousMonth, previousResult.error);
  } else if (previousResult?.data) {
    previous = {
      rows: previousResult.data.slice(0, MONTH_ROW_CAP).flatMap((transaction) => toPreviousRow(transaction, context)),
      truncated: previousResult.data.length > MONTH_ROW_CAP,
    };
  }

  return {
    categories,
    members,
    current: toMonthRows(currentResult.data),
    previous,
    budgetLimits,
  };
}

// ---------------------------------------------------------------------------
// View "Tất cả": phân trang keyset ở DB, search cũng ở DB.
// ---------------------------------------------------------------------------

export const ALL_PAGE_SIZE = 30;

export type TransactionCursor = { transactionDate: string; createdAt: string | null; id: string };

export type TransactionsAllData = {
  categories: CategoryOption[];
  members: MemberOption[];
  rows: TransactionView[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function encodeTransactionCursor(cursor: TransactionCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

// transactions.id là uuid và hai cột còn lại là timestamp/date: giá trị sai kiểu vẫn qua được
// kiểm tra "là string" rồi mới nổ ở Postgres (lỗi cast → 500), đúng thứ mà lời hứa "rơi về trang đầu"
// cần tránh. Kiểm ngay tại đây để cursor sửa tay chỉ đơn giản bị bỏ.
const CURSOR_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Phải neo theo đúng dạng của cột (date hoặc timestamptz): new Date() một mình nhận cả "5"
// (thành 2001-05-01) rồi để giá trị đó đi tiếp xuống Postgres.
const CURSOR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isParsableDate(value: string) {
  return CURSOR_DATE_PATTERN.test(value) && !Number.isNaN(new Date(value).getTime());
}

// Cursor đến từ URL nên không tin được: sai định dạng thì trả null để trang rơi về trang đầu thay vì ném lỗi 500.
export function decodeTransactionCursor(value: string): TransactionCursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { transactionDate, createdAt, id } = parsed as Record<string, unknown>;
    if (typeof transactionDate !== "string" || !isParsableDate(transactionDate)) return null;
    if (typeof id !== "string" || !CURSOR_ID_PATTERN.test(id)) return null;
    if (createdAt !== null && (typeof createdAt !== "string" || !isParsableDate(createdAt))) return null;
    return { transactionDate, createdAt, id };
  } catch {
    return null;
  }
}

// PostgREST nhận .or() là một chuỗi phân tách bằng dấu phẩy nên giá trị người dùng nhập bị
// diễn giải như cú pháp. Bọc giá trị trong dấu nháy kép khiến , ( ) . : không còn là cú pháp;
// bên trong nháy kép chỉ \ và " là ký tự escape.
function quoteFilterValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Escape cho mẫu ilike: \ % _ là ký tự đặc biệt của LIKE nên phải thành ký tự thường.
// "*" bị PostgREST đổi thành % (wildcard) và không escape được, nên thay bằng "_" (khớp đúng 1 ký tự,
// trong đó có chính dấu "*") — lệch nhẹ nhưng không bao giờ biến thành wildcard nhiều ký tự.
function likeContainsPattern(term: string) {
  const escaped = term.replace(/[\\%_]/g, (ch) => `\\${ch}`).replace(/\*/g, "_");
  return `%${escaped}%`;
}

function quotedList(values: string[]) {
  return `(${values.map(quoteFilterValue).join(",")})`;
}

// Điều kiện trang kế tiếp khớp CHÍNH XÁC với ORDER BY transaction_date DESC, created_at DESC NULLS LAST, id DESC:
//   transaction_date < d OR (transaction_date = d AND (created_at, id) đứng sau (c, i)).
// Không dùng created_at một mình: giao dịch nhập muộn cho ngày cũ có created_at mới nhưng nằm ở trang sau,
// lọc theo created_at sẽ làm nó biến mất khỏi danh sách.
// NULLS LAST: dòng created_at null đứng cuối trong cùng ngày, nên "đứng sau" (c, i) khi c không null
// gồm cả mọi dòng null; khi c null thì chỉ còn các dòng null có id nhỏ hơn.
function keysetFilter(cursor: TransactionCursor) {
  const date = quoteFilterValue(cursor.transactionDate);
  const id = quoteFilterValue(cursor.id);
  if (cursor.createdAt === null) {
    return `transaction_date.lt.${date},and(transaction_date.eq.${date},created_at.is.null,id.lt.${id})`;
  }
  const created = quoteFilterValue(cursor.createdAt);
  return (
    `transaction_date.lt.${date},and(transaction_date.eq.${date},` +
    `or(created_at.is.null,created_at.lt.${created},and(created_at.eq.${created},id.lt.${id})))`
  );
}

// Lưu ý đã chấp nhận: search ở view này PHÂN BIỆT dấu (ilike của Postgres không gộp dấu tiếng Việt),
// trong khi search của view theo tháng (client) thì không. Muốn đồng nhất phải dùng extension unaccent,
// tức là thêm SQL/migration — đợt này cố ý không làm. Đây không phải sót.
function searchFilter(term: string, categories: CategoryOption[], members: MemberOption[], currentUserId: string) {
  const needle = term.toLocaleLowerCase("vi-VN");
  const matches = (value: string) => value.toLocaleLowerCase("vi-VN").includes(needle);
  const categoryIds = categories.filter((c) => matches(c.name)).map((c) => c.id);
  // Giao diện hiển thị thành viên hiện tại là "Bạn" (không phải tên thật), nên search "bạn" phải khớp họ.
  const memberIds = members.filter((m) => matches(m.name) || (m.id === currentUserId && matches("Bạn"))).map((m) => m.id);
  const pattern = quoteFilterValue(likeContainsPattern(term));
  const parts = [`title.ilike.${pattern}`, `note.ilike.${pattern}`];
  if (categoryIds.length > 0) parts.push(`category_id.in.${quotedList(categoryIds)}`);
  if (memberIds.length > 0) parts.push(`user_id.in.${quotedList(memberIds)}`);
  return parts.join(",");
}

export async function getTransactionsAllData(
  supabase: SupabaseClient<Database>,
  options: {
    householdId: string;
    currentUserId: string;
    filter: TransactionFilter;
    cursor?: string;
    // page.tsx đã phải fetch danh mục/thành viên để làm sạch id trong URL trước khi chúng đi vào
    // câu truy vấn; truyền lại vào đây để cùng một dữ liệu không bị query hai lần mỗi lần tải trang.
    formOptions?: { categories: CategoryOption[]; members: MemberOption[] };
  },
): Promise<TransactionsAllData> {
  // Cần danh sách danh mục/thành viên TRƯỚC khi dựng query vì search phải đổi tên thành id.
  const { categories, members } =
    options.formOptions ?? (await getTransactionFormOptions(supabase, options.householdId));
  const context: ViewContext = {
    householdId: options.householdId,
    currentUserId: options.currentUserId,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    memberById: new Map(members.map((m) => [m.id, m])),
  };

  let query = supabase
    .from("transactions")
    .select(MONTH_COLUMNS)
    .eq("household_id", options.householdId)
    .order("transaction_date", { ascending: false })
    // Postgres mặc định DESC = NULLS FIRST; phải nói rõ nullsFirst:false để khớp điều kiện keyset.
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  const cursor = options.cursor ? decodeTransactionCursor(options.cursor) : null;
  if (cursor) query = query.or(keysetFilter(cursor));

  // Nhiều lần .or() được PostgREST AND lại với nhau, nên keyset, danh mục đã xoá và search không đè nhau.
  const { categoryIds, memberIds } = options.filter;
  if (categoryIds.length > 0) {
    const realIds = categoryIds.filter((id) => id !== DELETED_CATEGORY_ID);
    if (realIds.length === categoryIds.length) {
      query = query.in("category_id", realIds);
    } else {
      // Danh mục đã xoá = category_id null, không biểu diễn được bằng .in().
      const parts = realIds.length > 0 ? [`category_id.in.${quotedList(realIds)}`] : [];
      query = query.or([...parts, "category_id.is.null"].join(","));
    }
  }
  if (memberIds.length > 0) query = query.in("user_id", memberIds);

  const term = options.filter.search.trim();
  if (term) query = query.or(searchFilter(term, categories, members, options.currentUserId));

  // +1 để biết còn trang sau mà không cần query đếm.
  const result = await query.limit(ALL_PAGE_SIZE + 1);
  if (result.error) throw result.error;

  const page = result.data.slice(0, ALL_PAGE_SIZE);
  const rows = page.flatMap((transaction) => toTransactionView(transaction, context));

  // Cursor lấy từ dòng cuối của dữ liệu thô (kể cả dòng bị bỏ vì type lạ) để trang sau không lặp hay hụt dòng.
  const last = page.at(-1);
  const hasMore = result.data.length > ALL_PAGE_SIZE && last !== undefined;
  const nextCursor = hasMore
    ? encodeTransactionCursor({ transactionDate: last.transaction_date, createdAt: last.created_at, id: last.id })
    : null;

  return { categories, members, rows, nextCursor, hasMore };
}

export function monthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01T00:00:00`;
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00`;
  return { start, end };
}

export function currentVietnamMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function formatVietnameseMonth(month: string) {
  // Kiểm một lần bằng chính hàm cho ra mốc thời gian: kiểm bằng monthBounds rồi non-null-assert
  // vietnamMonthBounds chỉ an toàn khi hai regex ở hai module luôn khớp nhau.
  const bounds = vietnamMonthBounds(month);
  if (!bounds) return month;
  // Ranh giới có offset +07:00 để kết quả không phụ thuộc múi giờ của máy chạy.
  const instant = bounds.start;
  return new Intl.DateTimeFormat("vi-VN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(instant));
}

export function shiftMonth(month: string, delta: number) {
  const bounds = monthBounds(month);
  if (!bounds) return currentVietnamMonth();
  // Tự tách năm/tháng và dựng bằng Date.UTC: chuỗi không có offset bị parse theo giờ máy,
  // lệch 7 tiếng ở Việt Nam và làm setUTCMonth nhảy sai tháng.
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}
