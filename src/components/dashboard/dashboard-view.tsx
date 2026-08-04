"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MonthPicker as MonthPickerMenu } from "@/components/ui/month-picker";
import { EmptyState } from "@/components/ui/status-state";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import type {
  DashboardCategoryTotal,
  DashboardReport,
  DashboardTransactionType,
} from "@/lib/dashboard/data";

export function DashboardView({
  report,
  profileName,
  monthlyBudget,
}: {
  report: DashboardReport;
  profileName: string;
  monthlyBudget: number | null;
}) {
  const [chartType, setChartType] = useState<DashboardTransactionType>("expense");
  const categories = useMemo(
    () => report.categoryBreakdown.filter((item) => item.type === chartType),
    [chartType, report.categoryBreakdown],
  );
  const categoryTotal = categories.reduce((sum, item) => sum + item.amount, 0);
  const spendingRatio = monthlyBudget && monthlyBudget > 0 ? report.summary.expense / monthlyBudget : null;
  const greeting = greetingForNow();

  return (
    <>
      <PageHeader
        action={<MonthPicker month={report.month} />}
        description={`Một cái nhìn gọn gàng về dòng tiền của household trong ${formatMonth(report.month)}.`}
        eyebrow={`${greeting}, ${profileName}`}
        title="Tổng quan"
      />

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="relative overflow-hidden border-0 bg-forest text-paper">
          <div aria-hidden="true" className="absolute -right-16 -top-20 size-56 rounded-full bg-yellow/90" />
          <div aria-hidden="true" className="absolute -bottom-28 right-24 size-56 rounded-full border-[38px] border-indigo/22" />
          <CardContent className="relative flex min-h-72 flex-col justify-between p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-paper/54">Số dư tháng này</p>
                <p className={`mt-3 max-w-[18rem] text-[clamp(2.15rem,9.5vw,4.5rem)] font-extrabold leading-none tracking-[-0.065em] ${report.summary.balance >= 0 ? "text-paper" : "text-rose"}`}>
                  {formatSignedMoney(report.summary.balance)}
                </p>
              </div>
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-ink/18 text-ink">
                <WalletCards aria-hidden="true" className="size-5" />
              </div>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-3">
              <MetricChip icon={ArrowUpRight} label="Thu nhập" value={formatMoney(report.summary.income)} tone="income" />
              <MetricChip icon={ArrowDownRight} label="Chi tiêu" value={formatMoney(report.summary.expense)} tone="expense" />
            </div>
          </CardContent>
        </Card>

        <BudgetPaceCard monthlyBudget={monthlyBudget} ratio={spendingRatio} expense={report.summary.expense} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <CategoryChartCard categories={categories} chartType={chartType} total={categoryTotal} onTypeChange={setChartType} />
        <MemberCard memberTotals={report.memberTotals} />
      </section>

      <section className="mt-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/42">Gần đây</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Giao dịch mới</h2>
            </div>
            <Link className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-extrabold text-forest transition hover:bg-forest/7" href={`/transactions?month=${report.month}`}>
              Xem tất cả <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {report.recentTransactions.length === 0 ? (
              <EmptyState description="Tháng này chưa có giao dịch để hiển thị." title="Chưa có dữ liệu" />
            ) : (
              <div className="space-y-2">
                {report.recentTransactions.map((transaction) => <RecentRow key={transaction.id} transaction={transaction} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function MetricChip({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: "income" | "expense" }) {
  return (
    <div className="rounded-2xl bg-paper/10 p-4 backdrop-blur-sm">
      <p className="flex items-center gap-1.5 text-xs font-bold text-paper/58"><Icon aria-hidden="true" className={`size-4 ${tone === "income" ? "text-mint" : "text-rose"}`} /> {label}</p>
      <p className={`mt-2 truncate text-xl font-extrabold ${tone === "income" ? "text-mint" : "text-rose"}`}>{value}</p>
    </div>
  );
}

function BudgetPaceCard({ monthlyBudget, ratio, expense }: { monthlyBudget: number | null; ratio: number | null; expense: number }) {
  if (!monthlyBudget || monthlyBudget <= 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo">Nhịp chi tiêu</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Đặt ngân sách tháng</h2>
        </CardHeader>
        <CardContent className="flex min-h-44 flex-col justify-between">
          <div className="grid size-28 place-items-center rounded-full border-[14px] border-mist text-center">
            <BarChart3 aria-hidden="true" className="size-7 text-forest/48" />
          </div>
          <p className="mt-4 text-sm font-medium leading-6 text-ink/52">Thiết lập ngân sách để biết tốc độ chi tiêu của household.</p>
          <Link className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-mist px-4 text-sm font-extrabold text-forest" href="/budgets">Mở ngân sách</Link>
        </CardContent>
      </Card>
    );
  }

  const percent = Math.round((ratio ?? 0) * 100);
  const ringPercent = Math.min(100, Math.max(0, percent));
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo">Nhịp chi tiêu</p>
        <h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Đã dùng {percent}%</h2>
      </CardHeader>
      <CardContent>
        <div className="mx-auto grid size-40 place-items-center rounded-full p-4" style={{ background: `conic-gradient(var(--${percent > 100 ? "expense" : "forest"}) 0 ${ringPercent}%, var(--mist) ${ringPercent}% 100%)` }}>
          <div className="grid size-full place-items-center rounded-full bg-paper-raised text-center">
            <div><p className="text-2xl font-extrabold tracking-[-0.05em]">{formatMoney(expense)}</p><p className="text-xs font-semibold text-ink/44">trên {formatMoney(monthlyBudget)}</p></div>
          </div>
        </div>
        <p className={`mt-5 text-center text-sm font-medium leading-6 ${percent > 100 ? "text-expense" : "text-ink/52"}`}>
          {percent > 100 ? `Đã vượt ${formatMoney(expense - monthlyBudget)} so với ngân sách.` : "Nhịp chi hiện tại vẫn nằm trong giới hạn tháng."}
        </p>
      </CardContent>
    </Card>
  );
}

function CategoryChartCard({ categories, chartType, total, onTypeChange }: { categories: DashboardCategoryTotal[]; chartType: DashboardTransactionType; total: number; onTypeChange: (type: DashboardTransactionType) => void }) {
  const stops = categoryStops(categories);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/42">Báo cáo danh mục</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Cơ cấu {chartType === "expense" ? "chi tiêu" : "thu nhập"}</h2></div>
          <div className="flex rounded-xl bg-mist/70 p-1" role="tablist">
            <ChartToggle active={chartType === "expense"} label="Chi" onClick={() => onTypeChange("expense")} />
            <ChartToggle active={chartType === "income"} label="Thu" onClick={() => onTypeChange("income")} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <EmptyState description={`Chưa có ${chartType === "expense" ? "chi tiêu" : "thu nhập"} trong tháng này.`} title="Chưa có dữ liệu" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr] sm:items-center">
            <div className="mx-auto grid size-40 place-items-center rounded-full p-4" style={{ background: `conic-gradient(${stops})` }}>
              <div className="grid size-full place-items-center rounded-full bg-paper-raised text-center"><p className="text-xl font-extrabold">{formatMoney(total)}</p><p className="text-xs font-semibold text-ink/44">{chartType === "expense" ? "đã chi" : "đã thu"}</p></div>
            </div>
            <div className="space-y-3">
              {categories.map((item) => <CategoryLegendItem item={item} key={`${item.type}-${item.categoryId ?? item.name}`} />)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`min-h-8 rounded-lg px-2.5 text-xs font-extrabold ${active ? "bg-paper-raised text-forest shadow-sm" : "text-ink/46"}`} onClick={onClick} type="button">{label}</button>;
}

function CategoryLegendItem({ item }: { item: DashboardCategoryTotal }) {
  const Icon = CATEGORY_ICONS[item.icon] ?? CATEGORY_ICON_FALLBACK;
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${item.color}20`, color: item.color }}><Icon aria-hidden="true" className="size-4" /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3 text-sm font-extrabold"><span className="truncate">{item.name}</span><span>{Math.round(item.percent * 100)}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${Math.max(2, item.percent * 100)}%` }} /></div></div>
    </div>
  );
}

