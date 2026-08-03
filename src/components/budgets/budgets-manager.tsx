"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  cloneBudgetAction,
  deleteBudgetAction,
  reorderBudgetsAction,
  upsertBudgetAction,
} from "@/app/(app)/budgets/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/status-state";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { initialBudgetActionState, type BudgetActionState } from "@/lib/budgets/action-state";
import { formatVietnameseMonth, shiftMonth, type BudgetPageData, type BudgetView } from "@/lib/budgets/data";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";

export function BudgetsManager({ data }: { data: BudgetPageData }) {
  const router = useRouter();
  const { notify } = useToast();
  const [editor, setEditor] = useState<BudgetView | "new" | null>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [preferredOrderIds, setPreferredOrderIds] = useState(() => configuredBudgets(data.budgets).map((budget) => budget.id));
  const reorderFormRef = useRef<HTMLFormElement>(null);
  const orderedIdsInputRef = useRef<HTMLInputElement>(null);
  const rollbackOrderRef = useRef<string[] | null>(null);
  const reorderWithRollback = useCallback(async (previousState: BudgetActionState, formData: FormData) => {
    const result = await reorderBudgetsAction(previousState, formData);
    if (result.status === "error" && rollbackOrderRef.current) {
      setPreferredOrderIds(rollbackOrderRef.current);
      rollbackOrderRef.current = null;
    }
    return result;
  }, []);
  const [reorderState, reorderAction, reorderPending] = useActionState(reorderWithRollback, initialBudgetActionState);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const budgetedCategories = useMemo(() => new Set(data.budgets.filter((budget) => budget.id).map((budget) => budget.categoryId)), [data.budgets]);
  const availableCategories = data.categories.filter((category) => !budgetedCategories.has(category.id));
  const unconfiguredBudgets = data.budgets.filter((budget) => !budget.id);
  const orderedBudgets = orderConfiguredBudgets(configuredBudgets(data.budgets), preferredOrderIds);

  useEffect(() => {
    if (reorderState.status === "success") {
      rollbackOrderRef.current = null;
      notify(reorderState.message ?? "Đã cập nhật thứ tự ngân sách.");
      router.refresh();
    } else if (reorderState.status === "error") {
      notify(reorderState.message ?? "Không thể đổi thứ tự ngân sách.", "error");
    }
  }, [notify, reorderState, router]);

  const commitOrder = (nextBudgets: ConfiguredBudget[]) => {
    if (reorderPending || sameBudgetOrder(orderedBudgets, nextBudgets)) return;
    rollbackOrderRef.current = orderedBudgets.map((budget) => budget.id);
    setPreferredOrderIds(nextBudgets.map((budget) => budget.id));
    if (orderedIdsInputRef.current) {
      orderedIdsInputRef.current.value = JSON.stringify(nextBudgets.map((budget) => budget.id));
    }
    reorderFormRef.current?.requestSubmit();
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = orderedBudgets.findIndex((budget) => budget.id === active.id);
    const newIndex = orderedBudgets.findIndex((budget) => budget.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commitOrder(arrayMove(orderedBudgets, oldIndex, newIndex));
  };

  const moveBudget = (budgetId: string, direction: "up" | "down") => {
    const currentIndex = orderedBudgets.findIndex((budget) => budget.id === budgetId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedBudgets.length) return;
    commitOrder(arrayMove(orderedBudgets, currentIndex, nextIndex));
  };

  return (
    <>
      <PageHeader
        action={<div className="grid gap-2 sm:flex"><Button className="w-full sm:w-auto" onClick={() => setCloneOpen(true)} variant="secondary"><Sparkles aria-hidden="true" className="size-4" /> Sao chép tháng</Button><Button className="w-full sm:w-auto" onClick={() => setEditor("new")}><Plus aria-hidden="true" className="size-4" /> Thêm ngân sách</Button></div>}
        description="Đặt giới hạn theo danh mục để biết mình còn bao nhiêu trước khoản chi tiếp theo."
        eyebrow="Giới hạn chủ động"
        title="Ngân sách"
      />

      <MonthControls month={data.month} />
      <BudgetSummaryCard data={data} />

      <section className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo">Theo danh mục</p><h2 className="mt-1 text-xl font-extrabold">Ngân sách {formatVietnameseMonth(data.month)}</h2></div>
            <span className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-forest">{data.budgets.filter((budget) => budget.id).length}/{data.categories.length} danh mục</span>
          </CardHeader>
          <CardContent>
            {data.budgets.length === 0 ? (
              <EmptyState action={<Button onClick={() => setEditor("new")}>Thêm ngân sách đầu tiên</Button>} description="Tạo danh mục chi tiêu trước khi đặt giới hạn." title="Chưa có danh mục chi tiêu" />
            ) : (
              <>
                <form action={reorderAction} className="sr-only" ref={reorderFormRef}>
                  <input
                    defaultValue={JSON.stringify(orderedBudgets.map((budget) => budget.id))}
                    name="orderedIds"
                    readOnly
                    ref={orderedIdsInputRef}
                    type="hidden"
                  />
                </form>

                {orderedBudgets.length > 0 ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-mist/55 px-3 py-2.5 text-xs font-bold text-forest/58">
                      <span className="flex items-center gap-2">
                        <GripVertical aria-hidden="true" className="size-4 text-indigo" />
                        Kéo tay nắm để thay đổi thứ tự
                      </span>
                      {reorderPending ? <span className="shrink-0 text-indigo">Đang lưu...</span> : null}
                    </div>
                    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
                      <SortableContext items={orderedBudgets.map((budget) => budget.id)} strategy={verticalListSortingStrategy}>
                        <div aria-label="Ngân sách đã thiết lập" className="space-y-3" role="list">
                          {orderedBudgets.map((budget, index) => (
                            <SortableBudgetRow
                              budget={budget}
                              canMoveDown={index < orderedBudgets.length - 1}
                              canMoveUp={index > 0}
                              key={budget.id}
                              onEdit={() => setEditor(budget)}
                              onMove={moveBudget}
                              pending={reorderPending}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                    {reorderState.fieldErrors?.orderedIds ? <p className="mt-2 text-xs font-semibold text-expense">{reorderState.fieldErrors.orderedIds}</p> : null}
                  </div>
                ) : null}

                {unconfiguredBudgets.length > 0 ? (
                  <div className={orderedBudgets.length > 0 ? "mt-6 border-t border-forest/10 pt-5" : ""}>
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo">Chưa thiết lập</p>
                        <p className="mt-1 text-sm font-bold text-ink/48">Đặt giới hạn trước khi sắp xếp</p>
                      </div>
                      <span className="text-xs font-bold text-forest/42">{unconfiguredBudgets.length} danh mục</span>
                    </div>
                    <div aria-label="Danh mục chưa thiết lập ngân sách" className="space-y-3" role="list">
                      {unconfiguredBudgets.map((budget) => (
                        <BudgetRow
                          budget={budget}
                          dragHandle={<span aria-label="Đặt ngân sách để có thể sắp xếp" className="grid size-10 shrink-0 place-items-center rounded-xl text-forest/18" role="img"><GripVertical aria-hidden="true" className="size-5" /></span>}
                          key={budget.categoryId}
                          onEdit={() => setEditor(budget)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
            {availableCategories.length > 0 && data.budgets.length > 0 ? <Button className="mt-4 w-full" onClick={() => setEditor("new")} variant="secondary"><Plus aria-hidden="true" className="size-4" /> Thêm danh mục vào ngân sách</Button> : null}
          </CardContent>
        </Card>
      </section>

      {editor ? <BudgetForm budget={editor === "new" ? undefined : editor} categories={editor === "new" ? availableCategories : data.categories} month={data.month} onClose={() => setEditor(null)} /> : null}
      {cloneOpen ? <CloneBudgetSheet month={data.month} onClose={() => setCloneOpen(false)} /> : null}
    </>
  );
}

function BudgetSummaryCard({ data }: { data: BudgetPageData }) {
  const ratio = Math.min(1, Math.max(0, data.summary.usedPercent));
  const warning = data.summary.remaining < 0 || data.summary.usedPercent >= 0.8;
  return <Card className="mt-4 overflow-hidden border-0 bg-ink text-paper"><CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-end sm:p-8"><div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-yellow">Tổng quan tháng</p><p className="mt-3 text-4xl font-extrabold tracking-[-0.055em] sm:text-5xl">{formatMoney(data.summary.totalBudget)}</p><p className="mt-2 text-sm font-medium text-paper/52">tổng giới hạn · đã chi {formatMoney(data.summary.totalExpense)}</p><div className="mt-5 h-2.5 overflow-hidden rounded-full bg-paper/12"><div className={`h-full rounded-full ${warning ? "bg-rose" : "bg-mint"}`} style={{ width: `${ratio * 100}%` }} /></div></div><div className={`rounded-2xl px-4 py-3 text-sm font-bold ${data.summary.remaining < 0 ? "bg-expense/30 text-rose" : "bg-paper/8 text-mint"}`}>{data.summary.remaining < 0 ? `Vượt ${formatMoney(Math.abs(data.summary.remaining))}` : `Còn ${formatMoney(data.summary.remaining)}`}</div></CardContent></Card>;
}

type ConfiguredBudget = BudgetView & { id: string };

function SortableBudgetRow({
  budget,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMove,
  pending,
}: {
  budget: ConfiguredBudget;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onMove: (budgetId: string, direction: "up" | "down") => void;
  pending: boolean;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: budget.id, disabled: pending });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <BudgetRow
      budget={budget}
      canMoveDown={canMoveDown}
      canMoveUp={canMoveUp}
      containerRef={setNodeRef}
      dragHandle={(
        <button
          {...attributes}
          {...listeners}
          aria-label={`Kéo để sắp xếp ngân sách ${budget.categoryName}`}
          className="grid size-10 shrink-0 touch-none place-items-center rounded-xl text-forest/38 transition hover:bg-mist hover:text-indigo active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-35 sm:cursor-grab"
          disabled={pending}
          ref={setActivatorNodeRef}
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
      )}
      isDragging={isDragging}
      onEdit={onEdit}
      onMove={(direction) => onMove(budget.id, direction)}
      pending={pending}
      style={style}
    />
  );
}

function BudgetRow({
  budget,
  canMoveUp = false,
  canMoveDown = false,
  containerRef,
  dragHandle,
  isDragging = false,
  onEdit,
  onMove,
  pending = false,
  style,
}: {
  budget: BudgetView;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  containerRef?: (node: HTMLDivElement | null) => void;
  dragHandle: ReactNode;
  isDragging?: boolean;
  onEdit: () => void;
  onMove?: (direction: "up" | "down") => void;
  pending?: boolean;
  style?: CSSProperties;
}) {
  const Icon = CATEGORY_ICONS[budget.categoryIcon] ?? CATEGORY_ICON_FALLBACK;
  const hasBudget = Boolean(budget.id);
  const ratio = hasBudget && budget.amount > 0 ? budget.spent / budget.amount : 0;
  const over = hasBudget && budget.spent > budget.amount;
  const near = hasBudget && !over && ratio >= 0.8;
  return (
    <div
      className={`rounded-2xl border bg-white/58 p-3 transition-[border-color,background-color,box-shadow,opacity] ${isDragging ? "relative z-10 border-indigo/35 bg-paper-raised opacity-90 shadow-[0_22px_50px_rgba(31,61,43,0.18)]" : "border-forest/8 hover:border-forest/18 hover:bg-white"}`}
      ref={containerRef}
      role="listitem"
      style={style}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        {dragHandle}
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${budget.categoryColor}20`, color: budget.categoryColor }}>
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{budget.categoryName}</p>
          <p className={`mt-0.5 truncate text-xs font-semibold ${over ? "text-expense" : near ? "text-yellow-700" : "text-ink/44"}`}>{statusText(budget, ratio)}</p>
        </div>
        <span className={`shrink-0 text-sm font-extrabold ${over ? "text-expense" : "text-forest"}`}>{hasBudget ? formatMoney(budget.amount) : "Chưa đặt"}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist"><div className={`h-full rounded-full ${over ? "bg-expense" : near ? "bg-yellow" : "bg-forest"}`} style={{ width: `${hasBudget ? Math.min(100, Math.max(0, ratio * 100)) : 0}%` }} /></div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold"><span>{formatMoney(budget.spent)} đã chi</span><span className={over ? "text-expense" : "text-ink/42"}>{hasBudget ? (over ? `Vượt ${formatMoney(budget.spent - budget.amount)}` : `Còn ${formatMoney(budget.amount - budget.spent)}`) : "Chưa đặt ngân sách"}</span></div>
      <div className="mt-2 flex items-center justify-end gap-1">
        {hasBudget && onMove ? (
          <>
            <Button aria-label={`Đưa ngân sách ${budget.categoryName} lên`} disabled={!canMoveUp || pending} onClick={() => onMove("up")} size="icon" type="button" variant="ghost"><ArrowUp aria-hidden="true" className="size-4" /></Button>
            <Button aria-label={`Đưa ngân sách ${budget.categoryName} xuống`} disabled={!canMoveDown || pending} onClick={() => onMove("down")} size="icon" type="button" variant="ghost"><ArrowDown aria-hidden="true" className="size-4" /></Button>
          </>
        ) : null}
        <Button aria-label={`${hasBudget ? "Sửa" : "Thêm"} ngân sách ${budget.categoryName}`} onClick={onEdit} size="icon" variant="ghost">{hasBudget ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}</Button>
        {hasBudget ? <DeleteBudgetButton budget={budget} /> : null}
      </div>
    </div>
  );
}

function DeleteBudgetButton({ budget }: { budget: BudgetView }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(deleteBudgetAction, initialBudgetActionState);
  useEffect(() => { if (state.status === "success") { notify(state.message ?? "Đã xóa ngân sách."); router.refresh(); } else if (state.status === "error") notify(state.message ?? "Không thể xóa ngân sách.", "error"); }, [notify, router, state.message, state.status]);
  return (
    <ConfirmAction
      action={formAction}
      confirmLabel="Xóa ngân sách"
      description={`Giới hạn của danh mục ${budget.categoryName} trong tháng này sẽ bị xóa. Các giao dịch đã ghi vẫn được giữ nguyên.`}
      pending={pending}
      title="Xóa ngân sách này?"
      trigger={(openDialog) => (
        <Button aria-label={`Xóa ngân sách ${budget.categoryName}`} disabled={pending} onClick={openDialog} size="icon" type="button" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4 text-expense" />
        </Button>
      )}
    >
      <input name="budgetId" readOnly type="hidden" value={budget.id ?? ""} />
    </ConfirmAction>
  );
}

function BudgetForm({ budget, categories, month, onClose }: { budget?: BudgetView; categories: BudgetPageData["categories"]; month: string; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(upsertBudgetAction, initialBudgetActionState);
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? categories[0]?.id ?? "");
  const [amount, setAmount] = useState(budget ? String(Math.round(budget.amount)) : "");
  useEffect(() => { if (state.status === "success") { router.refresh(); onClose(); } }, [onClose, router, state.status]);
  const category = categories.find((item) => item.id === categoryId);
  return <Sheet closeLabel="Đóng biểu mẫu ngân sách" description="Ngân sách chỉ áp dụng cho danh mục chi tiêu của tháng đã chọn." onClose={pending ? () => undefined : onClose} open title={budget ? `Sửa ngân sách · ${budget.categoryName}` : "Thêm ngân sách"}><form action={formAction} className="grid gap-4"><input name="month" readOnly type="hidden" value={month} />{budget ? <input name="categoryId" readOnly type="hidden" value={categoryId} /> : null}{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<Select disabled={pending || Boolean(budget)} label="Danh mục chi tiêu" name={budget ? undefined : "categoryId"} onChange={(event) => setCategoryId(event.target.value)} required value={categoryId}><option disabled value="">Chọn danh mục</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>{state.fieldErrors?.categoryId ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.categoryId}</p> : null}<Input disabled={pending} inputMode="decimal" label="Giới hạn ngân sách (đồng)" name="amount" onChange={(event) => setAmount(event.target.value)} placeholder="Ví dụ: 3.500.000" required value={amount} />{state.fieldErrors?.amount ? <p className="-mt-2 text-xs font-semibold text-expense">{state.fieldErrors.amount}</p> : null}{category ? <p className="rounded-2xl bg-mist/70 px-4 py-3 text-xs font-semibold leading-5 text-ink/52">Đã chi {formatMoney(budget?.spent ?? 0)} trong tháng này. {budget && budget.amount > 0 ? `Đang dùng ${Math.round((budget.spent / budget.amount) * 100)}%.` : "Chưa có giới hạn trước đó."}</p> : null}<div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending || !categoryId} type="submit">{pending ? "Đang lưu..." : "Lưu ngân sách"}</Button></div></form></Sheet>;
}

function CloneBudgetSheet({ month, onClose }: { month: string; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(cloneBudgetAction, initialBudgetActionState);
  useEffect(() => { if (state.status === "success") { router.refresh(); onClose(); } }, [onClose, router, state.status]);
  return <Sheet closeLabel="Đóng sao chép ngân sách" description="Chỉ sao chép khi tháng hiện tại chưa có ngân sách. Dữ liệu cũ sẽ không bị ghi đè." onClose={pending ? () => undefined : onClose} open title="Sao chép ngân sách"><form action={formAction} className="grid gap-4"><input name="month" readOnly type="hidden" value={month} />{state.status === "error" && state.message ? <AuthFeedback message={state.message} /> : null}<div className="rounded-2xl bg-mint-soft p-4 text-sm font-semibold leading-6 text-forest"><CheckCircle2 aria-hidden="true" className="mb-2 size-5" />Hệ thống sẽ tìm tháng trước gần nhất có dữ liệu và sao chép giới hạn theo từng danh mục.</div><div className="grid grid-cols-[0.72fr_1.28fr] gap-3"><Button disabled={pending} onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending} type="submit">{pending ? "Đang sao chép..." : "Sao chép tháng trước"}</Button></div></form></Sheet>;
}

function MonthControls({ month }: { month: string }) {
  return <div className="flex items-center justify-between gap-2 rounded-2xl border border-forest/10 bg-paper-raised/65 p-2"><Link aria-label="Tháng trước" className="grid size-11 place-items-center rounded-xl text-forest hover:bg-mist" href={`/budgets?month=${shiftMonth(month, -1)}`}><ChevronLeft aria-hidden="true" className="size-5" /></Link><form action="/budgets" className="flex items-center gap-2" method="get"><CalendarDays aria-hidden="true" className="hidden size-4 text-indigo sm:block" /><input aria-label="Chọn tháng ngân sách" className="min-h-11 w-[9rem] rounded-xl border border-forest/10 bg-paper px-3 text-center text-sm font-extrabold text-forest" defaultValue={month} name="month" type="month" /><Button size="sm" type="submit" variant="secondary">Áp dụng</Button></form><Link aria-label="Tháng sau" className="grid size-11 place-items-center rounded-xl text-forest hover:bg-mist" href={`/budgets?month=${shiftMonth(month, 1)}`}><ChevronRight aria-hidden="true" className="size-5" /></Link></div>;
}

function statusText(budget: BudgetView, ratio: number) {
  if (!budget.id) return budget.spent > 0 ? "Chưa đặt ngân sách, đã có phát sinh chi." : "Chưa đặt ngân sách.";
  if (budget.spent > budget.amount) return `Vượt ngân sách ${formatMoney(budget.spent - budget.amount)}`;
  if (ratio >= 0.8) return `Sắp vượt ngân sách (${Math.round(ratio * 100)}%).`;
  return `Bình thường (${Math.round(ratio * 100)}%).`;
}

function configuredBudgets(items: BudgetView[]): ConfiguredBudget[] {
  return items.filter((budget): budget is ConfiguredBudget => typeof budget.id === "string");
}

function orderConfiguredBudgets(items: ConfiguredBudget[], preferredOrderIds: string[]) {
  const byId = new Map(items.map((budget) => [budget.id, budget]));
  const preferred = preferredOrderIds.flatMap((id) => {
    const budget = byId.get(id);
    if (!budget) return [];
    byId.delete(id);
    return [budget];
  });
  return [...preferred, ...byId.values()];
}

function sameBudgetOrder(current: ConfiguredBudget[], next: ConfiguredBudget[]) {
  return current.length === next.length && current.every((budget, index) => budget.id === next[index]?.id);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.abs(value))} đ`;
}
