import { TransactionsManager } from "@/components/transactions/transaction-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  currentVietnamMonth,
  getTransactionFormOptions,
  getTransactionsAllData,
  getTransactionsMonthData,
  type CategoryOption,
  type MemberOption,
} from "@/lib/transactions/data";
import {
  DELETED_CATEGORY_ID,
  parseTransactionFilter,
  serializeTransactionFilter,
  type TransactionFilter,
} from "@/lib/transactions/filters";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!householdId || !membership) return null;

  const params = await searchParams;
  const monthParam = readParam(params.month);
  // getTransactionsMonthData ném lỗi với tháng sai định dạng, mà ?month= là thứ người dùng sửa tay
  // (hoặc link cũ) được: rơi về tháng hiện tại thay vì dựng trang lỗi.
  const month = monthParam && MONTH_PATTERN.test(monthParam) ? monthParam : currentVietnamMonth();
  const view = readParam(params.view) === "all" ? "all" : "month";
  const panelType = readParam(params.panel) === "income" ? "income" : "expense";
  const openNew = readParam(params.new) === "1";
  const highlightId = readParam(params.highlight) ?? null;
  const cursor = readParam(params.cursor);
  const filterParams = new URLSearchParams();
  for (const key of ["category", "member", "q"] as const) {
    const value = readParam(params[key]);
    if (value) filterParams.set(key, value);
  }

  const supabase = await createServerSupabaseClient();

  if (view === "month") {
    const monthData = await getTransactionsMonthData(supabase, {
      householdId,
      currentUserId: membership.userId,
      month,
    });
    const filter = parseTransactionFilter(filterParams, knownFilterIds(monthData.categories, monthData.members));
    return (
      <TransactionsManager
        allData={null}
        currentUserId={membership.userId}
        highlightId={highlightId}
        initialFilter={filter}
        initialPanelType={panelType}
        key={managerKey("month", filter)}
        month={month}
        monthData={monthData}
        openNew={openNew}
        view="month"
      />
    );
  }

  // View "Tất cả" lọc và search ngay trong câu truy vấn, nên filter phải sạch TRƯỚC khi query:
  // lấy danh mục/thành viên riêng một nhịp để id lạ trong URL không đi vào DB và lọc ra 0 dòng.
  // Truyền lại chúng qua formOptions để getTransactionsAllData không query lần thứ hai.
  const formOptions = await getTransactionFormOptions(supabase, householdId);
  const filter = parseTransactionFilter(filterParams, knownFilterIds(formOptions.categories, formOptions.members));
  const allData = await getTransactionsAllData(supabase, {
    householdId,
    currentUserId: membership.userId,
    filter,
    cursor,
    formOptions,
  });

  return (
    <TransactionsManager
      allData={allData}
      currentUserId={membership.userId}
      highlightId={highlightId}
      initialFilter={filter}
      initialPanelType={panelType}
      key={managerKey("all", filter)}
      month={month}
      monthData={null}
      openNew={openNew}
      view="all"
    />
  );
}

// State filter cục bộ của manager không được sống qua một lần điều hướng mang filter khác (đổi view,
// hoặc đổi trang ở view "Tất cả"): key đổi thì React remount và state được khởi tạo lại từ prop.
// Lọc trong view tháng không bao giờ tới server nên key ở đó không đổi, manager không bị remount.
function managerKey(view: "month" | "all", filter: TransactionFilter) {
  return `${view}|${serializeTransactionFilter(filter).toString()}`;
}

// DELETED_CATEGORY_ID không có trong bảng categories nhưng vẫn là id filter hợp lệ; thiếu nó thì
// ?category=__deleted__ bị coi là id lạ và filter "Danh mục đã xoá" không sống qua một lần refresh.
function knownFilterIds(categories: CategoryOption[], members: MemberOption[]) {
  return {
    categoryIds: new Set([DELETED_CATEGORY_ID, ...categories.map((category) => category.id)]),
    memberIds: new Set(members.map((member) => member.id)),
  };
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
