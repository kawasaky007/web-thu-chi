import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReceiptScanButton } from "@/components/transactions/receipt-scan-button";
import { ToastProvider } from "@/components/ui/toast";

const { recognizeReceiptImageMock } = vi.hoisted(() => ({
  recognizeReceiptImageMock: vi.fn(),
}));

vi.mock("@/lib/receipt-scan/ocr", () => ({
  MAX_RECEIPT_IMAGE_BYTES: 15_000_000,
  recognizeReceiptImage: recognizeReceiptImageMock,
}));

const categories = [
  { id: "cat-food", name: "Ăn uống", type: "expense" as const, color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "cat-shopping", name: "Mua sắm", type: "expense" as const, color: "#7C2D12", icon: "shopping", sortOrder: 2 },
  { id: "cat-salary", name: "Lương", type: "income" as const, color: "#0F8B6F", icon: "salary", sortOrder: 3 },
];

function makeFile(name = "receipt.jpg", sizeBytes = 1000) {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/jpeg" });
}

function renderButton(onExtracted = vi.fn()) {
  render(
    <ToastProvider>
      <ReceiptScanButton categories={categories} onExtracted={onExtracted} />
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
});
