import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptScanButton } from "@/components/transactions/receipt-scan-button";
import { ToastProvider } from "@/components/ui/toast";
import type { ParsedReceipt } from "@/lib/receipt-scan/parser";

const { recognizeReceiptImageMock, cancelReceiptRecognitionMock } = vi.hoisted(() => ({
  recognizeReceiptImageMock: vi.fn(),
  cancelReceiptRecognitionMock: vi.fn(),
}));

vi.mock("@/lib/receipt-scan/ocr", () => ({
  MAX_RECEIPT_IMAGE_BYTES: 15_000_000,
  recognizeReceiptImage: recognizeReceiptImageMock,
  cancelReceiptRecognition: cancelReceiptRecognitionMock,
}));

const categories = [
  { id: "cat-food", name: "Ăn uống", type: "expense" as const, color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "cat-shopping", name: "Mua sắm", type: "expense" as const, color: "#7C2D12", icon: "shopping", sortOrder: 2 },
  { id: "cat-salary", name: "Lương", type: "income" as const, color: "#0F8B6F", icon: "salary", sortOrder: 3 },
];

function makeFile(name = "receipt.jpg", sizeBytes = 1000) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

// ReceiptScanButton reports its error message up via onError instead of
// rendering it internally (see transaction-manager.tsx, where the real error
// paragraph is rendered full-width next to receiptAmountMissing). This tiny
// harness plays the role of that parent so existing assertions that look for
// the error text in the DOM keep working unchanged.
function Harness({
  onExtracted,
  onScanningChange,
}: {
  onExtracted: (result: ParsedReceipt) => void;
  onScanningChange?: (scanning: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ReceiptScanButton
        categories={categories}
        onError={setError}
        onExtracted={onExtracted}
        onScanningChange={onScanningChange}
      />
      {error ? <p>{error}</p> : null}
    </>
  );
}

function renderButton(onExtracted = vi.fn()) {
  render(
    <ToastProvider>
      <Harness onExtracted={onExtracted} />
    </ToastProvider>,
  );
  return { onExtracted, input: screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement };
}

describe("ReceiptScanButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("gọi onExtracted với kết quả đọc được sau khi chọn ảnh", async () => {
    recognizeReceiptImageMock.mockResolvedValue("SIEU THI\nTONG CONG 84.000");
    const { onExtracted, input } = renderButton();

    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(onExtracted).toHaveBeenCalledOnce());
    expect(onExtracted.mock.calls[0][0]).toMatchObject({ amount: 84000 });
  });

  it("hiện lỗi khi chọn ảnh vượt quá giới hạn dung lượng, không gọi OCR", async () => {
    const { onExtracted, input } = renderButton();

    fireEvent.change(input, { target: { files: [makeFile("big.jpg", 20_000_000)] } });

    expect(await screen.findByText(/vượt quá 15 MB/)).toBeInTheDocument();
    expect(recognizeReceiptImageMock).not.toHaveBeenCalled();
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("hiện lỗi khi Tesseract thất bại", async () => {
    recognizeReceiptImageMock.mockRejectedValue(new Error("boom"));
    const { onExtracted, input } = renderButton();

    fireEvent.change(input, { target: { files: [makeFile()] } });

    expect(await screen.findByText(/Không thể đọc ảnh này/)).toBeInTheDocument();
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("hiện thông báo khi không đọc được thông tin nào từ ảnh", async () => {
    recognizeReceiptImageMock.mockResolvedValue("xyz khong co gi lien quan");
    const { onExtracted, input } = renderButton();

    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(screen.getByText("Quét hóa đơn")).toBeInTheDocument());
    expect(onExtracted).not.toHaveBeenCalled();
  });

  it("gọi onExtracted khi chỉ đọc được danh mục, không có số tiền hay ngày", async () => {
    recognizeReceiptImageMock.mockResolvedValue("com ga xoi man");
    const { onExtracted, input } = renderButton();

    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(onExtracted).toHaveBeenCalledOnce());
    expect(onExtracted.mock.calls[0][0]).toMatchObject({
      amount: null,
      transactionDate: null,
      categoryId: "cat-food",
    });
  });

  it("bấm Hủy trong lúc quét thì quay về trạng thái ban đầu, không hiện lỗi và không gọi onExtracted", async () => {
    let rejectRecognize!: (error: unknown) => void;
    recognizeReceiptImageMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRecognize = reject;
        }),
    );
    const onExtracted = vi.fn();
    const onScanningChange = vi.fn();
    render(
      <ToastProvider>
        <Harness onExtracted={onExtracted} onScanningChange={onScanningChange} />
      </ToastProvider>,
    );
    const input = screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement;

    fireEvent.change(input, { target: { files: [makeFile()] } });

    const cancelButton = await screen.findByRole("button", { name: "Hủy quét hóa đơn" });
    expect(onScanningChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(cancelButton);
    // Mô phỏng worker.terminate() khiến lời gọi recognize() đang chờ bị reject.
    rejectRecognize(new Error("worker terminated"));

    await waitFor(() => expect(screen.getByText("Quét hóa đơn")).toBeInTheDocument());
    expect(cancelReceiptRecognitionMock).toHaveBeenCalledOnce();
    expect(onScanningChange).toHaveBeenLastCalledWith(false);
    expect(onExtracted).not.toHaveBeenCalled();
    expect(screen.queryByText(/Không thể đọc ảnh này/)).not.toBeInTheDocument();
  });
});
