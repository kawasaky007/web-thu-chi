"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileJson,
  FileSpreadsheet,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  importTransactionsAction,
  initialBackupActionState,
} from "@/app/(app)/backup/actions";
import { PageHeader } from "@/components/app/page-header";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { BackupOverview } from "@/lib/backup/data";
import {
  createImportPayload,
  MAX_BACKUP_BYTES,
  parseTransactionBackup,
  type ParsedBackupTransaction,
} from "@/lib/backup/format";

type Preview = {
  fileName: string;
  format: "csv" | "json";
  householdName: string | null;
  rows: ParsedBackupTransaction[];
};

export function BackupManager({
  householdName,
  overview,
}: {
  householdName: string;
  overview: BackupOverview;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [state, formAction, pending] = useActionState(importTransactionsAction, initialBackupActionState);
  const previewSummary = useMemo(() => summarize(preview?.rows ?? []), [preview]);

  useEffect(() => {
    if (state.status !== "success") return;
    notify(state.message ?? "Đã nhập backup.");
    router.refresh();
  }, [notify, router, state.message, state.status]);

  const readFile = async (file: File | undefined) => {
    setPreview(null);
    setFileErrors([]);
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      setFileErrors(["File vượt quá giới hạn 1,5 MB."]);
      return;
    }

    setReading(true);
    try {
      const parsed = parseTransactionBackup(await file.text(), file.name);
      if (!parsed.success) {
        setFileErrors(parsed.errors);
        return;
      }
      setPreview({
        fileName: file.name,
        format: parsed.format,
        householdName: parsed.householdName,
        rows: parsed.rows,
      });
    } catch {
      setFileErrors(["Không thể đọc file trên thiết bị này."]);
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <PageHeader
        description="Tải dữ liệu giao dịch về thiết bị hoặc khôi phục từ file do Thu Chi tạo. Không cần dịch vụ trả phí."
        eyebrow="Dữ liệu thuộc về bạn"
        title="Sao lưu và khôi phục"
      />

      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo">Household hiện tại</p>
              <h2 className="mt-1 text-xl font-extrabold">{householdName}</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-2">
              <Metric label="Giao dịch" value={overview.transactionCount} />
              <Metric label="Danh mục" value={overview.categoryCount} />
              <Metric label="Ngân sách" value={overview.budgetCount} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-forest/42">Xuất giao dịch</p>
              <h2 className="mt-1 text-xl font-extrabold">Tạo bản sao trên thiết bị</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <ExportLink
                description="Giữ đầy đủ ID và metadata để khôi phục chính xác."
                format="JSON"
                href="/api/backup/transactions?format=json"
                icon={FileJson}
              />
              <ExportLink
                description="Mở được bằng Excel, Numbers hoặc Google Sheets."
                format="CSV"
                href="/api/backup/transactions?format=csv"
                icon={FileSpreadsheet}
              />
              <div className="flex items-start gap-3 rounded-2xl bg-yellow/28 p-4 text-xs font-semibold leading-5 text-ink/68">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-forest" />
                File có dữ liệu tài chính và email dùng để ánh xạ thành viên. Hãy lưu ở nơi riêng tư; server không giữ thêm bản sao export.
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-income">Khôi phục giao dịch</p>
            <h2 className="mt-1 text-xl font-extrabold">Xem trước rồi mới nhập</h2>
            <p className="mt-2 text-sm font-medium leading-6 text-ink/52">
              Hỗ trợ JSON/CSV do ứng dụng xuất, tối đa 1.000 giao dịch mỗi lần. ID đã tồn tại sẽ được bỏ qua, không ghi đè dữ liệu hiện có.
            </p>
          </CardHeader>
          <CardContent>
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-forest/22 bg-mist/45 px-5 py-6 text-center transition hover:border-forest/40 hover:bg-mist/70">
              <Upload aria-hidden="true" className="size-7 text-forest" />
              <span className="mt-3 text-sm font-extrabold text-forest">{reading ? "Đang đọc file..." : "Chọn file JSON hoặc CSV"}</span>
              <span className="mt-1 text-xs font-medium text-ink/45">Tối đa 1,5 MB · file chỉ được gửi khi bạn xác nhận nhập</span>
              <input
                accept=".json,.csv,application/json,text/csv"
                className="sr-only"
                disabled={reading || pending}
                onChange={(event) => void readFile(event.target.files?.[0])}
                type="file"
              />
            </label>

            {fileErrors.length > 0 ? <ErrorList errors={fileErrors} /> : null}
            {state.status === "error" && state.message ? <div className="mt-4"><AuthFeedback message={state.message} /></div> : null}
            {state.errors?.length ? <ErrorList errors={state.errors} /> : null}
            {state.status === "success" ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl bg-mint-soft p-4 text-sm font-bold text-forest" role="status">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {state.message}
              </div>
            ) : null}

            {preview ? (
              <form action={formAction} className="mt-5 space-y-4">
                <input name="payload" readOnly type="hidden" value={createImportPayload(preview.rows)} />
                <div className="rounded-2xl border border-forest/10 bg-paper p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-extrabold">{preview.fileName}</p>
                      <p className="mt-1 text-xs font-semibold text-ink/46">
                        {preview.format.toUpperCase()}{preview.householdName ? ` · từ ${preview.householdName}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-forest px-3 py-1.5 text-xs font-extrabold text-paper">{preview.rows.length} dòng hợp lệ</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <PreviewMetric label="Tổng thu" value={formatMoney(previewSummary.income)} tone="income" />
                    <PreviewMetric label="Tổng chi" value={formatMoney(previewSummary.expense)} tone="expense" />
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-forest/10">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-mist/70 text-forest"><tr><th className="px-3 py-2.5">Ngày</th><th className="px-3 py-2.5">Danh mục</th><th className="px-3 py-2.5">Thành viên</th><th className="px-3 py-2.5 text-right">Số tiền</th></tr></thead>
                      <tbody className="divide-y divide-forest/8 bg-paper-raised">
                        {preview.rows.slice(0, 5).map((row) => (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap px-3 py-3 font-semibold">{formatDate(row.transactionDate)}</td>
                            <td className="max-w-36 truncate px-3 py-3 font-bold">{row.categoryName}</td>
                            <td className="max-w-36 truncate px-3 py-3 text-ink/52">{row.memberName || row.memberEmail}</td>
                            <td className={`whitespace-nowrap px-3 py-3 text-right font-extrabold ${row.type === "income" ? "text-income" : "text-expense"}`}>{row.type === "income" ? "+" : "-"}{formatMoney(row.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.rows.length > 5 ? <p className="border-t border-forest/8 bg-mist/35 px-3 py-2 text-center text-xs font-semibold text-ink/46">Còn {preview.rows.length - 5} giao dịch khác đã được kiểm tra.</p> : null}
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-mint-soft/65 p-4 text-sm font-semibold leading-6 text-forest">
                  <input className="mt-1 size-4 accent-[var(--forest)]" name="confirmation" required type="checkbox" value="confirmed" />
                  <span>Tôi đã xem trước dữ liệu và hiểu rằng giao dịch mới sẽ được thêm vào household hiện tại.</span>
                </label>
                <Button className="w-full" disabled={pending} type="submit">
                  <DatabaseBackup aria-hidden="true" className="size-5" />
                  {pending ? "Đang nhập giao dịch..." : `Nhập ${preview.rows.length} giao dịch`}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-mist/60 px-2 py-4 text-center"><p className="text-xl font-extrabold text-forest">{value}</p><p className="mt-1 text-[10px] font-bold text-ink/46">{label}</p></div>;
}

function ExportLink({ description, format, href, icon: Icon }: { description: string; format: string; href: string; icon: typeof FileJson }) {
  return (
    <a className="flex min-h-20 items-center gap-3 rounded-2xl border border-forest/10 bg-white/58 p-3 transition hover:border-forest/22 hover:bg-white" href={href}>
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-forest text-mint"><Icon aria-hidden="true" className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold">Tải file {format}</span><span className="mt-0.5 block text-xs font-medium leading-5 text-ink/48">{description}</span></span>
      <Download aria-hidden="true" className="size-5 shrink-0 text-forest" />
    </a>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return <div className="mt-4 rounded-2xl bg-rose/20 p-4 text-sm font-semibold text-expense" role="alert"><p className="font-extrabold">Cần kiểm tra lại file</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>;
}

function PreviewMetric({ label, value, tone }: { label: string; value: string; tone: "income" | "expense" }) {
  return <div className="rounded-xl bg-mist/55 p-3"><p className="text-[10px] font-bold text-ink/42">{label}</p><p className={`mt-1 text-sm font-extrabold ${tone === "income" ? "text-income" : "text-expense"}`}>{value}</p></div>;
}

function summarize(rows: ParsedBackupTransaction[]) {
  return rows.reduce((summary, row) => {
    summary[row.type] += row.amount;
    return summary;
  }, { income: 0, expense: 0 });
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)} đ`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${value}T00:00:00+07:00`));
}