function MemberCard({ memberTotals }: { memberTotals: DashboardReport["memberTotals"] }) {
  const expenses = memberTotals.filter((item) => item.type === "expense").sort((a, b) => b.amount - a.amount).slice(0, 3);
  return (
    <Card>
      <CardHeader><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/42">Theo thành viên</p><h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Ai đang chi nhiều nhất?</h2></CardHeader>
      <CardContent>
        {expenses.length === 0 ? <EmptyState description="Khi có giao dịch chi, bảng xếp hạng sẽ xuất hiện ở đây." title="Chưa có dữ liệu" /> : <div className="space-y-4">{expenses.map((item, index) => <div className="flex items-center gap-3" key={`${item.userId ?? item.name}-${item.type}`}><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mist text-sm font-extrabold text-forest">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-extrabold">{item.name}</span><span className="text-sm font-extrabold text-expense">{formatMoney(item.amount)}</span></div><p className="mt-1 text-xs font-semibold text-ink/42">{item.count} giao dịch</p></div></div>)}</div>}
      </CardContent>
    </Card>
  );
}

function RecentRow({ transaction }: { transaction: DashboardReport["recentTransactions"][number] }) {
  const Icon = CATEGORY_ICONS[transaction.categoryIcon] ?? CATEGORY_ICON_FALLBACK;
  return <div className="flex items-center gap-3 rounded-2xl border border-forest/8 bg-white/58 p-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${transaction.categoryColor}20`, color: transaction.categoryColor }}><Icon aria-hidden="true" className="size-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{transaction.title}</p><p className="mt-0.5 truncate text-xs font-medium text-ink/44">{transaction.categoryName} · {transaction.memberName} · {formatVietnameseDate(transaction.transactionDate)}</p></div><span className={`shrink-0 text-sm font-extrabold ${transaction.type === "income" ? "text-income" : "text-expense"}`}>{transaction.type === "income" ? "+" : "-"}{formatMoney(transaction.amount)}</span></div>;
}

