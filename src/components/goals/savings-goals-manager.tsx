"use client";

import { useActionState, useEffect, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  Car,
  CirclePause,
  CirclePlay,
  GraduationCap,
  House,
  PackageOpen,
  Pencil,
  PiggyBank,
  Plane,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import {
  createSavingsGoalAction,
  deleteEmptySavingsGoalAction,
  initialSavingsActionState,
  recordSavingsGoalEntryAction,
  setSavingsGoalStatusAction,
  updateSavingsGoalAction,
} from "@/app/(app)/goals/actions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/status-state";
import { useToast } from "@/components/ui/toast";
import type {
  SavingsEntryType,
  SavingsGoalView,
  SavingsPageData,
} from "@/lib/goals/data";
import type { MemberOption } from "@/lib/transactions/data";

const iconMap: Record<string, LucideIcon> = {
  saving: PiggyBank,
  shield: ShieldCheck,
  home: House,
  travel: Plane,
  education: GraduationCap,
  car: Car,
  other: PackageOpen,
};

const currencyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function SavingsGoalsManager({
  currentUserId,
  data,
}: {
  currentUserId: string;
  data: SavingsPageData;
}) {
  const [goalEditor, setGoalEditor] = useState<SavingsGoalView | "new" | null>(null);
  const [entryEditor, setEntryEditor] = useState<{ goal: SavingsGoalView; type: SavingsEntryType; requestId: string } | null>(null);
  const activeGoals = data.goals.filter((goal) => goal.status === "active" || goal.status === "paused");
  const completedGoals = data.goals.filter((goal) => goal.status === "completed");
  const archivedGoals = data.goals.filter((goal) => goal.status === "archived");

  return (
    <>
      <PageHeader
        action={<Button className="w-full sm:w-auto" onClick={() => setGoalEditor("new")}><Plus aria-hidden="true" className="size-4" /> Tạo mục tiêu</Button>}
        description="Tách tiền đã dành riêng khỏi chi tiêu để biết household đang tiến gần các kế hoạch lớn đến đâu."
        eyebrow="Tích lũy có chủ đích"
        title="Mục tiêu & quỹ"
      />

      <SavingsSummary data={data} />

      <section className="mt-7">
        <SectionHeading count={activeGoals.length} eyebrow="Đang vun đắp" title="Mục tiêu hiện tại" />
        {activeGoals.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activeGoals.map((goal) => (
              <GoalCard
                goal={goal}
                key={goal.id}
                onDeposit={() => setEntryEditor({ goal, type: "deposit", requestId: crypto.randomUUID() })}
                onEdit={() => setGoalEditor(goal)}
                onWithdraw={() => setEntryEditor({ goal, type: "withdrawal", requestId: crypto.randomUUID() })}
                today={data.today}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            action={<Button onClick={() => setGoalEditor("new")}><Plus aria-hidden="true" className="size-4" /> Tạo mục tiêu đầu tiên</Button>}
            description="Bắt đầu bằng quỹ khẩn cấp hoặc một kế hoạch nhỏ mà cả nhà cùng mong muốn."
            title="Chưa có mục tiêu tiết kiệm"
          />
        )}
      </section>

      {completedGoals.length ? (
        <section className="mt-8">
          <SectionHeading count={completedGoals.length} eyebrow="Cột mốc đã chạm" title="Đã hoàn thành" />
          <div className="grid gap-4 xl:grid-cols-2">
            {completedGoals.map((goal) => (
              <GoalCard
                goal={goal}
                key={goal.id}
                onDeposit={() => setEntryEditor({ goal, type: "deposit", requestId: crypto.randomUUID() })}
                onEdit={() => setGoalEditor(goal)}
                onWithdraw={() => setEntryEditor({ goal, type: "withdrawal", requestId: crypto.randomUUID() })}
                today={data.today}
              />
            ))}
          </div>
        </section>
      ) : null}

      {archivedGoals.length ? (
        <section className="mt-8">
          <SectionHeading count={archivedGoals.length} eyebrow="Lịch sử kế hoạch" title="Đã lưu trữ" />
          <div className="grid gap-3 xl:grid-cols-2">
            {archivedGoals.map((goal) => <ArchivedGoalCard goal={goal} key={goal.id} />)}
          </div>
        </section>
      ) : null}

      {goalEditor ? (
        <SavingsGoalForm
          goal={goalEditor === "new" ? undefined : goalEditor}
          onClose={() => setGoalEditor(null)}
        />
      ) : null}
      {entryEditor ? (
        <SavingsEntryForm
          currentUserId={currentUserId}
          goal={entryEditor.goal}
          initialType={entryEditor.type}
          members={data.members}
          onClose={() => setEntryEditor(null)}
          requestId={entryEditor.requestId}
          today={data.today}
        />
      ) : null}
    </>
  );
}

function SavingsSummary({ data }: { data: SavingsPageData }) {
  const progress = data.summary.targetAmount > 0
    ? Math.min(1, data.summary.currentAmount / data.summary.targetAmount)
    : 0;
  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <Card className="motion-rise relative overflow-hidden border-0 bg-forest text-paper">
        <div aria-hidden="true" className="absolute -right-20 -top-24 size-64 rounded-full border-[42px] border-yellow/80" />
        <div aria-hidden="true" className="absolute -bottom-20 right-20 size-48 rounded-full bg-indigo/22" />
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-mint">Tổng đã dành riêng</p>
              <p className="mt-3 text-[clamp(2rem,9vw,4rem)] font-extrabold leading-none tracking-[-0.06em]">{currencyFormatter.format(data.summary.currentAmount)}</p>
              <p className="mt-3 text-sm font-medium text-paper/58">trên {currencyFormatter.format(data.summary.targetAmount)} của các mục tiêu hiện tại</p>
            </div>
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-paper/10 text-yellow"><WalletCards aria-hidden="true" className="size-6" /></div>
          </div>
          <div className="mt-8 h-3 overflow-hidden rounded-full bg-paper/12">
            <div className="h-full rounded-full bg-yellow transition-[width]" style={{ width: `${Math.max(progress > 0 ? 3 : 0, progress * 100)}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-extrabold text-paper/58">
            <span>{Math.round(progress * 100)}% tổng kế hoạch</span>
            <span>{data.summary.completedCount} đã hoàn thành</span>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Card className="motion-rise motion-delay-1">
          <CardContent className="flex items-center gap-4 pt-5 sm:pt-6">
            <div className="grid size-12 place-items-center rounded-2xl bg-mint-soft text-income"><ShieldCheck aria-hidden="true" className="size-6" /></div>
            <div><p className="text-xs font-bold text-ink/48">Quỹ khẩn cấp</p><p className="mt-1 text-xl font-extrabold text-forest">{currencyFormatter.format(data.summary.emergencyAmount)}</p></div>
          </CardContent>
        </Card>
        <Card className="motion-rise motion-delay-2">
          <CardContent className="flex items-center gap-4 pt-5 sm:pt-6">
            <div className="grid size-12 place-items-center rounded-2xl bg-yellow text-ink"><Target aria-hidden="true" className="size-6" /></div>
            <div><p className="text-xs font-bold text-ink/48">Đang theo đuổi</p><p className="mt-1 text-2xl font-extrabold text-ink">{data.summary.activeCount}</p></div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function GoalCard({
  goal,
  onDeposit,
  onEdit,
  onWithdraw,
  today,
}: {
  goal: SavingsGoalView;
  onDeposit: () => void;
  onEdit: () => void;
  onWithdraw: () => void;
  today: string;
}) {
  const Icon = iconMap[goal.icon] ?? PackageOpen;
  const percent = Math.round(goal.progress * 100);
  const monthly = suggestedMonthlyContribution(goal, today);
  return (
    <Card className={goal.status === "paused" ? "overflow-hidden opacity-76" : "overflow-hidden"}>
      <div className="h-2" style={{ backgroundColor: goal.color }} />
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${goal.color}20`, color: goal.color }}><Icon aria-hidden="true" className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-extrabold tracking-[-0.03em]">{goal.name}</h2>
              {goal.kind === "emergency" ? <span className="rounded-full bg-mint-soft px-2 py-1 text-[10px] font-extrabold uppercase text-income">Khẩn cấp</span> : null}
              {goal.status === "paused" ? <span className="rounded-full bg-mist px-2 py-1 text-[10px] font-extrabold uppercase text-forest">Tạm dừng</span> : null}
              {goal.status === "completed" ? <span className="inline-flex items-center gap-1 rounded-full bg-yellow px-2 py-1 text-[10px] font-extrabold uppercase text-ink"><Trophy aria-hidden="true" className="size-3" />Hoàn thành</span> : null}
            </div>
            <p className="mt-1 text-sm font-bold text-ink/48">{goal.entryCount} biến động quỹ</p>
          </div>
          <Button aria-label={`Sửa ${goal.name}`} onClick={onEdit} size="icon" variant="ghost"><Pencil aria-hidden="true" className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-2xl font-extrabold tracking-[-0.045em] text-forest">{currencyFormatter.format(goal.currentAmount)}</p><p className="mt-1 text-xs font-bold text-ink/44">Mục tiêu {currencyFormatter.format(goal.targetAmount)}</p></div>
          <p className="text-2xl font-extrabold" style={{ color: goal.color }}>{percent}%</p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full transition-[width]" style={{ backgroundColor: goal.color, width: `${Math.max(goal.progress > 0 ? 3 : 0, Math.min(100, goal.progress * 100))}%` }} /></div>

        <div className="mt-4 grid gap-2 rounded-2xl bg-mist/55 p-3 text-xs font-bold text-ink/56 sm:grid-cols-2">
          <span className="flex items-center gap-2"><Target aria-hidden="true" className="size-4 text-indigo" />Còn {currencyFormatter.format(goal.remainingAmount)}</span>
          {goal.targetDate ? <span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4 text-forest" />{deadlineLabel(goal.targetDate, today)}</span> : <span className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="size-4 text-forest" />Không đặt thời hạn</span>}
          {monthly !== null && goal.remainingAmount > 0 ? <span className="flex items-center gap-2 sm:col-span-2"><Sparkles aria-hidden="true" className="size-4 text-indigo" />Gợi ý khoảng {currencyFormatter.format(monthly)}/tháng để kịp hạn</span> : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onDeposit} size="sm"><ArrowDownToLine aria-hidden="true" className="size-4" /> Thêm vào quỹ</Button>
          <Button disabled={goal.currentAmount <= 0} onClick={onWithdraw} size="sm" variant="secondary"><ArrowUpFromLine aria-hidden="true" className="size-4" /> Rút khỏi quỹ</Button>
        </div>

        {goal.recentEntries.length ? (
          <div className="mt-5 border-t border-forest/8 pt-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-forest/40">Biến động gần đây</p>
            <div className="mt-2 space-y-2">
              {goal.recentEntries.map((entry) => (
                <div className="flex items-center gap-3 rounded-xl bg-paper/64 px-3 py-2" key={entry.id}>
                  <span className={entry.entryType === "deposit" ? "grid size-8 shrink-0 place-items-center rounded-xl bg-mint-soft text-income" : "grid size-8 shrink-0 place-items-center rounded-xl bg-rose/22 text-expense"}>{entry.entryType === "deposit" ? <ArrowDownToLine aria-hidden="true" className="size-4" /> : <ArrowUpFromLine aria-hidden="true" className="size-4" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{entry.note || (entry.entryType === "deposit" ? "Thêm vào quỹ" : "Rút khỏi quỹ")}</p><p className="mt-0.5 truncate text-[10px] font-bold text-ink/40">{entry.memberName} · {formatDate(entry.entryDate)}</p></div>
                  <span className={entry.entryType === "deposit" ? "text-xs font-extrabold text-income" : "text-xs font-extrabold text-expense"}>{entry.entryType === "deposit" ? "+" : "-"}{currencyFormatter.format(entry.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <StatusButton goal={goal} />
          <ArchiveButton goal={goal} />
          {goal.entryCount === 0 ? <DeleteEmptyGoalButton goal={goal} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ArchivedGoalCard({ goal }: { goal: SavingsGoalView }) {
  const Icon = iconMap[goal.icon] ?? PackageOpen;
  return (
    <Card className="opacity-72">
      <CardContent className="flex items-center gap-3 pt-5 sm:pt-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mist text-forest"><Icon aria-hidden="true" className="size-5" /></div>
        <div className="min-w-0 flex-1"><h3 className="truncate font-extrabold">{goal.name}</h3><p className="mt-1 text-xs font-bold text-ink/44">{currencyFormatter.format(goal.currentAmount)} · {goal.entryCount} biến động</p></div>
        <RestoreButton goal={goal} />
        {goal.entryCount === 0 ? <DeleteEmptyGoalButton goal={goal} /> : null}
      </CardContent>
    </Card>
  );
}

function StatusButton({ goal }: { goal: SavingsGoalView }) {
  const status = goal.status === "paused" ? "active" : "paused";
  const [state, action, pending] = useActionState(setSavingsGoalStatusAction, initialSavingsActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  const Icon = status === "paused" ? CirclePause : CirclePlay;
  return (
    <form action={action}>
      <input name="goalId" type="hidden" value={goal.id} /><input name="status" type="hidden" value={status} />
      <Button aria-label={status === "paused" ? `Tạm dừng ${goal.name}` : `Tiếp tục ${goal.name}`} disabled={pending} size="sm" type="submit" variant="ghost"><Icon aria-hidden="true" className="size-4" /><span className="hidden sm:inline">{status === "paused" ? "Dừng" : "Tiếp tục"}</span></Button>
    </form>
  );
}

function ArchiveButton({ goal }: { goal: SavingsGoalView }) {
  const [state, action, pending] = useActionState(setSavingsGoalStatusAction, initialSavingsActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  return (
    <form action={action} onSubmit={(event) => { if (!window.confirm(`Lưu trữ mục tiêu “${goal.name}”? Lịch sử quỹ vẫn được giữ.`)) event.preventDefault(); }}>
      <input name="goalId" type="hidden" value={goal.id} /><input name="status" type="hidden" value="archived" />
      <Button aria-label={`Lưu trữ ${goal.name}`} disabled={pending} size="sm" type="submit" variant="ghost"><Archive aria-hidden="true" className="size-4" /><span className="hidden sm:inline">Lưu trữ</span></Button>
    </form>
  );
}

function RestoreButton({ goal }: { goal: SavingsGoalView }) {
  const [state, action, pending] = useActionState(setSavingsGoalStatusAction, initialSavingsActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  return <form action={action}><input name="goalId" type="hidden" value={goal.id} /><input name="status" type="hidden" value="active" /><Button aria-label={`Khôi phục ${goal.name}`} disabled={pending} size="icon" type="submit" variant="secondary"><RotateCcw aria-hidden="true" className="size-4" /></Button></form>;
}

function DeleteEmptyGoalButton({ goal }: { goal: SavingsGoalView }) {
  const [state, action, pending] = useActionState(deleteEmptySavingsGoalAction, initialSavingsActionState);
  const { notify } = useToast();
  useActionFeedback(state, notify);
  return <form action={action} onSubmit={(event) => { if (!window.confirm(`Xóa vĩnh viễn mục tiêu trống “${goal.name}”?`)) event.preventDefault(); }}><input name="goalId" type="hidden" value={goal.id} /><Button aria-label={`Xóa ${goal.name}`} disabled={pending} size="icon" type="submit" variant="ghost"><Trash2 aria-hidden="true" className="size-4 text-expense" /></Button></form>;
}

function SavingsGoalForm({ goal, onClose }: { goal?: SavingsGoalView; onClose: () => void }) {
  const [state, action, pending] = useActionState(goal ? updateSavingsGoalAction : createSavingsGoalAction, initialSavingsActionState);
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount ?? 0);
  const { notify } = useToast();
  useCloseOnSuccess(state, notify, onClose);
  return (
    <Sheet description="Mục tiêu chỉ là khoản tiền được dành riêng, không được tính thành chi tiêu trên dashboard." onClose={onClose} open title={goal ? "Sửa mục tiêu" : "Tạo mục tiêu mới"}>
      <form action={action} className="space-y-4">
        {goal ? <input name="goalId" type="hidden" value={goal.id} /> : null}
        <Input defaultValue={goal?.name ?? ""} error={state.fieldErrors?.name} label="Tên mục tiêu" maxLength={80} name="name" placeholder="Ví dụ: Quỹ khẩn cấp 6 tháng" required />
        <Select defaultValue={goal?.kind ?? "general"} error={state.fieldErrors?.kind} label="Loại mục tiêu" name="kind"><option value="general">Kế hoạch chung</option><option value="emergency">Quỹ khẩn cấp</option></Select>
        <CurrencyInput error={state.fieldErrors?.targetAmount} hint="Tổng số tiền household muốn dành riêng." label="Số tiền mục tiêu" name="targetAmount" onValueChange={setTargetAmount} value={targetAmount} />
        <Input defaultValue={goal?.targetDate ?? ""} error={state.fieldErrors?.targetDate} hint="Để trống nếu chưa muốn tạo áp lực thời hạn." label="Ngày mong muốn hoàn thành" name="targetDate" type="date" />
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Select defaultValue={goal?.icon ?? "saving"} error={state.fieldErrors?.icon} label="Biểu tượng" name="icon"><option value="saving">Tiết kiệm</option><option value="shield">Bảo vệ</option><option value="home">Nhà ở</option><option value="travel">Du lịch</option><option value="education">Giáo dục</option><option value="car">Xe cộ</option><option value="other">Khác</option></Select>
          <label className="block text-sm font-bold text-ink/76"><span className="mb-2 block">Màu</span><input aria-label="Màu mục tiêu" className="h-12 w-full cursor-pointer rounded-2xl border border-forest/12 bg-paper-raised p-1.5" defaultValue={goal?.color ?? "#1F3D2B"} name="color" type="color" /></label>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2"><Button onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending || targetAmount <= 0} type="submit">{pending ? "Đang lưu..." : "Lưu mục tiêu"}</Button></div>
      </form>
    </Sheet>
  );
}

function SavingsEntryForm({ currentUserId, goal, initialType, members, onClose, requestId, today }: { currentUserId: string; goal: SavingsGoalView; initialType: SavingsEntryType; members: MemberOption[]; onClose: () => void; requestId: string; today: string }) {
  const [state, action, pending] = useActionState(recordSavingsGoalEntryAction, initialSavingsActionState);
  const [amount, setAmount] = useState(0);
  const [entryType, setEntryType] = useState<SavingsEntryType>(initialType);
  const { notify } = useToast();
  useCloseOnSuccess(state, notify, onClose);
  return (
    <Sheet description={entryType === "deposit" ? "Khoản này tăng số tiền đã dành riêng và không làm thay đổi báo cáo thu/chi." : `Hiện mục tiêu có ${currencyFormatter.format(goal.currentAmount)}; hệ thống không cho rút vượt số dư.`} onClose={onClose} open title={entryType === "deposit" ? `Thêm vào “${goal.name}”` : `Rút khỏi “${goal.name}”`}>
      <form action={action} className="space-y-4">
        <input name="goalId" type="hidden" value={goal.id} />
        <input name="requestId" type="hidden" value={requestId} />
        <div className="grid grid-cols-2 rounded-2xl bg-mist p-1.5">
          <button className={entryType === "deposit" ? "min-h-11 rounded-xl bg-forest px-3 text-sm font-extrabold text-paper shadow-sm" : "min-h-11 rounded-xl px-3 text-sm font-extrabold text-forest/54"} onClick={() => setEntryType("deposit")} type="button"><ArrowDownToLine aria-hidden="true" className="mr-1 inline size-4" />Thêm vào</button>
          <button className={entryType === "withdrawal" ? "min-h-11 rounded-xl bg-paper-raised px-3 text-sm font-extrabold text-expense shadow-sm" : "min-h-11 rounded-xl px-3 text-sm font-extrabold text-forest/54"} onClick={() => setEntryType("withdrawal")} type="button"><ArrowUpFromLine aria-hidden="true" className="mr-1 inline size-4" />Rút ra</button>
        </div>
        <input name="entryType" type="hidden" value={entryType} />
        <CurrencyInput error={state.fieldErrors?.amount} hint={entryType === "withdrawal" ? `Tối đa ${currencyFormatter.format(goal.currentAmount)}.` : undefined} label="Số tiền" name="amount" onValueChange={setAmount} value={amount} />
        <Select defaultValue={currentUserId} error={state.fieldErrors?.userId} label={entryType === "deposit" ? "Người đóng góp" : "Người rút"} name="userId">{members.map((member) => <option key={member.id} value={member.id}>{member.id === currentUserId ? "Bạn" : member.name}</option>)}</Select>
        <Input defaultValue={today} error={state.fieldErrors?.entryDate} label="Ngày ghi quỹ" max={today} name="entryDate" required type="date" />
        <label className="block text-sm font-bold text-ink/76"><span className="mb-2 block">Ghi chú</span><textarea className="min-h-24 w-full resize-y rounded-2xl border border-forest/12 bg-paper-raised/86 px-4 py-3 text-base font-semibold text-ink outline-none transition placeholder:text-ink/34 focus:border-indigo/55 focus:ring-4 focus:ring-indigo/10" maxLength={240} name="note" placeholder={entryType === "deposit" ? "Ví dụ: Trích từ lương tháng 8" : "Ví dụ: Chi phí khám bệnh"} />{state.fieldErrors?.note ? <span className="mt-2 block text-xs font-semibold text-expense">{state.fieldErrors.note}</span> : null}</label>
        <div className="grid grid-cols-2 gap-3 pt-2"><Button onClick={onClose} type="button" variant="secondary">Hủy</Button><Button disabled={pending || amount <= 0 || (entryType === "withdrawal" && amount > goal.currentAmount)} type="submit" variant={entryType === "withdrawal" ? "danger" : "primary"}>{pending ? "Đang ghi..." : entryType === "deposit" ? "Thêm vào quỹ" : "Xác nhận rút"}</Button></div>
      </form>
    </Sheet>
  );
}

function SectionHeading({ count, eyebrow, title }: { count: number; eyebrow: string; title: string }) {
  return <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo">{eyebrow}</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">{title}</h2></div><span className="rounded-full bg-mist px-3 py-1.5 text-xs font-extrabold text-forest">{count}</span></div>;
}

function useCloseOnSuccess(state: typeof initialSavingsActionState, notify: (message: string, variant?: "success" | "error") => void, onClose: () => void) {
  useEffect(() => {
    if (state.status === "success") { notify(state.message ?? "Đã lưu thay đổi."); onClose(); }
    else if (state.status === "error" && state.message) notify(state.message, "error");
  }, [notify, onClose, state]);
}

function useActionFeedback(state: typeof initialSavingsActionState, notify: (message: string, variant?: "success" | "error") => void) {
  useEffect(() => {
    if (state.status === "success" && state.message) notify(state.message);
    if (state.status === "error" && state.message) notify(state.message, "error");
  }, [notify, state]);
}

function suggestedMonthlyContribution(goal: SavingsGoalView, today: string) {
  if (!goal.targetDate || goal.targetDate <= today || goal.remainingAmount <= 0) return null;
  const days = Math.max(1, Math.ceil((Date.parse(`${goal.targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000));
  return Math.ceil(goal.remainingAmount / Math.max(1, days / 30.4375));
}

function deadlineLabel(targetDate: string, today: string) {
  const days = Math.ceil((Date.parse(`${targetDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return "Đến hạn hôm nay";
  return `Còn ${days} ngày · ${formatDate(targetDate)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}
