"use client";

import { useRef, useState } from "react";
import { LoaderCircle, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { parseReceiptText, type ParsedReceipt } from "@/lib/receipt-scan/parser";
import type { CategoryOption } from "@/lib/transactions/data";

type ScanState = { status: "idle" } | { status: "reading"; percent: number };

export function ReceiptScanButton({
  categories,
  disabled = false,
  onError,
  onExtracted,
  onScanningChange,
}: {
  categories: CategoryOption[];
  disabled?: boolean;
  onError?: (message: string) => void;
  onExtracted: (result: ParsedReceipt) => void;
  onScanningChange?: (scanning: boolean) => void;
}) {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  // Set right before calling cancelReceiptRecognition() so the catch block
  // below can tell "the user cancelled" apart from a genuine failure — both
  // surface as a rejection of recognizeReceiptImage once the worker is
  // terminated mid-recognize.
  const cancelledRef = useRef(false);
  const { notify } = useToast();
  const expenseCategories = categories.filter((category) => category.type === "expense");
  const reading = state.status === "reading";

  const handleFileChange = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    const { MAX_RECEIPT_IMAGE_BYTES, recognizeReceiptImage } = await import("@/lib/receipt-scan/ocr");
    if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
      const maxMb = Math.round(MAX_RECEIPT_IMAGE_BYTES / 1_000_000);
      onError?.(`Ảnh vượt quá ${maxMb} MB, vui lòng chọn ảnh nhỏ hơn.`);
      return;
    }

    cancelledRef.current = false;
    onScanningChange?.(true);
    setState({ status: "reading", percent: 0 });
    try {
      const rawText = await recognizeReceiptImage(file, (percent) =>
        setState({ status: "reading", percent }),
      );
      const result = parseReceiptText(rawText, expenseCategories);
      setState({ status: "idle" });
      onScanningChange?.(false);

      if (result.amount === null && result.transactionDate === null && result.categoryId === null) {
        notify("Không đọc được thông tin từ ảnh này, vui lòng nhập tay.", "error");
        return;
      }
      onExtracted(result);
    } catch (error) {
      if (cancelledRef.current) {
        // Người dùng chủ động bấm Hủy — handleCancel đã đưa state về idle và
        // báo onScanningChange(false) rồi, không hiện lỗi cho thao tác này.
        return;
      }
      console.error("receipt scan failed", error);
      setState({ status: "idle" });
      onScanningChange?.(false);
      onError?.("Không thể đọc ảnh này. Vui lòng thử lại.");
    }
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    const { cancelReceiptRecognition } = await import("@/lib/receipt-scan/ocr");
    await cancelReceiptRecognition();
    setState({ status: "idle" });
    onScanningChange?.(false);
  };

  return (
    <div className="flex items-center gap-2">
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
      {reading ? (
        <Button
          aria-label="Hủy quét hóa đơn"
          onClick={() => void handleCancel()}
          size="sm"
          type="button"
          variant="ghost"
        >
          Hủy
        </Button>
      ) : null}
    </div>
  );
}
