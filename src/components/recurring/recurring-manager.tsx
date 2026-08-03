"use client";

import { useActionState, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  Clock3,
  Pencil,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  UsersRound,
  WalletCards,
} from "lucide-react";

import {
  createRecurringRuleAction,
  deleteRecurringRuleAction,
  materializeRecurringTransactionsAction,
  toggleRecurringRuleAction,
  updateRecurringRuleAction,
} from "@/app/(app)/recurring/actions";
import { PageHeader } from "@/components/app/page-header";
import { RecurringReminderSettings } from "@/components/recurring/recurring-reminder-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/status-state";
import { useToast } from "@/components/ui/toast";
import { initialRecurringActionState } from "@/lib/recurring/action-state";
import {
  describeRecurringSchedule,
  currentVietnamDate,
  isRuleDue,
  type RecurringPageData,
  type RecurringRuleView,
} from "@/lib/recurring/data";
import type { CategoryOption, MemberOption } from "@/lib/transactions/data";

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function RecurringManager({
  currentUserId,
  data,
}: {
  currentUserId: string;
  data: RecurringPageData;
}) {
  const [editor, setEditor] = useState<RecurringRuleView | "new" | null>(null);
  const dueRules = data.rules.filter((rule) => rule.isActive && isRuleDue(rule, data.today));
  const upcomingRules = data.rules.filter((rule) => rule.isActive && !isRuleDue(rule, data.today));
  const pausedRules = data.rules.filter((rule) => !rule.isActive);

  return (
    <>
      <PageHeader
        action={(
          <Button className="w-full sm:w-auto" onClick={() => setEditor("new")}>
            <Plus aria-hidden="true" className="size-4" /> Tạo lịch mới
          </Button>
        )}
        description="Tự động chuẩn bị các khoản lặp theo tuần hoặc tháng, rồi ghi vào sổ đúng một lần khi đến hạn."
        eyebrow="Nhịp tiền đều đặn"
        title="Giao dịch định kỳ"
      />

      <RecurringSummary data={data} />

      {dueRules.length > 0 ? (
        <section className="motion-rise mt-4 rounded-[1.75rem] bg-forest p-5 text-paper shadow-[0_24px_70px_rgba(31,61,43,0.24)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-yellow text-ink">
              <Clock3 aria-hidden="true" className="size-6" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-mint">Cần xử lý</p>
              <h2 className="mt-1 text-xl font-extrabold">{dueRules.length} lịch đã đến hạn</h2>
              <p className="mt-2 max-w-xl text-sm font-medium leading-6 text-paper/62">
                Mỗi kỳ được khóa bằng ngày đến hạn. Bấm lại hoặc mất mạng giữa chừng cũng không tạo giao dịch trùng.
              </p>
            </div>
          </div>
          <MaterializeButton className="mt-5 w-full sm:mt-0 sm:w-auto" />
        </section>
      ) : (
        <div className="motion-rise mt-4 flex items-center gap-3 rounded-2xl border border-income/14 bg-mint-soft/70 px-4 py-3 text-sm font-bold text-forest">
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-income" />
          Không có lịch nào cần ghi hôm nay.
        </div>
      )}

      <RecurringReminderSettings dueCount={data.dueCount} userId={currentUserId} />

      <section className="mt-7 space-y-7">
        <RuleSection
          emptyDescription="Các lịch đến hạn sẽ xuất hiện ở đây để bạn ghi vào sổ."
          emptyTitle="Không có lịch quá hạn"
          eyebrow="Ưu tiên hôm nay"
          onEdit={setEditor}
          rules={dueRules}
          title="Đến hạn"
        />
        <RuleSection
          emptyDescription="Tạo một khoản lặp để không quên tiền nhà, lương, điện nước hoặc tiết kiệm."
          emptyTitle="Chưa có lịch sắp tới"
          eyebrow="Nhìn trước dòng tiền"
          onEdit={setEditor}
          rules={upcomingRules}
          title="Sắp tới"
        />
        {pausedRules.length > 0 ? (
          <RuleSection
            emptyDescription=""
            emptyTitle=""
            eyebrow="Không tạo kỳ mới"
            onEdit={setEditor}
            rules={pausedRules}
            title="Đã tạm dừng"
          />
        ) : null}
      </section>

      {editor ? (
        <RecurringRuleForm
          categories={data.categories}
          currentUserId={currentUserId}
          members={data.members}
          onClose={() => setEditor(null)}
          rule={editor === "new" ? undefined : editor}
          today={data.today}
        />
      ) : null}
    </>
  );
}

