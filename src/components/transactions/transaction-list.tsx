"use client";

import { memo, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { deleteTransactionAction } from "@/app/(app)/transactions/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import { initialTransactionActionState } from "@/lib/transactions/action-state";
import type { TransactionView } from "@/lib/transactions/data";
import { formatMoney, formatSignedMoney } from "@/lib/transactions/format";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

// Số NHÓM NGÀY render ngay từ đầu. Mỗi dòng mang một <form>, ConfirmAction/ConfirmDialog, useActionState,
// useRouter và useToast; ở mức "bình thường" 200–300 khoản/tháng mà render hết là ~3.000 hook phải đối
// chiếu lại mỗi lần gõ một ký tự. Đây là trần RENDER: filter và mọi con số vẫn tính trên toàn bộ dòng,
// nên không có số nào trên màn hình đổi, và "Hiện thêm" không tốn một round-trip nào.
export const VISIBLE_DAY_GROUPS = 50;

// Tạo formatter một lần: Intl.DateTimeFormat khá tốn khi dựng lại cho từng dòng.
// hourCycle "h23" chứ không phải hour12: false — có bản ICU phân giải hour12: false thành h24 và
// trả "24:05" cho giao dịch lúc nửa đêm, đúng con số mà cả tính năng này ra đời để hiển thị.
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

// en-CA cho định dạng YYYY-MM-DD, khớp với phần ngày của transactionDate.
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

// Chuỗi đã mang offset thì để nguyên; nối thêm "Z" vào đó cho ra Invalid Date.
const HAS_UTC_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

// transactions.created_at và transaction_date là `timestamp without time zone`, nên PostgREST trả
// về chuỗi KHÔNG có offset ("2020-03-05T07:32:00.123456") dù giá trị bên trong là giờ UTC — cột
// dùng `default now()` và TimeZone của database là UTC. Theo spec, chuỗi date-time không offset
// được parse theo múi giờ MÁY, nên để `new Date()` tự lo sẽ làm giờ lệch đúng bằng offset của máy:
// ở Việt Nam là sớm 7 tiếng, và với giao dịch nhập sau 17:00 UTC thì lệch sang ngày khác khiến giờ
// bị ẩn luôn. Vì vậy phải tự neo vào UTC.
// Dạng chỉ có ngày ("2020-03-05") thì spec đã quy định là UTC rồi, không được thêm gì.
function parseDbTimestamp(value: string): Date | null {
  const hasTimePart = value.includes("T") || value.includes(" ");
  const anchored = hasTimePart && !HAS_UTC_OFFSET.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const parsed = new Date(anchored);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// transaction_date là cột có phần giờ, nhưng giờ đó không bao giờ dùng được: form chỉ nhập ngày và
// actions ghi `${date}T00:00:00`, nên mọi giao dịch đều là nửa đêm. Giờ duy nhất có thật là created_at
// — giờ NHẬP, không phải giờ chi tiêu. Trùng ngày thì hai thứ đó là một nên hiện được; khác ngày (nhập
// muộn cho ngày cũ) thì "22:10" dưới header "01/11" bị đọc thành "chi lúc 22:10 ngày 1/11", nên thà
// không hiện giờ còn hơn hiện giờ của một ngày khác.
// created_at cho phép null (dữ liệu cũ), nên không có giờ thì không hiện gì thay vì đoán.
export function formatTransactionTime(createdAt: string | null, transactionDate: string): string | null {
  if (!createdAt) return null;
  const parsed = parseDbTimestamp(createdAt);
  if (!parsed) return null;
  // So với đúng phần ngày đang làm khoá nhóm (header của dòng), để không có cách đọc transactionDate thứ hai.
  if (dayFormatter.format(parsed) !== transactionDate.slice(0, 10)) return null;
  return timeFormatter.format(parsed);
}

// `today` truyền vào thay vì đọc đồng hồ để test không phụ thuộc ngày chạy.
export function formatTransactionDayLabel(date: string, today: string): string {
  if (date === today) return "Hôm nay";
  // Tính bằng UTC thuần trên chuỗi YYYY-MM-DD để không bị lệch múi giờ máy chạy.
  const [year, month, day] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
  if (date === yesterday) return "Hôm qua";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function currentDateInVietnam(): string {
  return dayFormatter.format(new Date());
}

export function TransactionList({
  rows,
  highlightId,
  showMemberName,
  onEdit,
  onDeleted,
}: {
  rows: TransactionView[];
  highlightId: string | null;
  showMemberName: boolean;
  onEdit: (transaction: TransactionView) => void;
  onDeleted: (id: string) => void;
}) {
  // Chốt "hôm nay" một lần lúc mount để nhãn không đổi giữa chừng khi re-render.
  const [today] = useState(currentDateInVietnam);
  const groups = useMemo(() => groupTransactions(rows, today), [rows, today]);
  const [visibleGroups, setVisibleGroups] = useState(VISIBLE_DAY_GROUPS);
  const shownGroups = groups.slice(0, visibleGroups);
  const hiddenGroups = groups.length - shownGroups.length;

  return (
    <>
      {shownGroups.map((group) => (
        <Card key={group.date}>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <h2 className="text-sm font-extrabold text-ink/68">{group.label}</h2>
            <span className={`text-sm font-extrabold ${group.total >= 0 ? "text-income" : "text-expense"}`}>{formatSignedMoney(group.total)}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.items.map((transaction) => (
              <TransactionRow
                highlighted={transaction.id === highlightId}
                key={transaction.id}
                onDeleted={onDeleted}
                onEdit={onEdit}
                showMemberName={showMemberName}
                transaction={transaction}
              />
            ))}
          </CardContent>
        </Card>
      ))}
      {hiddenGroups > 0 ? (
        <Button className="w-full" onClick={() => setVisibleGroups((count) => count + VISIBLE_DAY_GROUPS)} variant="secondary">
          Hiện thêm ({hiddenGroups} ngày)
        </Button>
      ) : null}
    </>
  );
}

// memo: mọi prop ở đây đều ổn định (object dòng giữ nguyên tham chiếu, hai callback đến từ useCallback/
// setState của orchestrator), nên gõ một ký tự chỉ phải dựng lại các dòng thật sự đổi. onEdit nhận cả
// giao dịch thay vì closure `() => onEdit(transaction)`: closure mới mỗi lần render sẽ vô hiệu hoá memo.
const TransactionRow = memo(function TransactionRow({
  transaction,
  onEdit,
  onDeleted,
  showMemberName,
  highlighted = false,
}: {
  transaction: TransactionView;
  onEdit: (transaction: TransactionView) => void;
  onDeleted: (id: string) => void;
  showMemberName: boolean;
  highlighted?: boolean;
}) {
  const Icon = CATEGORY_ICONS[transaction.categoryIcon] ?? CATEGORY_ICON_FALLBACK;
  const rowRef = useRef<HTMLDivElement>(null);
  const [showHighlight, setShowHighlight] = useState(highlighted);
  const time = formatTransactionTime(transaction.createdAt, transaction.transactionDate);
  const handleEdit = useCallback(() => onEdit(transaction), [onEdit, transaction]);
  // Ngày đã nằm ở header nhóm nên dòng phụ chỉ còn giờ và ghi chú.
  const secondary = [time, transaction.note].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setShowHighlight(false), 3000);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-3 transition-colors duration-700 hover:border-forest/18 hover:bg-white ${showHighlight ? "border-yellow bg-yellow/25" : "border-forest/8 bg-white/58"}`}
      ref={rowRef}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: `${transaction.categoryColor}20`, color: transaction.categoryColor }}>
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <button className="min-w-0 flex-1 text-left" onClick={handleEdit} type="button">
        <span className="block truncate text-sm font-extrabold text-ink">{transaction.categoryName}</span>
        {secondary ? <span className="mt-0.5 block truncate text-xs font-medium text-ink/44">{secondary}</span> : null}
        {showMemberName ? <span className="mt-0.5 block truncate text-xs font-bold text-forest">{transaction.memberName}</span> : null}
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-sm font-extrabold ${transaction.type === "income" ? "text-income" : "text-expense"}`}>
          {transaction.type === "income" ? "+" : "-"}{formatMoney(transaction.amount)}
        </span>
        <div className="flex items-center gap-0.5">
          <Button aria-label={`Sửa giao dịch ${transaction.categoryName}`} onClick={handleEdit} size="icon" variant="ghost">
            <Pencil aria-hidden="true" className="size-4" />
          </Button>
          <DeleteTransactionButton onDeleted={onDeleted} transaction={transaction} />
        </div>
      </div>
    </div>
  );
});

