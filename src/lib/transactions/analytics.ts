import type {
  CategoryOption,
  MemberOption,
  PreviousTransactionRow,
  TransactionView,
} from "@/lib/transactions/data";
import { DELETED_CATEGORY_ID, isTransactionFilterEmpty, type TransactionFilter } from "@/lib/transactions/filters";
// Dùng chung bộ định dạng tiền của UI (kèm " đ" và làm tròn 2 số) để con số vượt ngân sách không
// làm tròn khác mọi số tiền khác trên màn hình. format.ts không import gì nên không có vòng lặp.
import { formatMoney } from "@/lib/transactions/format";

export type DeltaKind = "ratio" | "new" | "gone" | "unchanged" | "none";

// categoryId luôn là string (danh mục đã xoá dùng DELETED_CATEGORY_ID) để cùng một định danh
// chảy từ filter -> analytics -> UI; dùng null sẽ làm filter không bao giờ khớp.
export type CategoryAnalytics = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  count: number;
  amount: number;
  percent: number;
  previousAmount: number | null;
  deltaRatio: number | null;
  deltaKind: DeltaKind;
  deltaLabel: string | null;
};

export type MemberAnalytics = {
  userId: string;
  name: string;
  count: number;
  amount: number;
  percent: number;
  previousAmount: number | null;
  deltaRatio: number | null;
  deltaKind: DeltaKind;
  deltaLabel: string | null;
};

export type AnalyticsAlert = {
  kind: "budget-exceeded" | "biggest-increase";
  categoryId: string;
  message: string;
  severity: "warning" | "info";
};

export type TransactionAnalytics = {
  scopeLabel: string;
  scopeCount: number;
  monthCount: number;
  income: number;
  expense: number;
  incomeInScope: boolean;
  expenseInScope: boolean;
  // Có bộ lọc nào đang bật hay không. Cần tách khỏi incomeInScope/expenseInScope: lọc theo thành viên
  // hoặc từ khoá không loại loại thu/chi nào (cờ vẫn true) nhưng vẫn làm tổng về 0, và "0" lúc đó
  // nghĩa là "trong phạm vi này không có", không phải "cả tháng không có".
  filtered: boolean;
  previous: { income: number; expense: number } | null;
  comparable: boolean;
  categories: CategoryAnalytics[];
  members: MemberAnalytics[];
  alerts: AnalyticsAlert[];
};

export type AnalyticsInput = {
  current: TransactionView[];
  currentAll: TransactionView[];
  // Dòng tháng trước đã được chiếu hẹp ở tầng dữ liệu: ở đây chỉ cộng dồn nên không cần cột nào khác.
  previous: PreviousTransactionRow[] | null;
  // true khi dữ liệu tháng trước bị cắt bớt (chạm giới hạn truy vấn): so sánh sẽ sai lệch
  // nên coi như không so sánh được thay vì hiển thị phần trăm đáng ngờ.
  previousTruncated: boolean;
  filter: TransactionFilter;
  categories: CategoryOption[];
  members: MemberOption[];
  budgetLimits: Array<{ categoryId: string; amount: number }> | null;
  panelType: "income" | "expense";
};

export type CategoryChipEntry = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
};

const DELETED_CATEGORY_NAME = "Danh mục đã xoá";
const DELETED_CATEGORY_COLOR = "#94a3b8";
const SCOPE_ALL_LABEL = "Toàn bộ tháng";
const MAX_LABEL_NAMES = 2;
const MAX_ALERTS = 3;
const HOUSEHOLD_SUFFIX = " (tính cả household)";

// Chia cho 0 phải ra 0 (không NaN) để thanh tỷ lệ không vỡ ở tháng trống.
function ratio(value: number, total: number) {
  return total > 0 ? value / total : 0;
}

// Đúng những cột mà việc cộng dồn + dựng nhãn cần; cả TransactionView lẫn PreviousTransactionRow đều thoả.
type AggregatableRow = Pick<
  TransactionView,
  "type" | "amount" | "categoryId" | "userId" | "categoryName" | "categoryColor" | "categoryIcon" | "memberName"
>;

type Total = { count: number; amount: number; sample: AggregatableRow };
type Delta = Pick<CategoryAnalytics, "previousAmount" | "deltaRatio" | "deltaKind" | "deltaLabel">;