function RecurringSummary({ data }: { data: RecurringPageData }) {
  const balance = data.estimatedMonthlyAmount;
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <Card className="motion-rise overflow-hidden bg-forest text-paper">
        <CardContent className="flex items-center gap-4 pt-5 sm:pt-6">
          <div className="grid size-11 place-items-center rounded-2xl bg-paper/10 text-yellow">
            <Repeat2 aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-paper/56">Lịch đang chạy</p>
            <p className="mt-0.5 text-2xl font-extrabold">{data.activeCount}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="motion-rise motion-delay-1">
        <CardContent className="flex items-center gap-4 pt-5 sm:pt-6">
          <div className="grid size-11 place-items-center rounded-2xl bg-yellow text-ink">
            <CalendarClock aria-hidden="true" className="size-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-ink/48">Đến hạn hôm nay</p>
            <p className="mt-0.5 text-2xl font-extrabold text-ink">{data.dueCount}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="motion-rise motion-delay-2">
        <CardContent className="flex items-center gap-4 pt-5 sm:pt-6">
          <div className="grid size-11 place-items-center rounded-2xl bg-mint-soft text-income">
            <WalletCards aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink/48">Cân đối ước tính/tháng</p>
            <p className={balance >= 0 ? "mt-0.5 truncate text-xl font-extrabold text-income" : "mt-0.5 truncate text-xl font-extrabold text-expense"}>
              {balance >= 0 ? "+" : ""}{currencyFormatter.format(Math.round(balance))}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function RuleSection({
  emptyDescription,
  emptyTitle,
  eyebrow,
  onEdit,
  rules,
  title,
}: {
  emptyDescription: string;
  emptyTitle: string;
  eyebrow: string;
  onEdit: (rule: RecurringRuleView) => void;
  rules: RecurringRuleView[];
  title: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">{title}</h2>
        </div>
        <span className="rounded-full bg-mist px-3 py-1.5 text-xs font-extrabold text-forest">{rules.length}</span>
      </div>
      {rules.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {rules.map((rule) => <RuleCard key={rule.id} onEdit={() => onEdit(rule)} rule={rule} />)}
        </div>
      ) : (
        <EmptyState description={emptyDescription} title={emptyTitle} />
      )}
    </div>
  );
}

