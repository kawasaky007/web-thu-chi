"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Receipt, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { parseReceiptText, type ParsedReceipt } from "@/lib/receipt-scan/parser";
import type { CategoryOption } from "@/lib/transactions/data";

type ScanState =
  | { status: "idle" }
  | { status: "reading"; percent: number }
  | { status: "error"; message: string };

export function ReceiptScanButton({
  categories,
  disabled = false,
  onExtracted,
}: {
  categories: CategoryOption[];
  disabled?: boolean;
  onExtracted: (result: ParsedReceipt) => void;
}) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const { notify } = useToast();
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const reading = state.status === "reading";

  const handleFileChange = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const { MAX_RECEIPT_IMAGE_BYTES, recognizeReceiptImage } = await import("@/lib/receipt-scan/ocr");
    if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
      setState({ status: "error", message: "Ảnh vượt quá 15 MB, vui lòng chọn ảnh nhỏ hơn." });
      return;
    }

    setState({ status: "reading", percent: 0 });
    try {
      const rawText = await recognizeReceiptImage(file, (percent) =>
        setState({ status: "reading", percent }),
      );
      const result = parseReceiptText(rawText, expenseCategories);
      setState({ status: "idle" });

      if (result.amount === null && result.transactionDate === null) {
        notify("Không đọc được thông tin từ ảnh này, vui lòng nhập tay.", "error");
        return;
      }
      onExtracted(result);
    } catch {
      setState({ status: "error", message: "Không thể đọc ảnh này. Vui lòng thử lại." });
    }
  };

  return (
    <div>
      <input
        accept="image/*"
        aria-label="Chọn ảnh hóa đơn"
        capture="environment"
        className="sr-only"
        disabled={disabled || reading}
        onChange={(event) => void handleFileChange(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      <Button
        disabled={disabled || reading}
        onClick={() => inputRef.current?.click()}
        size="sm"
        type="button"
        variant="secondary"
      >
        {reading ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Đang đọc hóa đơn... {state.percent}%
          </>
        ) : (
          <>
            <Receipt aria-hidden="true" className="size-4" />
            Quét hóa đơn
          </>
        )}
      </Button>
      {state.status === "error" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-expense">
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