const NO_DELTA: Delta = { previousAmount: null, deltaRatio: null, deltaKind: "none", deltaLabel: null };
// Dưới 0,5% coi như không đổi để nhãn "↑0%" / "↓0%" không bao giờ xuất hiện.
const UNCHANGED_THRESHOLD = 0.005;

// Thứ tự xét quan trọng: "new" phải đứng trước phép chia để không bao giờ chia cho 0.
export function buildDelta(amount: number, previousAmount: number): Delta {
  if (previousAmount === 0 && amount > 0) {
    return { previousAmount, deltaRatio: null, deltaKind: "new", deltaLabel: "mới" };
  }
  if (amount === 0 && previousAmount > 0) {
    return { previousAmount, deltaRatio: -1, deltaKind: "gone", deltaLabel: "hết" };
  }
  // Cả hai cùng bằng 0: không có gì để so sánh nên coi là không đổi, tránh 0/0.
  const deltaRatio = previousAmount > 0 ? (amount - previousAmount) / previousAmount : 0;
  if (Math.abs(deltaRatio) < UNCHANGED_THRESHOLD) {
    return { previousAmount, deltaRatio, deltaKind: "unchanged", deltaLabel: "không đổi" };
  }
  const percent = Math.round(Math.abs(deltaRatio) * 100);
  return { previousAmount, deltaRatio, deltaKind: "ratio", deltaLabel: `${deltaRatio > 0 ? "↑" : "↓"}${percent}%` };
}

function rowCategoryId(row: Pick<TransactionView, "categoryId">) {
  return row.categoryId || DELETED_CATEGORY_ID;
}

