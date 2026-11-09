"use client";

import { AlertTriangle, ChevronDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import { cn } from "@/lib/cn";
import type { CategoryAnalytics, MemberAnalytics, TransactionAnalytics } from "@/lib/transactions/analytics";
import { formatMoney } from "@/lib/transactions/format";

// Danh mục/thành viên "hết" (tháng trước có chi, tháng này không) có thể lên tới cả chục dòng;
// giới hạn để chúng nhắc người dùng mà không lấn át các dòng có số thật.
const MAX_GONE_ROWS = 3;
const MIN_BAR_PERCENT = 2;

type PanelType = "income" | "expense";

type Props = {
  analytics: TransactionAnalytics;
  panelType: PanelType;
  selectedCategoryIds: string[];
  onPanelTypeChange: (type: PanelType) => void;
  onToggleCategory: (categoryId: string) => void;
};

// Dòng "gone" là dòng không còn gì để đo trong tháng này; chúng được tách riêng khỏi dòng thật.
function isGone(item: { amount: number; deltaKind: string }) {
  return item.amount === 0 && item.deltaKind === "gone";
}

function splitGone<T extends { amount: number; deltaKind: string }>(items: T[]) {
  return {
    real: items.filter((item) => !isGone(item)),
    gone: items.filter(isGone).slice(0, MAX_GONE_ROWS),
  };
}

function ScopeToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={cn("min-h-8 rounded-lg px-2.5 text-xs font-extrabold", active ? "bg-paper-raised text-forest shadow-sm" : "text-ink/46")}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function DeltaBadge({ label }: { label: string | null }) {
  // Nhãn lấy nguyên từ analytics (buildDelta); component này không tự tính phần trăm.
  return label ? <span className="shrink-0 text-xs font-bold text-ink/52">{label}</span> : null;
}

function CategoryRow({ item, pressed, tone, onToggle }: { item: CategoryAnalytics; pressed: boolean; tone: string; onToggle: (id: string) => void }) {
  const Icon = CATEGORY_ICONS[item.icon] ?? CATEGORY_ICON_FALLBACK;
  const gone = isGone(item);
  return (
    <button
      aria-pressed={pressed}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-1.5 text-left transition",
        pressed ? "bg-mist ring-1 ring-forest/25" : "hover:bg-mist/60",
        gone && "opacity-55",
      )}
      onClick={() => onToggle(item.categoryId)}
      type="button"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-3 text-sm font-extrabold">
          <span className="truncate">{item.name}</span>
          <span className={gone ? "text-ink/52" : tone}>{formatMoney(item.amount)}</span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-3 text-xs font-semibold text-ink/52">
          {/* Phần trăm hiển thị đã làm tròn nên cộng lại KHÔNG nhất thiết bằng 100 — đó là bình thường.
              item.percent gốc vẫn chính xác (và thanh tỷ lệ dùng giá trị gốc), nên đừng "sửa" bằng cách
              phân phối lại phần dư ở tầng này: chỉ làm số hiển thị lệch khỏi số thật. */}
          <span>{gone ? "tháng này chưa có" : `${Math.round(item.percent * 100)}% · ${item.count} khoản`}</span>
          <DeltaBadge label={item.deltaLabel} />
        </span>
        {/* Không vẽ thanh cho dòng bằng 0: thanh rộng 0% trông như lỗi hiển thị. */}
        {!gone && item.amount > 0 ? (
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-mist">
            <span
              className="block h-full rounded-full"
              data-testid="category-bar"
              style={{ backgroundColor: item.color, width: `${Math.max(MIN_BAR_PERCENT, item.percent * 100)}%` }}
            />
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MemberRow({ item, tone }: { item: MemberAnalytics; tone: string }) {
  const gone = isGone(item);
  return (
    <li className={cn("flex items-center justify-between gap-3 text-sm", gone && "opacity-55")}>
      <span className="min-w-0">
        <span className="block truncate font-extrabold">{item.name}</span>
        <span className="block text-xs font-semibold text-ink/52">{gone ? "tháng này chưa có" : `${item.count} khoản`}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={cn("font-extrabold", gone ? "text-ink/52" : tone)}>{formatMoney(item.amount)}</span>
        <DeltaBadge label={item.deltaLabel} />
      </span>
    </li>
  );
}

export function TransactionAnalyticsPanel({ analytics, panelType, selectedCategoryIds, onPanelTypeChange, onToggleCategory }: Props) {
  // Khởi tạo thẳng "mở", không cần effect đồng bộ từ prop.
  const [open, setOpen] = useState(true);
  const tone = panelType === "income" ? "text-income" : "text-expense";
  const categories = splitGone(analytics.categories);
  const members = splitGone(analytics.members);
  const hasCategories = categories.real.length + categories.gone.length > 0;
  const scopeText = `ĐANG TÍNH TRÊN ${analytics.scopeCount} KHOẢN`;

  return (
    <section className="rounded-3xl border border-forest/10 bg-paper-raised/82 p-4">
      {/* Phạm vi nằm chung nhóm với công tắc Chi/Thu và vẫn hiện khi gập, để con số không bao giờ tách khỏi ngữ cảnh. */}
      <div aria-label={`Phạm vi phân tích: ${scopeText}, ${analytics.scopeLabel}`} className="flex items-start justify-between gap-3" role="group">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-forest/52">{scopeText}</span>
            <span className="mt-0.5 block truncate text-sm font-extrabold">{analytics.scopeLabel}</span>
          </span>
          <ChevronDown aria-hidden="true" className={cn("mt-1 size-4 shrink-0 text-ink/46 transition", open && "rotate-180")} />
        </button>
        <div className="flex shrink-0 rounded-xl bg-mist/70 p-1">
          <ScopeToggle active={panelType === "expense"} label="Chi" onClick={() => onPanelTypeChange("expense")} />
          <ScopeToggle active={panelType === "income"} label="Thu" onClick={() => onPanelTypeChange("income")} />
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-5">
          {analytics.alerts.length > 0 ? (
            <section aria-label="Cảnh báo" className="space-y-2">
              {analytics.alerts.map((alert) => (
                <p
                  className={cn(
                    "flex items-start gap-2 rounded-2xl px-3 py-2 text-xs font-bold",
                    alert.severity === "warning" ? "bg-expense/10 text-expense" : "bg-mist text-forest",
                  )}
                  key={`${alert.kind}-${alert.categoryId}`}
                >
                  {alert.severity === "warning" ? <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> : <TrendingUp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />}
                  <span>{alert.message}</span>
                </p>
              ))}
            </section>
          ) : null}

          {hasCategories ? (
            <div className="space-y-1">
              {categories.real.map((item) => (
                <CategoryRow item={item} key={item.categoryId} onToggle={onToggleCategory} pressed={selectedCategoryIds.includes(item.categoryId)} tone={tone} />
              ))}
              {categories.gone.length > 0 ? (
                <>
                  <div className="my-2 border-t border-dashed border-forest/15" role="separator" />
                  {categories.gone.map((item) => (
                    <CategoryRow item={item} key={item.categoryId} onToggle={onToggleCategory} pressed={selectedCategoryIds.includes(item.categoryId)} tone={tone} />
                  ))}
                </>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl bg-mist/50 px-4 py-6 text-center">
              <p className="text-sm font-extrabold">Chưa có dữ liệu</p>
              <p className="mt-1 text-xs font-medium text-ink/52">Không có {panelType === "income" ? "khoản thu" : "khoản chi"} nào trong phạm vi đang chọn.</p>
            </div>
          )}

          {members.real.length + members.gone.length > 0 ? (
            <section aria-label="Theo thành viên">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-forest/52">Theo thành viên</p>
              <ul className="space-y-2.5">
                {members.real.map((item) => <MemberRow item={item} key={item.userId} tone={tone} />)}
              </ul>
              {members.gone.length > 0 ? (
                <>
                  <div className="my-2 border-t border-dashed border-forest/15" role="separator" />
                  <ul className="space-y-2.5">
                    {members.gone.map((item) => <MemberRow item={item} key={item.userId} tone={tone} />)}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
