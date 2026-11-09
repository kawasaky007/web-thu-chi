import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/cn";
import { buildDelta, type TransactionAnalytics } from "@/lib/transactions/analytics";
import { MONTH_ROW_CAP } from "@/lib/transactions/data";
import { formatMoney } from "@/lib/transactions/format";

// Câu này là chỗ duy nhất trong UI nói ra con số bị cắt, nên nó phải dựng từ chính hằng của truy vấn:
// viết tay "1.500" thì đổi MONTH_ROW_CAP là banner nói sai mà không một test nào đỏ.
export function capBannerCopy(cap: number) {
  const count = new Intl.NumberFormat("vi-VN").format(cap);
  return `Tháng này có hơn ${count} giao dịch. Số liệu tính trên ${count} khoản gần nhất.`;
}

const CAP_BANNER_COPY = capBannerCopy(MONTH_ROW_CAP);
// Dùng chung buildDelta của analytics để nhãn mới/hết/không đổi và cách làm tròn chỉ có một nơi định nghĩa.
function deltaText(current: number, previous: number) {
  return buildDelta(current, previous).deltaLabel;
}

type MoneyCellProps = {
  label: string;
  tone: string;
  amount: number;
  inScope: boolean;
  filtered: boolean;
  previousAmount: number | null;
};

function MoneyCell({ label, tone, amount, inScope, filtered, previousAmount }: MoneyCellProps) {
  // Ba trạng thái khác nhau nên phải đọc ra khác nhau:
  //  - bộ lọc đã loại hẳn loại này   -> "ngoài bộ lọc" (ta không xem loại này)
  //  - đang lọc và phạm vi không có  -> "0 trong phạm vi" (lọc một thành viên không có thu nhập)
  //  - không lọc gì mà vẫn bằng 0    -> "0 đ" (cả tháng thật sự không có)
  // Gộp hai trường hợp sau thành "0 đ" là đúng lỗi mà spec muốn tránh: "Thu 0" bị đọc thành
  // "tháng này không có thu nhập".
  const value = !inScope ? "ngoài bộ lọc" : filtered && amount === 0 ? "0 trong phạm vi" : formatMoney(amount);
  const delta = inScope && previousAmount !== null ? `${deltaText(amount, previousAmount)} so tháng trước` : null;

  return (
    <div
      aria-label={`${label}: ${value}${delta ? `, ${delta}` : ""}`}
      className="min-w-0 rounded-2xl border border-forest/10 bg-paper-raised/82 px-3 py-2.5"
      role="group"
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink/52">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-extrabold", inScope && amount !== 0 ? tone : "text-ink/46")}>{value}</p>
      {delta ? <p className="mt-0.5 truncate text-[0.68rem] font-semibold text-ink/52">{delta}</p> : null}
    </div>
  );
}

export function TransactionSummaryStrip({
  analytics,
  truncated,
}: {
  analytics: TransactionAnalytics;
  truncated: boolean;
}) {
  // Chỉ so sánh khi dữ liệu tháng trước đầy đủ; số liệu thiếu cho ra delta sai chứ không phải gần đúng.
  const previous = analytics.comparable ? analytics.previous : null;
  const countName = `${analytics.scopeCount} / ${analytics.monthCount} cả tháng`;

  return (
    <section aria-label="Tổng hợp giao dịch" className="space-y-2">
      {truncated ? (
        // Phải ồn ào: lỗi cũ là cộng 30 dòng rồi trình bày như tổng cả tháng mà không báo thiếu.
        <div
          className="flex items-start gap-2 rounded-2xl border border-yellow/60 bg-yellow/28 px-3 py-2.5 text-xs font-bold text-ink"
          role="status"
        >
          <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
          <p>{CAP_BANNER_COPY}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <MoneyCell
          amount={analytics.expense}
          filtered={analytics.filtered}
          inScope={analytics.expenseInScope}
          label="Chi"
          previousAmount={previous ? previous.expense : null}
          tone="text-expense"
        />
        <MoneyCell
          amount={analytics.income}
          filtered={analytics.filtered}
          inScope={analytics.incomeInScope}
          label="Thu"
          previousAmount={previous ? previous.income : null}
          tone="text-income"
        />
        <div
          aria-label={`Số khoản: ${countName}`}
          className="min-w-0 rounded-2xl border border-forest/10 bg-paper-raised/82 px-3 py-2.5"
          role="group"
        >
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-ink/52">Số khoản</p>
          <p className="mt-1 truncate text-sm font-extrabold text-ink">
            <span>{analytics.scopeCount}</span>{" "}
            <span className="text-xs font-semibold text-ink/52">{`/ ${analytics.monthCount} cả tháng`}</span>
          </p>
        </div>
      </div>

      {analytics.comparable ? null : (
        <p className="px-1 text-[0.68rem] font-semibold text-ink/52">không đủ dữ liệu so sánh</p>
      )}
    </section>
  );
}