function joinWithOverflow(names: string[]) {
  const shown = names.slice(0, MAX_LABEL_NAMES).join(", ");
  const rest = names.length - MAX_LABEL_NAMES;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

function buildScopeLabel(
  filter: TransactionFilter,
  categoryById: Map<string, CategoryOption>,
  memberById: Map<string, MemberOption>,
) {
  const parts: string[] = [];
  if (filter.categoryIds.length > 0) {
    parts.push(joinWithOverflow(filter.categoryIds.map(
      (id) => (id === DELETED_CATEGORY_ID ? DELETED_CATEGORY_NAME : categoryById.get(id)?.name ?? id),
    )));
  }
  if (filter.memberIds.length > 0) {
    parts.push(joinWithOverflow(filter.memberIds.map((id) => memberById.get(id)?.name ?? id)));
  }
  if (filter.search.trim()) parts.push(`“${filter.search.trim()}”`);
  return parts.length > 0 ? parts.join(" · ") : SCOPE_ALL_LABEL;
}

function sumByType(rows: Array<Pick<TransactionView, "type" | "amount">>, type: "income" | "expense") {
  return rows.reduce((sum, row) => (row.type === type ? sum + row.amount : sum), 0);
}

export function buildTransactionAnalytics(input: AnalyticsInput): TransactionAnalytics {
  const { current, currentAll, filter, panelType } = input;
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const memberById = new Map(input.members.map((member) => [member.id, member]));

  // Chỉ phân tích đúng loại đang xem; tổng của loại kia vẫn có ở income/expense.
  const panelRows = current.filter((row) => row.type === panelType);
  const panelTotal = panelRows.reduce((sum, row) => sum + row.amount, 0);

  const aggregate = (rows: AggregatableRow[]) => {
    const categoryTotals = new Map<string, Total>();
    const memberTotals = new Map<string, Total>();
    for (const row of rows) {
      for (const [map, key] of [[categoryTotals, rowCategoryId(row)], [memberTotals, row.userId]] as const) {
        const entry = map.get(key) ?? { count: 0, amount: 0, sample: row };
        entry.count += 1;
        entry.amount += row.amount;
        map.set(key, entry);
      }
    }
    return { categoryTotals, memberTotals };
  };
  const currentTotals = aggregate(panelRows);

  // Tháng trước đã được lọc cùng bộ lọc ở nơi gọi, nên ở đây chỉ cộng dồn, không lọc lại.
  const previous = input.previous;
  const comparable = previous !== null && !input.previousTruncated;
  const previousTotals = comparable
    ? aggregate(previous.filter((row) => row.type === panelType))
    : null;

  // Mục chỉ có ở tháng trước vẫn phải hiện (amount 0) thì nhãn "hết" mới có chỗ hiển thị.
  const mergeKeys = (now: Map<string, Total>, before: Map<string, Total> | undefined) => {
    const merged = new Map(now);
    for (const [key, total] of before ?? []) {
      if (!merged.has(key)) merged.set(key, { count: 0, amount: 0, sample: total.sample });
    }
    return merged;
  };
  // Quy tắc (i) của delta nằm ở đây: không so sánh được thì "none"; các quy tắc (ii)-(v) ở buildDelta.
  const deltaFor = (amount: number, before: Map<string, Total> | undefined, key: string): Delta =>
    before ? buildDelta(amount, before.get(key)?.amount ?? 0) : NO_DELTA;

  const categories: CategoryAnalytics[] = [...mergeKeys(currentTotals.categoryTotals, previousTotals?.categoryTotals)]
    .map(([categoryId, total]) => {
      const option = categoryById.get(categoryId);
      const deleted = categoryId === DELETED_CATEGORY_ID;
      return {
        categoryId,
        name: deleted ? DELETED_CATEGORY_NAME : option?.name ?? total.sample.categoryName,
        color: deleted ? DELETED_CATEGORY_COLOR : option?.color ?? total.sample.categoryColor,
        icon: option?.icon ?? total.sample.categoryIcon,
        count: total.count,
        amount: total.amount,
        percent: ratio(total.amount, panelTotal),
        ...deltaFor(total.amount, previousTotals?.categoryTotals, categoryId),
      };
    }).sort((a, b) => b.amount - a.amount);

  const members: MemberAnalytics[] = [...mergeKeys(currentTotals.memberTotals, previousTotals?.memberTotals)]
    .map(([userId, total]) => ({
      userId,
      name: memberById.get(userId)?.name ?? total.sample.memberName,
      count: total.count,
      amount: total.amount,
      percent: ratio(total.amount, panelTotal),
      ...deltaFor(total.amount, previousTotals?.memberTotals, userId),
    })).sort((a, b) => b.amount - a.amount);

  const hasCategoryFilter = filter.categoryIds.length > 0;
  const selectedTypes = filter.categoryIds.map((id) => categoryById.get(id)?.type);
  // Hai cờ này phân biệt "bộ lọc đã loại loại này" với "tháng này thực sự không có". Một id
  // không xác định được loại (danh mục đã xoá hoặc không có trong registry) không chứng minh
  // loại nào bị loại, nên không được khẳng định "ngoài bộ lọc" khi tiền vẫn nằm trong danh sách.
  const typeInScope = (type: "income" | "expense") =>
    !hasCategoryFilter || selectedTypes.some((selected) => selected === undefined || selected === type);

  return {
    scopeLabel: buildScopeLabel(filter, categoryById, memberById),
    scopeCount: current.length,
    monthCount: currentAll.length,
    income: sumByType(current, "income"),
    expense: sumByType(current, "expense"),
    incomeInScope: typeInScope("income"),
    expenseInScope: typeInScope("expense"),
    filtered: !isTransactionFilterEmpty(filter),
    previous: comparable ? { income: sumByType(previous, "income"), expense: sumByType(previous, "expense") } : null,
    comparable,
    categories,
    members,
    alerts: buildAlerts({ input, categories, categoryById, comparable }),
  };
}

function buildAlerts({ input, categories, categoryById, comparable }: {
  input: AnalyticsInput;
  categories: CategoryAnalytics[];
  categoryById: Map<string, CategoryOption>;
  comparable: boolean;
}): AnalyticsAlert[] {
  const biggestIncrease = comparable ? findBiggestIncrease(categories) : null;
  // Cảnh báo ngân sách (warning) được ưu tiên điền trước; biggest-increase (info) chỉ nhận chỗ còn dư.
  const budget = buildBudgetAlerts(input, categoryById).slice(0, MAX_ALERTS);
  return biggestIncrease && budget.length < MAX_ALERTS ? [...budget, biggestIncrease] : budget;
}

// Ngân sách thuộc về danh mục của cả tháng chứ không theo từng người, nên phải cộng trên
// currentAll; cộng trên dòng đã lọc sẽ làm ngân sách đã vỡ trông như còn dư khi lọc một thành viên.
function buildBudgetAlerts(input: AnalyticsInput, categoryById: Map<string, CategoryOption>): AnalyticsAlert[] {
  if (input.panelType !== "expense" || !input.budgetLimits) return [];
  const spent = new Map<string, { amount: number; sample: Pick<TransactionView, "categoryName"> }>();
  for (const row of input.currentAll) {
    if (row.type !== "expense") continue;
    const id = rowCategoryId(row);
    spent.set(id, { amount: (spent.get(id)?.amount ?? 0) + row.amount, sample: spent.get(id)?.sample ?? row });
  }
  // Số liệu lấy từ phạm vi rộng hơn danh sách đang xem nên phải nói rõ khi đang lọc.
  const suffix = isTransactionFilterEmpty(input.filter) ? "" : HOUSEHOLD_SUFFIX;
  return input.budgetLimits
    .flatMap(({ categoryId, amount: limit }) => {
      // amount <= 0 nghĩa là CHƯA đặt ngân sách, không phải hạn mức 0đ. Tầng dữ liệu đã lọc, nhưng
      // bất biến này phải nằm cạnh đoạn code phụ thuộc vào nó: thiếu nó thì mọi caller khác đều nhận
      // "vượt ngân sách" cho từng danh mục có chi tiêu.
      if (limit <= 0) return [];
      const total = spent.get(categoryId);
      const over = (total?.amount ?? 0) - limit;
      if (!total || over <= 0) return [];
      const name = categoryId === DELETED_CATEGORY_ID
        ? DELETED_CATEGORY_NAME
        : categoryById.get(categoryId)?.name ?? total.sample.categoryName;
      return [{ over, alert: {
        kind: "budget-exceeded" as const,
        categoryId,
        severity: "warning" as const,
        message: `${name} vượt ngân sách ${formatMoney(over)}${suffix}`,
      } }];
    })
    .sort((a, b) => b.over - a.over)
    .map(({ alert }) => alert);
}

// So theo số tuyệt đối (không phải tỷ lệ) để khoản lớn không bị danh mục nhỏ tăng vọt che mất.
function findBiggestIncrease(categories: CategoryAnalytics[]): AnalyticsAlert | null {
  let best: { entry: CategoryAnalytics; increase: number } | null = null;
  for (const entry of categories) {
    const increase = entry.amount - (entry.previousAmount ?? 0);
    if (increase > 0 && (!best || increase > best.increase)) best = { entry, increase };
  }
  if (!best) return null;
  return {
    kind: "biggest-increase",
    categoryId: best.entry.categoryId,
    severity: "info",
    message: `${best.entry.name} tăng mạnh nhất, +${formatMoney(best.increase)} so với tháng trước`,
  };
}

// Thứ tự chip theo độ lớn cả tháng (thu lẫn chi) để danh mục quan trọng nhất hiện đầu;
// danh mục không phát sinh vẫn có chip (amount 0) để người dùng chọn được.
export function buildCategoryChipOrder(
  categories: CategoryOption[],
  allRows: TransactionView[],
): CategoryChipEntry[] {
  const totals = new Map<string, number>();
  let deletedSample: TransactionView | null = null;
  for (const row of allRows) {
    const id = rowCategoryId(row);
    if (id === DELETED_CATEGORY_ID) deletedSample ??= row;
    totals.set(id, (totals.get(id) ?? 0) + Math.abs(row.amount));
  }

  const entries: Array<CategoryChipEntry & { sortOrder: number }> = categories.map((category) => ({
    categoryId: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    amount: totals.get(category.id) ?? 0,
    sortOrder: category.sortOrder,
  }));
  if (deletedSample) {
    entries.push({
      categoryId: DELETED_CATEGORY_ID,
      name: DELETED_CATEGORY_NAME,
      color: DELETED_CATEGORY_COLOR,
      icon: deletedSample.categoryIcon,
      amount: totals.get(DELETED_CATEGORY_ID) ?? 0,
      sortOrder: Number.MAX_SAFE_INTEGER,
    });
  }

  // Cùng amount thì giữ thứ tự người dùng đã sắp danh mục, cho ổn định giữa các lần render.
  return entries
    .sort((a, b) => b.amount - a.amount || a.sortOrder - b.sortOrder)
    .map(({ categoryId, name, color, icon, amount }) => ({ categoryId, name, color, icon, amount }));
}
