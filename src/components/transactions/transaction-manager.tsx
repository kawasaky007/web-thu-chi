"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileClock,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createTransactionAction,
  deleteTransactionAction,
  initialTransactionActionState,
  updateTransactionAction,
} from "@/app/(app)/transactions/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { PageHeader } from "@/components/app/page-header";
import { useOnlineStatus } from "@/components/pwa/use-online-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/status-state";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { type CategoryType } from "@/lib/categories/constants";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import { evaluateAmountExpression } from "@/lib/transactions/amount-calculator";
import {
  clearTransactionDraft,
  readTransactionDraft,
  writeTransactionDraft,
} from "@/lib/pwa/transaction-draft";
import {
  formatVietnameseDate,
  formatVietnameseMonth,
  shiftMonth,
  type CategoryOption,
  type MemberOption,
  type TransactionSummary,
  type TransactionView,
} from "@/lib/transactions/data";

export function TransactionsManager({
  transactions,
  categories,
  members,
  summary,
  currentMonth,
  currentUserId,
  view,
  search,
  hasMore,
  nextCursor,
  openNew = false,
}: {
  transactions: TransactionView[];
  categories: CategoryOption[];
  members: MemberOption[];
  summary: TransactionSummary;
  currentMonth: string;
  currentUserId: string;
  view: "month" | "all";
  search: string;
  hasMore: boolean;
  nextCursor: string | null;
  openNew?: boolean;
}) {
  const [editor, setEditor] = useState<TransactionView | "new" | null>(openNew ? "new" : null);
  const groups = useMemo(() => groupTransactions(transactions), [transactions]);
  const queryBase = new URLSearchParams();
  if (view === "all") queryBase.set("view", "all");
  else queryBase.set("month", currentMonth);
  if (search) queryBase.set("q", search);

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

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <form action="/transactions" className="flex gap-2" method="get">
          {view === "all" ? <input name="view" type="hidden" value="all" /> : <input name="month" type="hidden" value={currentMonth} />}
          <Input
            defaultValue={search}
            leading={<Search aria-hidden="true" className="size-4" />}
            name="q"
            placeholder="Tìm theo ghi chú, danh mục, thành viên"
          />
          <Button aria-label="Tìm kiếm" className="mt-auto size-12 shrink-0 p-0" size="icon" type="submit">
            <Search aria-hidden="true" className="size-5" />
          </Button>
        </form>
        <div className="flex items-center gap-2 rounded-2xl border border-forest/10 bg-paper-raised/65 p-1.5">
          <Link
            aria-label="Giao dịch theo tháng"
            className={`grid min-h-10 flex-1 place-items-center rounded-xl px-3 text-sm font-extrabold sm:flex-none ${view === "month" ? "bg-forest text-paper" : "text-ink/48 hover:bg-mist"}`}
            href={`/transactions?month=${currentMonth}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
          >
            Theo tháng
          </Link>
          <Link
            aria-label="Tất cả giao dịch"
            className={`grid min-h-10 flex-1 place-items-center rounded-xl px-3 text-sm font-extrabold sm:flex-none ${view === "all" ? "bg-forest text-paper" : "text-ink/48 hover:bg-mist"}`}
            href={`/transactions?view=all${search ? `&q=${encodeURIComponent(search)}` : ""}`}
          >
            Tất cả
          </Link>
        </div>
      </div>

      {view === "month" ? <MonthControls month={currentMonth} search={search} /> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {groups.length === 0 ? (
            <EmptyState
              action={<Button onClick={() => setEditor("new")}>Thêm giao dịch đầu tiên</Button>}
              description={search ? "Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm." : "Ghi lại khoản thu chi đầu tiên để bắt đầu theo dõi dòng tiền."}
              title={search ? "Không tìm thấy giao dịch" : "Chưa có giao dịch"}
            />
          ) : (
            groups.map((group) => (
              <Card key={group.date}>
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
                  <h2 className="text-sm font-extrabold text-ink/68">{group.label}</h2>
                  <span className={`text-sm font-extrabold ${group.total >= 0 ? "text-income" : "text-expense"}`}>{formatSignedMoney(group.total)}</span>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.items.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onEdit={() => setEditor(transaction)}
                    />
                  ))}
                </CardContent>
              </Card>
            ))
          )}
          {hasMore && nextCursor ? (
            <Link
              className="mx-auto flex min-h-12 w-fit items-center rounded-2xl border border-forest/12 bg-paper-raised px-5 text-sm font-extrabold text-forest hover:bg-mist"
              href={`/transactions?${queryBase.toString()}&cursor=${encodeURIComponent(nextCursor)}`}
            >
              Tải thêm giao dịch
            </Link>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo">Tóm tắt {view === "month" ? "tháng" : "dữ liệu"}</p>
            <h2 className="mt-1 text-xl font-extrabold">{summary.count} giao dịch</h2>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <SummaryLine label="Thu nhập" value={formatMoney(summary.income)} tone="income" />
            <SummaryLine label="Chi tiêu" value={formatMoney(summary.expense)} tone="expense" />
            <div className="border-t border-forest/10 pt-3">
              <SummaryLine label="Chênh lệch" value={formatSignedMoney(summary.income - summary.expense)} tone={summary.income - summary.expense >= 0 ? "income" : "expense"} />
            </div>
          </CardContent>
        </Card>
      </div>

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

function MonthControls({ month, search }: { month: string; search: string }) {
  const query = search ? `&q=${encodeURIComponent(search)}` : "";
  return (
    <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-forest/10 bg-paper-raised/65 p-2">
      <Link aria-label="Tháng trước" className="grid size-11 place-items-center rounded-xl text-forest hover:bg-mist" href={`/transactions?month=${shiftMonth(month, -1)}${query}`}>
        <ChevronLeft aria-hidden="true" className="size-5" />
      </Link>
      <form action="/transactions" className="flex items-center gap-2" method="get">
        {search ? <input name="q" type="hidden" value={search} /> : null}
        <input aria-label="Chọn tháng" className="min-h-11 rounded-xl border border-forest/10 bg-paper px-3 text-center text-sm font-extrabold text-forest" defaultValue={month} name="month" type="month" />
        <Button size="sm" type="submit" variant="secondary">Áp dụng</Button>
      </form>
      <Link aria-label="Tháng sau" className="grid size-11 place-items-center rounded-xl text-forest hover:bg-mist" href={`/transactions?month=${shiftMonth(month, 1)}${query}`}>
        <ChevronRight aria-hidden="true" className="size-5" />
      </Link>
      <span className="sr-only">{formatVietnameseMonth(month)}</span>
    </div>
  );
}

function TransactionRow({ transaction, onEdit }: { transaction: TransactionView; onEdit: () => void }) {
  const Icon = CATEGORY_ICONS[transaction.categoryIcon] ?? CATEGORY_ICON_FALLBACK;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-forest/8 bg-white/58 p-3 transition hover:border-forest/18 hover:bg-white">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${transaction.categoryColor}20`, color: transaction.categoryColor }}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={onEdit} type="button">
        <span className="block truncate text-sm font-extrabold text-ink">{transaction.memberName}</span>
        <span className="mt-0.5 block truncate text-xs font-bold text-forest">{transaction.categoryName}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-ink/44">
          {formatVietnameseDate(transaction.transactionDate)}{transaction.note ? ` · ${transaction.note}` : ""}
        </span>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-sm font-extrabold ${transaction.type === "income" ? "text-income" : "text-expense"}`}>
          {transaction.type === "income" ? "+" : "-"}{formatMoney(transaction.amount)}
        </span>
        <div className="flex items-center gap-0.5">
          <Button aria-label={`Sửa giao dịch ${transaction.categoryName}`} onClick={onEdit} size="icon" variant="ghost">
            <Pencil aria-hidden="true" className="size-4" />
          </Button>
          <DeleteTransactionButton transaction={transaction} />
        </div>
      </div>
    </div>
  );
}

function DeleteTransactionButton({ transaction }: { transaction: TransactionView }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(deleteTransactionAction, initialTransactionActionState);

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message ?? "Đã xóa giao dịch.");
      router.refresh();
    } else if (state.status === "error") {
      notify(state.message ?? "Không thể xóa giao dịch.", "error");
    }
  }, [notify, router, state.message, state.status]);

  return (
    <form action={formAction} onSubmit={(event) => {
      if (!transaction.canDelete || !window.confirm("Giao dịch này sẽ bị xóa khỏi household hiện tại.")) event.preventDefault();
    }}>
      <input name="transactionId" type="hidden" value={transaction.id} readOnly />
      <Button aria-label={`Xóa giao dịch ${transaction.categoryName}`} disabled={pending || !transaction.canDelete} size="icon" variant="ghost">
        <Trash2 aria-hidden="true" className="size-4 text-expense" />
      </Button>
    </form>
  );
}

export function TransactionForm({
  transaction,
  categories,
  members,
  currentUserId,
  onClose,
}: {
  transaction?: TransactionView;
  categories: CategoryOption[];
  members: MemberOption[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { notify } = useToast();
  const [type, setType] = useState<CategoryType>(transaction?.type ?? "expense");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [userId, setUserId] = useState(transaction?.userId ?? currentUserId);
  const [amountExpression, setAmountExpression] = useState(transaction ? String(transaction.amount) : "");
  const [transactionDate, setTransactionDate] = useState(transaction?.transactionDate.slice(0, 10) ?? localDateInput());
  const [note, setNote] = useState(transaction?.note ?? "");
  const [showCalculator, setShowCalculator] = useState(false);
  const [draftReady, setDraftReady] = useState(Boolean(transaction));
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const action = transaction ? updateTransactionAction : createTransactionAction;
  const [state, formAction, pending] = useActionState(action, initialTransactionActionState);
  const visibleCategories = categories.filter((category) => category.type === type);
  const amountResult = evaluateAmountExpression(amountExpression);

  useEffect(() => {
    if (transaction) return;

    const timer = window.setTimeout(() => {
      const draft = readTransactionDraft(window.localStorage, currentUserId);
      if (draft) {
        const categoryIsAvailable = categories.some(
          (category) => category.id === draft.categoryId && category.type === draft.type,
        );
        const memberIsAvailable = members.some((member) => member.id === draft.userId);

        setType(draft.type);
        setCategoryId(categoryIsAvailable ? draft.categoryId : "");
        setUserId(memberIsAvailable ? draft.userId : currentUserId);
        setAmountExpression(draft.amountExpression);
        setTransactionDate(draft.transactionDate);
        setNote(draft.note);
        setDraftRestored(true);
        setDraftSavedAt(draft.updatedAt);
      }
      setDraftReady(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [categories, currentUserId, members, transaction]);

  const persistDraft = useCallback((force = false) => {
    if (transaction || (!draftReady && !force)) return null;
    return writeTransactionDraft(window.localStorage, currentUserId, {
      type,
      categoryId,
      userId,
      amountExpression,
      transactionDate,
      note,
    });
  }, [amountExpression, categoryId, currentUserId, draftReady, note, transaction, transactionDate, type, userId]);

  const closeForm = useCallback(() => {
    if (!transaction && draftDirty) {
      const saved = persistDraft(true);
      if (saved) setDraftSavedAt(saved.updatedAt);
    }
    onClose();
  }, [draftDirty, onClose, persistDraft, transaction]);

  useEffect(() => {
    if (transaction || !draftReady || !draftDirty) return;
    const timer = window.setTimeout(() => {
      const saved = persistDraft();
      if (saved) setDraftSavedAt(saved.updatedAt);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draftDirty, draftReady, persistDraft, transaction]);

  useEffect(() => {
    if (state.status !== "success") return;
    if (!transaction) clearTransactionDraft(window.localStorage, currentUserId);
    notify(state.message ?? (transaction ? "Đã cập nhật giao dịch." : "Đã lưu giao dịch."));
    router.refresh();
    onClose();
  }, [currentUserId, notify, onClose, router, state.message, state.status, transaction]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!online) {
      event.preventDefault();
      if (transaction) {
        notify("Cần kết nối mạng để lưu thay đổi giao dịch.", "error");
        return;
      }

      const saved = persistDraft(true);
      if (!saved) {
        notify("Không thể lưu nháp trên thiết bị này.", "error");
        return;
      }
      setDraftSavedAt(saved.updatedAt);
      notify("Đã lưu nháp giao dịch trên thiết bị.");
      onClose();
      return;
    }

    if (!amountResult.isValid || amountResult.value === null || amountResult.value <= 0 || !categoryId || !userId || !transactionDate) {
      event.preventDefault();
    }
  };

  const selectType = (nextType: CategoryType) => {
    setDraftDirty(true);
    setType(nextType);
    const first = categories.find((category) => category.type === nextType);
    setCategoryId(first?.id ?? "");
  };

  const appendCalculator = (value: string) => {
    setDraftDirty(true);
    setAmountExpression((current) => `${current}${value}`);
  };
  const clearCalculator = () => {
    setDraftDirty(true);
    setAmountExpression("");
  };
  const backspaceCalculator = () => {
    setDraftDirty(true);
    setAmountExpression((current) => current.slice(0, -1));
  };
  const calculate = () => {
    if (amountResult.isValid && amountResult.value !== null) {
      setDraftDirty(true);
      setAmountExpression(String(amountResult.value));
    }
  };

  const discardDraft = () => {
    clearTransactionDraft(window.localStorage, currentUserId);
    setType("expense");
    setCategoryId("");
    setUserId(currentUserId);
    setAmountExpression("");
    setTransactionDate(localDateInput());
    setNote("");
    setDraftDirty(false);
    setDraftRestored(false);
    setDraftSavedAt(null);
  };

  return (
    <Sheet
      closeLabel="Đóng biểu mẫu giao dịch"
      description={online ? "Dữ liệu được lưu ngay vào household hiện tại." : transaction ? "Cần kết nối mạng để lưu thay đổi giao dịch." : "Bạn đang offline. Giao dịch mới sẽ được giữ thành bản nháp trên thiết bị."}
      onClose={pending ? () => undefined : closeForm}
      open
      title={transaction ? "Sửa giao dịch" : "Thêm giao dịch"}
    >
      <form action={formAction} className="grid gap-4" onSubmit={handleSubmit}>
        {transaction ? <input name="transactionId" type="hidden" value={transaction.id} readOnly /> : null}
        {state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}
        {!transaction && (draftRestored || draftDirty || !online) ? (
          <div className="flex items-start gap-3 rounded-2xl border border-forest/10 bg-mint-soft/72 p-3 text-sm text-forest" role="status">
            <FileClock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{draftRestored ? "Đã khôi phục bản nháp" : online ? "Đang tự động lưu bản nháp" : "Bản nháp lưu trên thiết bị"}</p>
              <p className="mt-0.5 text-xs font-semibold leading-5 text-forest/62">
                {draftSavedAt ? `Cập nhật lúc ${formatDraftTime(draftSavedAt)}. Không chứa thông tin đăng nhập.` : "Nháp sẽ được giữ khi bạn đóng biểu mẫu."}
              </p>
            </div>
            <button className="min-h-9 rounded-xl px-2 text-xs font-extrabold hover:bg-forest/8" onClick={discardDraft} type="button">
              Xóa nháp
            </button>
          </div>
        ) : null}
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold text-ink/76">Loại giao dịch</legend>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-mist/75 p-1.5">
            <button aria-pressed={type === "expense"} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold ${type === "expense" ? "bg-paper-raised text-expense shadow-sm" : "text-ink/48"}`} onClick={() => selectType("expense")} type="button">
              <ArrowDownRight aria-hidden="true" className="size-4" /> Chi tiêu
            </button>
            <button aria-pressed={type === "income"} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold ${type === "income" ? "bg-paper-raised text-income shadow-sm" : "text-ink/48"}`} onClick={() => selectType("income")} type="button">
              <ArrowUpRight aria-hidden="true" className="size-4" /> Thu nhập
            </button>
          </div>
        </fieldset>

        <div>
          <Input
            aria-invalid={state.fieldErrors?.amountExpression ? true : undefined}
            disabled={pending}
            inputMode="decimal"
            label="Số tiền hoặc biểu thức"
            name="amountExpression"
            onChange={(event) => {
              setDraftDirty(true);
              setAmountExpression(event.target.value);
            }}
            placeholder="Ví dụ: 125.000 + 25.000"
            value={amountExpression}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className={`text-xs font-semibold ${amountResult.isValid && amountResult.value ? "text-income" : "text-ink/45"}`}>
              {amountResult.isValid && amountResult.value ? `Kết quả: ${formatMoney(amountResult.value)}` : amountResult.errorMessage ?? "Có thể nhập phép tính + − × ÷ %"}
            </p>
            <Button onClick={() => setShowCalculator((open) => !open)} size="sm" type="button" variant="secondary">
              {showCalculator ? "Ẩn máy tính" : "Mở máy tính"}
            </Button>
          </div>
          {state.fieldErrors?.amountExpression ? <p className="mt-2 text-xs font-semibold text-expense">{state.fieldErrors.amountExpression}</p> : null}
          {showCalculator ? <CalculatorPad onAppend={appendCalculator} onBackspace={backspaceCalculator} onCalculate={calculate} onClear={clearCalculator} /> : null}
        </div>

        <Select disabled={pending || visibleCategories.length === 0} label="Danh mục" name="categoryId" onChange={(event) => {
          setDraftDirty(true);
          setCategoryId(event.target.value);
        }} required value={categoryId}>
          <option disabled value="">{visibleCategories.length ? "Chọn danh mục" : "Chưa có danh mục phù hợp"}</option>
          {visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
        {state.fieldErrors?.categoryId ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.categoryId}</p> : null}

        <Select disabled={pending || members.length === 0} label="Người thực hiện" name="userId" onChange={(event) => {
          setDraftDirty(true);
          setUserId(event.target.value);
        }} required value={userId}>
          <option disabled value="">Chọn thành viên</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.id === currentUserId ? `Bạn · ${member.name}` : member.name}</option>)}
        </Select>
        {state.fieldErrors?.userId ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.userId}</p> : null}

        <Input disabled={pending} label="Ngày giao dịch" name="transactionDate" onChange={(event) => {
          setDraftDirty(true);
          setTransactionDate(event.target.value);
        }} required type="date" value={transactionDate} />
        {state.fieldErrors?.transactionDate ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.transactionDate}</p> : null}

        <label className="text-sm font-bold text-ink/76">
          <span className="mb-2 block">Ghi chú</span>
          <textarea className="min-h-24 w-full resize-y rounded-2xl border border-forest/12 bg-paper-raised/86 px-4 py-3 text-base font-semibold text-ink outline-none transition placeholder:text-ink/34 focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10" disabled={pending} maxLength={240} name="note" onChange={(event) => {
            setDraftDirty(true);
            setNote(event.target.value);
          }} placeholder="Ví dụ: Mua đồ ăn cuối tuần" value={note} />
        </label>
        {state.fieldErrors?.note ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.note}</p> : null}

        <div className="grid grid-cols-[0.72fr_1.28fr] gap-3 pt-1">
          <Button disabled={pending} onClick={closeForm} type="button" variant="secondary">Hủy</Button>
          <Button disabled={pending || visibleCategories.length === 0 || members.length === 0 || (!online && Boolean(transaction))} type="submit">
            {pending ? "Đang lưu..." : !online && !transaction ? "Lưu bản nháp" : transaction ? "Lưu thay đổi" : "Lưu giao dịch"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function CalculatorPad({ onAppend, onBackspace, onCalculate, onClear }: { onAppend: (value: string) => void; onBackspace: () => void; onCalculate: () => void; onClear: () => void }) {
  const keys = ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "%", "+"];
  return (
    <div className="mt-3 rounded-2xl border border-forest/10 bg-mist/45 p-2">
      <div className="grid grid-cols-4 gap-2">
        {keys.map((key) => <button className="min-h-11 rounded-xl bg-paper-raised text-sm font-extrabold text-forest shadow-sm hover:bg-white" key={key} onClick={() => onAppend(key)} type="button">{key}</button>)}
        <button className="min-h-11 rounded-xl bg-rose/35 text-sm font-extrabold text-expense" onClick={onClear} type="button">AC</button>
        <button className="min-h-11 rounded-xl bg-paper-raised text-sm font-extrabold text-forest" onClick={onBackspace} type="button">⌫</button>
        <button className="col-span-2 min-h-11 rounded-xl bg-forest text-sm font-extrabold text-paper" onClick={onCalculate} type="button">= Tính kết quả</button>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, tone }: { label: string; value: string; tone: "income" | "expense" }) {
  return <div className="flex items-center justify-between gap-4"><span className="font-semibold text-ink/48">{label}</span><span className={`font-extrabold ${tone === "income" ? "text-income" : "text-expense"}`}>{value}</span></div>;
}

function formatMoney(value: number) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${formatted} đ`;
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(value)}`;
}

function localDateInput() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatDraftTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function groupTransactions(transactions: TransactionView[]) {
  const groups = new Map<string, { date: string; label: string; total: number; items: TransactionView[] }>();
  for (const transaction of transactions) {
    const date = transaction.transactionDate.slice(0, 10);
    const group = groups.get(date) ?? { date, label: formatVietnameseDate(transaction.transactionDate), total: 0, items: [] };
    group.total += transaction.type === "income" ? transaction.amount : -transaction.amount;
    group.items.push(transaction);
    groups.set(date, group);
  }
  return [...groups.values()];
}
