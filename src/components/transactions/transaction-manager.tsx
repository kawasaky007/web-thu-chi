"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { TransactionAnalyticsPanel } from "@/components/transactions/transaction-analytics-panel";
import { TransactionFilterBar } from "@/components/transactions/transaction-filter-bar";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { TransactionList } from "@/components/transactions/transaction-list";
import { TransactionSummaryStrip } from "@/components/transactions/transaction-summary-strip";
import { Button } from "@/components/ui/button";
import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { EmptyState } from "@/components/ui/status-state";
import { buildCategoryChipOrder, buildTransactionAnalytics } from "@/lib/transactions/analytics";
import type {
  CategoryOption,
  MemberOption,
  TransactionsAllData,
  TransactionsMonthData,
  TransactionView,
} from "@/lib/transactions/data";
import {
  applyTransactionFilters,
  EMPTY_TRANSACTION_FILTER,
  isTransactionFilterEmpty,
  serializeTransactionFilter,
  toggleFilterId,
  type TransactionFilter,
} from "@/lib/transactions/filters";

type PanelType = "income" | "expense";

// Hằng dùng chung thay vì `?? []` tại chỗ: mảng mới mỗi lần render sẽ phá dependency của useMemo.
const NO_ROWS: TransactionView[] = [];
const NO_CATEGORIES: CategoryOption[] = [];
const NO_MEMBERS: MemberOption[] = [];

// Các param do filter sở hữu; mọi param khác (highlight, new, view) được giữ nguyên khi chiếu URL.
const FILTER_PARAM_KEYS = ["q", "category", "member"] as const;

// Gõ phím bắn onFilterChange cho từng ký tự; WebKit chỉ cho 100 lần replaceState / 30 giây rồi ném
// SecurityError, nên chỉ chiếu URL sau khi người dùng ngừng gõ. Chip/thành viên/panel là thao tác
// rời rạc và thưa nên vẫn chiếu ngay.
const SEARCH_URL_SYNC_DELAY = 300;

// Chỉ ồn ào một lần: throttle đã chạm trần thì mọi lần ghi sau đó cũng ném, log mỗi lần sẽ lấp console.
let replaceStateFailureLogged = false;

// View tháng gộp dấu (lọc ở client), view "Tất cả" dùng ilike của Postgres nên KHÔNG gộp — chênh lệch
// này có chủ ý và chỉ bỏ được bằng extension unaccent, tức là một migration mà đợt này không ship.
// Việc còn lại là không im lặng: tìm thấy bằng "an uong" rồi bấm "Tất cả" mà ra 0 dòng thì người dùng
// đọc thành "không còn gì cũ hơn", nên phải nói ra lý do ngay tại chỗ trống.
function diacriticHint(search: string) {
  return `Ở mục "Tất cả", tìm kiếm phân biệt dấu: thử gõ "${search}" có dấu đầy đủ.`;
}

// Link trông như nút (view "Tất cả" điều hướng bằng href nên không dùng được <Button>).
const NAV_BUTTON_CLASS =
  "relative mx-auto flex min-h-12 w-fit items-center rounded-2xl border border-forest/12 bg-paper-raised px-5 text-sm font-extrabold text-forest hover:bg-mist";

type TransactionsManagerProps = {
  view: "month" | "all";
  month: string;
  currentUserId: string;
  highlightId: string | null;
  initialFilter: TransactionFilter;
  initialPanelType: PanelType;
  monthData: TransactionsMonthData | null;
  allData: TransactionsAllData | null;
  openNew: boolean;
};