function RuleCard({ rule, onEdit }: { rule: RecurringRuleView; onEdit: () => void }) {
  const due = rule.isActive && isRuleDue(rule, currentVietnamDate());
  const TypeIcon = rule.type === "income" ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className={rule.isActive ? "overflow-hidden" : "overflow-hidden opacity-72"}>
      <div className="h-1.5" style={{ backgroundColor: rule.categoryColor }} />
      <CardHeader className="flex flex-row items-start gap-3">
        <div className={rule.type === "income" ? "grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-soft text-income" : "grid size-11 shrink-0 place-items-center rounded-2xl bg-rose/24 text-expense"}>
          <TypeIcon aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-extrabold">{rule.categoryName}</h3>
            {due ? <span className="rounded-full bg-yellow px-2 py-1 text-[10px] font-extrabold uppercase text-ink">Đến hạn</span> : null}
            {!rule.isActive ? <span className="rounded-full bg-mist px-2 py-1 text-[10px] font-extrabold uppercase text-forest">Đã dừng</span> : null}
          </div>
          <p className={rule.type === "income" ? "mt-1 text-xl font-extrabold text-income" : "mt-1 text-xl font-extrabold text-expense"}>
            {rule.type === "income" ? "+" : "-"}{currencyFormatter.format(rule.amount)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 rounded-2xl bg-mist/58 p-3 text-xs font-bold text-ink/58 sm:grid-cols-2">
          <span className="flex items-center gap-2"><Repeat2 aria-hidden="true" className="size-4 text-indigo" />{describeRecurringSchedule(rule)}</span>
          <span className="flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4 text-forest" />Kỳ tới: {formatDate(rule.nextDueDate)}</span>
          <span className="flex items-center gap-2"><UsersRound aria-hidden="true" className="size-4 text-forest" />{rule.memberName}</span>
          {rule.endDate ? <span className="flex items-center gap-2"><Clock3 aria-hidden="true" className="size-4 text-forest" />Kết thúc: {formatDate(rule.endDate)}</span> : null}
        </div>
        {rule.note ? <p className="mt-3 text-sm font-medium leading-6 text-ink/54">{rule.note}</p> : null}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button aria-label={`Sửa ${rule.categoryName}`} onClick={onEdit} size="sm" variant="secondary"><Pencil aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Sửa</span></Button>
          <ToggleRuleButton rule={rule} />
          <DeleteRuleButton rule={rule} />
        </div>
      </CardContent>
    </Card>
  );
}