function DeleteTransactionButton({ transaction, onDeleted }: { transaction: TransactionView; onDeleted: (id: string) => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(deleteTransactionAction, initialTransactionActionState);

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message ?? "Đã xóa giao dịch.");
      onDeleted(transaction.id);
      router.refresh();
    } else if (state.status === "error") {
      notify(state.message ?? "Không thể xóa giao dịch.", "error");
    }
  }, [notify, onDeleted, router, state.message, state.status, transaction.id]);

  return (
    <ConfirmAction
      action={formAction}
      confirmLabel="Xóa giao dịch"
      description={`Khoản ${formatMoney(transaction.amount)} thuộc danh mục ${transaction.categoryName} sẽ bị xóa khỏi household hiện tại. Thao tác này không thể hoàn tác.`}
      pending={pending}
      title="Xóa giao dịch này?"
      trigger={(openDialog) => (
        <Button aria-label={`Xóa giao dịch ${transaction.categoryName}`} disabled={pending || !transaction.canDelete} onClick={openDialog} size="icon" type="button" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4 text-expense" />
        </Button>
      )}
    >
      <input name="transactionId" type="hidden" value={transaction.id} readOnly />
    </ConfirmAction>
  );
}

function groupTransactions(transactions: TransactionView[], today: string) {
  const groups = new Map<string, { date: string; label: string; total: number; items: TransactionView[] }>();
  for (const transaction of transactions) {
    const date = transaction.transactionDate.slice(0, 10);
    const group = groups.get(date) ?? { date, label: formatTransactionDayLabel(date, today), total: 0, items: [] };
    group.total += transaction.type === "income" ? transaction.amount : -transaction.amount;
    group.items.push(transaction);
    groups.set(date, group);
  }
  return [...groups.values()];
}