function MonthPicker({ month }: { month: string }) {
  return <div className="flex items-center justify-between gap-1 rounded-2xl border border-forest/10 bg-paper-raised/70 p-1.5 sm:justify-start"><Link aria-label="Tháng trước" className="grid size-10 place-items-center rounded-xl text-forest transition hover:bg-mist" href={`/?month=${shiftMonth(month, -1)}`}><ChevronLeft aria-hidden="true" className="size-4" /></Link><MonthPickerMenu align="end" hrefForMonth={(value) => `/?month=${value}`} month={month} /><Link aria-label="Tháng sau" className="grid size-10 place-items-center rounded-xl text-forest transition hover:bg-mist" href={`/?month=${shiftMonth(month, 1)}`}><ChevronRight aria-hidden="true" className="size-4" /></Link></div>;
}

function categoryStops(categories: DashboardCategoryTotal[]) {
  let cursor = 0;
  return categories.map((item) => { const start = cursor * 100; cursor += item.percent; return `${item.color} ${start}% ${cursor * 100}%`; }).join(", ");
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Math.abs(value))} đ`;
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(value)}`;
}

function formatMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number) return month;
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.UTC(year, number - 1, 1, 5)));
}

function formatVietnameseDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00+07:00`) : new Date(value);
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function shiftMonth(month: string, delta: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function greetingForNow() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Chào buổi sáng";
  if (hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}