function MaterializeButton({ className = "" }: { className?: string }) {
  const [state, action, pending] = useActionState(materializeRecurringTransactionsAction, initialRecurringActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  return (
    <form action={action} className={className}>
      <Button className="w-full" disabled={pending} type="submit" variant="accent">
        <Sparkles aria-hidden="true" className="size-4" /> {pending ? "Đang ghi..." : "Ghi các kỳ đến hạn"}
      </Button>
    </form>
  );
}

function ToggleRuleButton({ rule }: { rule: RecurringRuleView }) {
  const [state, action, pending] = useActionState(toggleRecurringRuleAction, initialRecurringActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  const Icon = rule.isActive ? CirclePause : CirclePlay;
  return (
    <form action={action}>
      <input name="ruleId" type="hidden" value={rule.id} />
      <input name="isActive" type="hidden" value={String(!rule.isActive)} />
      <Button className="w-full" disabled={pending} size="sm" type="submit" variant="secondary">
        <Icon aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{rule.isActive ? "Dừng" : "Tiếp tục"}</span>
      </Button>
    </form>
  );
}

function DeleteRuleButton({ rule }: { rule: RecurringRuleView }) {
  const [state, action, pending] = useActionState(deleteRecurringRuleAction, initialRecurringActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  return (
    <ConfirmAction
      action={action}
      confirmLabel="Xóa lịch"
      description={`Lịch định kỳ “${rule.categoryName}” sẽ bị xóa. Các giao dịch đã được ghi trước đó vẫn được giữ nguyên.`}
      pending={pending}
      title="Xóa lịch định kỳ?"
      trigger={(openDialog) => (
        <Button aria-label={`Xóa ${rule.categoryName}`} className="w-full" disabled={pending} onClick={openDialog} size="sm" type="button" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4 text-expense" /><span className="hidden text-expense sm:inline">Xóa</span>
        </Button>
      )}
    >
      <input name="ruleId" type="hidden" value={rule.id} />
    </ConfirmAction>
  );
}

function RecurringRuleForm({
  categories,
  currentUserId,
  members,
  onClose,
  rule,
  today,
}: {
  categories: CategoryOption[];
  currentUserId: string;
  members: MemberOption[];
  onClose: () => void;
  rule?: RecurringRuleView;
  today: string;
}) {
  const actionHandler = rule ? updateRecurringRuleAction : createRecurringRuleAction;
  const [state, action, pending] = useActionState(actionHandler, initialRecurringActionState);
  const [amount, setAmount] = useState(rule?.amount ?? 0);
  const [frequency, setFrequency] = useState(rule?.frequency ?? "monthly");
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message ?? "Đã lưu giao dịch định kỳ.");
      onClose();
    } else if (state.status === "error" && state.message) {
      notify(state.message, "error");
    }
  }, [notify, onClose, state]);

  return (
    <Sheet
      description="Ngày bắt đầu cũng là kỳ đầu tiên. Lịch chỉ tạo giao dịch khi bạn mở app và xác nhận ghi kỳ đến hạn."
      onClose={onClose}
      open
      title={rule ? "Sửa lịch định kỳ" : "Tạo lịch định kỳ"}
    >
      <form action={action} className="space-y-4">
        {rule ? <input name="ruleId" type="hidden" value={rule.id} /> : null}
        <Select defaultValue={rule?.categoryId ?? ""} error={state.fieldErrors?.categoryId} label="Danh mục" name="categoryId" required>
          <option disabled value="">Chọn danh mục</option>
          <optgroup label="Khoản chi">
            {categories.filter((category) => category.type === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </optgroup>
          <optgroup label="Khoản thu">
            {categories.filter((category) => category.type === "income").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </optgroup>
        </Select>
        <CurrencyInput
          error={state.fieldErrors?.amountExpression}
          hint="Có thể nhập nhanh theo VND."
          label="Số tiền mỗi kỳ"
          name="amountExpression"
          onValueChange={setAmount}
          value={amount}
        />
        <Select defaultValue={rule?.userId ?? currentUserId} error={state.fieldErrors?.userId} label="Người thực hiện" name="userId" required>
          {members.map((member) => <option key={member.id} value={member.id}>{member.id === currentUserId ? "Bạn" : member.name}</option>)}
        </Select>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Select error={state.fieldErrors?.frequency} label="Lặp theo" name="frequency" onChange={(event) => setFrequency(event.target.value as "weekly" | "monthly")} value={frequency}>
            <option value="weekly">Tuần</option>
            <option value="monthly">Tháng</option>
          </Select>
          <Input defaultValue={rule?.intervalCount ?? 1} error={state.fieldErrors?.intervalCount} label="Mỗi" max={12} min={1} name="intervalCount" required type="number" />
        </div>
        <Input
          defaultValue={rule?.nextDueDate ?? today}
          error={state.fieldErrors?.nextDueDate}
          hint={frequency === "weekly" ? "Thứ của ngày này sẽ là ngày lặp hằng tuần." : "Ngày trong tháng này sẽ được giữ; tháng ngắn sẽ dùng ngày cuối tháng."}
          label="Kỳ đầu tiên / kỳ tiếp theo"
          name="nextDueDate"
          required
          type="date"
        />
        <Input defaultValue={rule?.endDate ?? ""} error={state.fieldErrors?.endDate} hint="Để trống nếu lịch không có ngày kết thúc." label="Kết thúc (không bắt buộc)" name="endDate" type="date" />
        <label className="block text-sm font-bold text-ink/76">
          <span className="mb-2 block">Ghi chú</span>
          <textarea
            className="min-h-24 w-full resize-y rounded-2xl border border-forest/12 bg-paper-raised/86 px-4 py-3 text-base font-semibold text-ink outline-none transition placeholder:text-ink/34 focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10"
            defaultValue={rule?.note ?? ""}
            maxLength={240}
            name="note"
            placeholder="Ví dụ: Tiền thuê nhà chuyển ngày 5"
          />
          {state.fieldErrors?.note ? <span className="mt-2 block text-xs font-semibold text-expense">{state.fieldErrors.note}</span> : null}
        </label>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button onClick={onClose} type="button" variant="secondary">Hủy</Button>
          <Button disabled={pending || amount <= 0} type="submit">{pending ? "Đang lưu..." : "Lưu lịch"}</Button>
        </div>
      </form>
    </Sheet>
  );
}

function useActionFeedback(
  state: typeof initialRecurringActionState,
  notify: (message: string, variant?: "success" | "error") => void,
) {
  useEffect(() => {
    if (state.status === "success" && state.message) notify(state.message);
    if (state.status === "error" && state.message) notify(state.message, "error");
  }, [notify, state]);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00Z`));
}