export function TransactionsManager({
  view,
  month,
  currentUserId,
  highlightId,
  initialFilter,
  initialPanelType,
  monthData,
  allData,
  openNew,
}: TransactionsManagerProps) {
  // Ở view tháng, chân lý của filter nằm ở state này; URL chỉ là bản chiếu của nó (effect bên dưới).
  const [monthFilter, setMonthFilter] = useState(initialFilter);
  const [panelType, setPanelType] = useState(initialPanelType);
  const [editor, setEditor] = useState<TransactionView | "new" | null>(openNew ? "new" : null);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());

  // View "Tất cả" đọc filter thẳng từ server: không giữ bản sao state nên back/forward không bao giờ
  // cho ra chip lệch với dữ liệu đang hiển thị.
  const filter = view === "month" ? monthFilter : initialFilter;

  const categories = monthData?.categories ?? allData?.categories ?? NO_CATEGORIES;
  const members = monthData?.members ?? allData?.members ?? NO_MEMBERS;
  const sourceRows = monthData?.current.rows ?? allData?.rows ?? NO_ROWS;

  // loadedRows = cả tháng (view tháng) hoặc đúng trang hiện tại (view "Tất cả").
  // Dòng vừa xoá bị loại khỏi MỌI dẫn xuất (chip, dải tổng, panel, danh sách) để các con số không
  // lệch nhau trong lúc chờ router.refresh() trả dữ liệu mới.
  const loadedRows = useMemo(
    () => (removedIds.size === 0 ? sourceRows : sourceRows.filter((row) => !removedIds.has(row.id))),
    [sourceRows, removedIds],
  );
  // Chip sắp theo tiền của cả tháng, chưa lọc: bấm chính nó không được làm thứ tự nhảy.
  const chipOrder = useMemo(() => buildCategoryChipOrder(categories, loadedRows), [categories, loadedRows]);
  // View "Tất cả" đã được DB lọc rồi; lọc lại ở client sẽ cắt mất kết quả search theo cột khác.
  const visibleRows = useMemo(
    () => (view === "month" ? applyTransactionFilters(loadedRows, filter) : loadedRows),
    [view, loadedRows, filter],
  );
  const analytics = useMemo(() => {
    if (view !== "month" || !monthData) return null;
    return buildTransactionAnalytics({
      current: visibleRows,
      // Cảnh báo ngân sách so với hạn mức của cả household nên cần rows chưa lọc.
      currentAll: loadedRows,
      previous: monthData.previous ? applyTransactionFilters(monthData.previous.rows, filter) : null,
      previousTruncated: monthData.previous?.truncated ?? false,
      filter,
      categories,
      members,
      budgetLimits: monthData.budgetLimits,
      panelType,
    });
  }, [view, monthData, visibleRows, loadedRows, filter, categories, members, panelType]);

  const hrefFor = useCallback(
    (next: { view?: "month" | "all"; month?: string; filter?: TransactionFilter; cursor?: string }) => {
      const nextView = next.view ?? view;
      const params = new URLSearchParams();
      if (nextView === "all") params.set("view", "all");
      else params.set("month", next.month ?? month);
      for (const [key, value] of serializeTransactionFilter(next.filter ?? filter)) params.set(key, value);
      if (nextView === "month" && panelType === "income") params.set("panel", "income");
      if (next.cursor) params.set("cursor", next.cursor);
      return `/transactions?${params.toString()}`;
    },
    [view, month, filter, panelType],
  );

  // replaceState đổi thanh địa chỉ mà KHÔNG chạy lại server component: link vẫn share/refresh được
  // trong khi filter phản hồi tức thì. Dùng router.push/replace ở đây là mất đúng điều đó.
  // View "Tất cả" lọc ở DB nên đổi filter bên đó là điều hướng thật, không đi qua hàm này.
  const syncUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("month", month);
    const filterParams = serializeTransactionFilter(filter);
    for (const key of FILTER_PARAM_KEYS) {
      const value = filterParams.get(key);
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    if (panelType === "income") params.set("panel", "income");
    else params.delete("panel");
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    } catch (error) {
      // URL chỉ là bản chiếu của state: mất một lần ghi thì thanh địa chỉ cũ đi, còn để lỗi thoát ra
      // khỏi effect là cả màn hình bị thay bằng error.tsx và phải tải lại hai tháng dữ liệu.
      if (!replaceStateFailureLogged) {
        replaceStateFailureLogged = true;
        console.error(
          "[transactions] Không chiếu được filter lên URL (khả năng cao do WebKit chặn replaceState ở 100 lần/30 giây)",
          error,
        );
      }
    }
  }, [month, filter, panelType]);

  // Chỉ nhánh search đi qua debounce; mọi thay đổi khác (chip, thành viên, panel, đổi tháng) chiếu ngay.
  const lastSyncedSearch = useRef(filter.search);
  useEffect(() => {
    if (view !== "month") return;
    const searchChanged = lastSyncedSearch.current !== filter.search;
    lastSyncedSearch.current = filter.search;
    if (!searchChanged) {
      syncUrl();
      return;
    }
    const timer = window.setTimeout(syncUrl, SEARCH_URL_SYNC_DELAY);
    return () => window.clearTimeout(timer);
  }, [view, filter.search, syncUrl]);

  // Chỉ view tháng đi qua đây: view "Tất cả" đổi filter bằng <Link> (hrefForFilter), không state.
  const applyFilter = useCallback((next: TransactionFilter) => setMonthFilter(next), []);

  const toggleCategory = useCallback(
    (categoryId: string) =>
      setMonthFilter({ ...filter, categoryIds: toggleFilterId(filter.categoryIds, categoryId) }),
    [filter],
  );

  const markRemoved = useCallback((id: string) => {
    setRemovedIds((current) => new Set(current).add(id));
  }, []);

  const filtering = !isTransactionFilterEmpty(filter);
  const listBlock = (
    <div className="min-w-0 space-y-4">
      {visibleRows.length === 0 ? (
        <EmptyState
          action={
            filtering ? (
              view === "all" ? (
                // View "Tất cả": xoá filter cũng là một lần điều hướng, nên cùng hình dạng Link + overlay.
                <Link className={NAV_BUTTON_CLASS} href={hrefFor({ filter: EMPTY_TRANSACTION_FILTER })}>
                  Xoá bộ lọc
                  <LinkPendingOverlay />
                </Link>
              ) : (
                <Button onClick={() => applyFilter(EMPTY_TRANSACTION_FILTER)}>Xoá bộ lọc</Button>
              )
            ) : (
              <Button onClick={() => setEditor("new")}>Thêm giao dịch đầu tiên</Button>
            )
          }
          description={
            filtering
              ? `Thử danh mục, thành viên hoặc từ khoá khác, hoặc xoá bộ lọc đang áp dụng.${
                  view === "all" && filter.search ? ` ${diacriticHint(filter.search)}` : ""
                }`
              : "Ghi lại khoản thu chi đầu tiên để bắt đầu theo dõi dòng tiền."
          }
          title={filtering ? "Không tìm thấy giao dịch" : "Chưa có giao dịch"}
        />
      ) : (
        <TransactionList
          highlightId={highlightId}
          onDeleted={markRemoved}
          onEdit={setEditor}
          rows={visibleRows}
          // Lọc đúng một người thì mọi dòng đều lặp lại tên người đó.
          showMemberName={filter.memberIds.length !== 1}
        />
      )}
      {/* Chỉ view "Tất cả" có phân trang; view tháng tải cả tháng nên không còn gì để tải thêm. */}
      {view === "all" && allData?.hasMore && allData.nextCursor ? (
        <Link className={NAV_BUTTON_CLASS} href={hrefFor({ cursor: allData.nextCursor })}>
          Tải thêm giao dịch
          <LinkPendingOverlay />
        </Link>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader
        action={
          <Button className="w-full sm:w-auto" onClick={() => setEditor("new")}>
            <span aria-hidden="true" className="text-lg leading-none">+</span> Thêm giao dịch
          </Button>
        }
        eyebrow="Dòng tiền"
        title="Giao dịch"
        description="Theo dõi từng khoản thu chi theo ngày, danh mục và thành viên household."
      />

      <TransactionFilterBar
        chipOrder={chipOrder}
        filter={filter}
        hrefForFilter={view === "all" ? (next) => hrefFor({ filter: next }) : undefined}
        hrefForMonth={(value) => hrefFor({ month: value, view: "month" })}
        hrefForView={(value) => hrefFor({ view: value })}
        members={members}
        month={month}
        onFilterChange={applyFilter}
        view={view}
      />

      {analytics ? (
        // Thứ tự DOM = thứ tự nhìn trên mobile (dải tổng → panel → danh sách); desktop chỉ đổi cột
        // bằng grid, không dùng CSS order, để thứ tự đọc của screen reader khớp thứ tự nhìn.
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1fr_22rem]">
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            <TransactionSummaryStrip analytics={analytics} truncated={monthData?.current.truncated ?? false} />
          </div>
          <div className="min-w-0 xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <TransactionAnalyticsPanel
              analytics={analytics}
              onPanelTypeChange={setPanelType}
              onToggleCategory={toggleCategory}
              panelType={panelType}
              selectedCategoryIds={filter.categoryIds}
            />
          </div>
          <div className="min-w-0 xl:col-start-1 xl:row-start-2">{listBlock}</div>
        </div>
      ) : (
        <div className="mt-4">{listBlock}</div>
      )}

      {editor ? (
        <TransactionForm
          categories={categories}
          currentUserId={currentUserId}
          members={members}
          transaction={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </>
  );
}
