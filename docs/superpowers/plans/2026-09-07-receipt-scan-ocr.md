# Quét hóa đơn tự điền giao dịch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm nút "Quét hóa đơn" vào Sheet "Thêm giao dịch" để OCR ảnh hóa đơn (client-side, Tesseract.js) và điền sẵn số tiền/ngày/gợi ý danh mục vào form hiện có.

**Architecture:** Hàm parse text thuần (`parseReceiptText`) tách biệt khỏi wrapper gọi Tesseract.js (`recognizeReceiptImage`); UI mới (`ReceiptScanButton`) gọi cả hai rồi trả kết quả cho `TransactionForm` áp vào state đã có sẵn — không route mới, không bảng dữ liệu mới, không tự động submit.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest + Testing Library, `tesseract.js` (mới thêm, tự host asset).

**Spec:** `docs/superpowers/specs/2026-09-07-receipt-scan-ocr-design.md`

## Global Constraints

- Không lưu ảnh hóa đơn ở bất kỳ đâu (không upload Supabase Storage, không đính kèm transaction).
- Không tự động submit giao dịch — người dùng luôn xem lại/sửa trước khi bấm "Lưu giao dịch".
- Toàn bộ code Tesseract chỉ `import()` động khi người dùng bấm nút quét — không nằm trong bundle ban đầu.
- Asset Tesseract (worker, core wasm, `vie.traineddata`) tự host trong `public/tesseract/`, không dùng CDN mặc định của thư viện.
- Giới hạn ảnh đầu vào: `MAX_RECEIPT_IMAGE_BYTES = 15_000_000` (15 MB), resize về tối đa ~1800px cạnh dài trước khi OCR.
- Chỉ áp dụng cho giao dịch loại `expense` — hóa đơn không thể là khoản thu.

---

## Task 1: Export `CATEGORY_INTENTS` và `resolveCategory` từ assistant parser

**Files:**
- Modify: `src/lib/assistant/parser.ts`

**Interfaces:**
- Produces: `export const CATEGORY_INTENTS: CategoryIntent[]`, `export function resolveCategory(input: string, categories: CategoryOption[]): CategoryOption | null` — Task 2 import cả hai từ `@/lib/assistant/parser`.

Đây là thay đổi visibility thuần túy (thêm từ khóa `export`), không đổi logic, nên không cần chu trình RED/GREEN mới — verify bằng cách chạy lại test hiện có của file này để đảm bảo không có gì vỡ.

- [ ] **Step 1: Thêm `export` cho 2 khai báo**

Trong `src/lib/assistant/parser.ts`, đổi:

```ts
const CATEGORY_INTENTS: CategoryIntent[] = [
```

thành:

```ts
export const CATEGORY_INTENTS: CategoryIntent[] = [
```

và đổi:

```ts
function resolveCategory(input: string, categories: CategoryOption[]) {
```

thành:

```ts
export function resolveCategory(input: string, categories: CategoryOption[]) {
```

- [ ] **Step 2: Chạy lại test hiện có, xác nhận không vỡ gì**

Run: `node_modules/.bin/vitest run src/lib/assistant/`
Expected: PASS toàn bộ (không có test nào bị ảnh hưởng vì hành vi không đổi).

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistant/parser.ts
git commit -m "refactor: export resolveCategory and CATEGORY_INTENTS for reuse in receipt scanning"
```

---

## Task 2: `parseReceiptText` — hàm pure trích xuất số tiền/ngày/danh mục

**Files:**
- Create: `src/lib/receipt-scan/parser.ts`
- Test: `src/lib/receipt-scan/parser.test.ts`

**Interfaces:**
- Consumes: `normalizeVietnamese`, `parseVietnameseAmount`, `resolveCategory`, `CATEGORY_INTENTS` từ `@/lib/assistant/parser` (Task 1); `currentVietnamDate` từ `@/lib/recurring/data`; type `CategoryOption` từ `@/lib/transactions/data`.
- Produces: `export type ParsedReceipt = { amount: number | null; transactionDate: string | null; categoryId: string | null }`, `export function parseReceiptText(rawText: string, expenseCategories: CategoryOption[], today?: string): ParsedReceipt` — Task 5 dùng cả hai.

- [ ] **Step 1: Viết toàn bộ test trước (RED)**

Tạo `src/lib/receipt-scan/parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseReceiptText } from "./parser";
import type { CategoryOption } from "@/lib/transactions/data";

const TODAY = "2026-12-31";

const expenseCategories: CategoryOption[] = [
  { id: "cat-food", name: "Ăn uống", type: "expense", color: "#C2410C", icon: "food", sortOrder: 1 },
  { id: "cat-grocery", name: "Đi chợ", type: "expense", color: "#16A34A", icon: "grocery", sortOrder: 2 },
  { id: "cat-transport", name: "Di chuyển", type: "expense", color: "#2563EB", icon: "transport", sortOrder: 3 },
  { id: "cat-shopping", name: "Mua sắm", type: "expense", color: "#7C3AED", icon: "shopping", sortOrder: 4 },
];

describe("parseReceiptText", () => {
  it("đọc đúng số tiền, ngày và gợi ý danh mục từ hóa đơn siêu thị đầy đủ", () => {
    const rawText = [
      "SIEU THI COOP MART",
      "Dia chi: 123 Nguyen Trai, Q5",
      "Ngay: 05/09/2026  14:32",
      "------------------------",
      "Trung ga          2 x 3.500       7.000",
      "Sua tuoi Vinamilk 1 x 32.000     32.000",
      "Banh mi           3 x 15.000     45.000",
      "------------------------",
      "TONG CONG                        84.000",
      "Tien khach dua                  100.000",
      "Tien thoi                        16.000",
      "Cam on quy khach",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toEqual({
      amount: 84000,
      transactionDate: "2026-09-05",
      categoryId: "cat-grocery",
    });
  });

  it("lấy số tiền ở dòng kế tiếp khi nhãn tổng tiền không có số ngay trên dòng đó", () => {
    const rawText = [
      "QUAN CAFE HIGHLAND",
      "NGAY: 06/09/2026",
      "Ca phe sua           1        29.000",
      "------",
      "TONG THANH TOAN",
      "29.000",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ amount: 29000 });
  });

  it("dùng số tiền lớn nhất khi hóa đơn không có dòng tổng cộng", () => {
    const rawText = [
      "QUAN COM BINH DAN",
      "Com suon           35.000",
      "Canh rau            8.000",
      "Tra da               3.000",
    ].join("\n");

    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ amount: 35000 });
  });

  it("bỏ qua ngày ở tương lai so với hôm nay", () => {
    const rawText = "Hoa don ngay 20/01/2027\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: null });
  });

  it("bỏ qua ngày trước năm 2000", () => {
    const rawText = "Hoa don ngay 05/09/1998\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: null });
  });

  it.each([
    ["05/09/2026", "2026-09-05"],
    ["05-09-2026", "2026-09-05"],
    ["05.09.2026", "2026-09-05"],
    ["2026-09-05", "2026-09-05"],
  ])("nhận diện định dạng ngày %s", (dateText, expected) => {
    const rawText = `Hoa don ngay ${dateText}`;
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({ transactionDate: expected });
  });

  it("trả về null cho tất cả khi văn bản toàn nhiễu", () => {
    const rawText = "asdkj qwoie xcv zzz";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toEqual({
      amount: null,
      transactionDate: null,
      categoryId: null,
    });
  });

  it("không gợi ý danh mục khi hóa đơn không khớp từ khóa nào dù có số tiền", () => {
    const rawText = "CUA HANG XYZ 123\nTong cong 50.000";
    expect(parseReceiptText(rawText, expenseCategories, TODAY)).toMatchObject({
      amount: 50000,
      categoryId: null,
    });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail vì thiếu module**

Run: `node_modules/.bin/vitest run src/lib/receipt-scan/parser.test.ts`
Expected: FAIL — `Failed to resolve import "./parser"` (file chưa tồn tại).

- [ ] **Step 3: Viết implementation tối thiểu để pass**

Tạo `src/lib/receipt-scan/parser.ts`:

```ts
import {
  CATEGORY_INTENTS,
  normalizeVietnamese,
  parseVietnameseAmount,
  resolveCategory,
} from "@/lib/assistant/parser";
import { currentVietnamDate } from "@/lib/recurring/data";
import type { CategoryOption } from "@/lib/transactions/data";

export type ParsedReceipt = {
  amount: number | null;
  transactionDate: string | null;
  categoryId: string | null;
};

const TOTAL_KEYWORDS = [
  "tong cong",
  "tong tien",
  "thanh tien",
  "tong thanh toan",
  "total",
  "grand total",
  "net total",
];

const DATE_PATTERN =
  /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

export function parseReceiptText(
  rawText: string,
  expenseCategories: CategoryOption[],
  today: string = currentVietnamDate(),
): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    amount: extractAmount(lines),
    transactionDate: extractDate(rawText, today),
    categoryId: extractCategoryId(rawText, expenseCategories),
  };
}

function extractAmount(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeVietnamese(lines[index]);
    if (!TOTAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) continue;

    const onSameLine = parseVietnameseAmount(lines[index]);
    if (onSameLine !== null) return onSameLine;

    const nextLine = lines[index + 1];
    const onNextLine = nextLine ? parseVietnameseAmount(nextLine) : null;
    if (onNextLine !== null) return onNextLine;
  }

  const allAmounts = lines
    .map((line) => parseVietnameseAmount(line))
    .filter((amount): amount is number => amount !== null);
  if (allAmounts.length === 0) return null;
  return Math.max(...allAmounts);
}

function extractDate(rawText: string, today: string): string | null {
  const matches = rawText.matchAll(DATE_PATTERN);
  for (const match of matches) {
    const parsed = match[4]
      ? { year: Number(match[4]), month: Number(match[5]), day: Number(match[6]) }
      : { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
    const candidate = toDateString(parsed);
    if (candidate && candidate >= "2000-01-01" && candidate <= today) {
      return candidate;
    }
  }
  return null;
}

function toDateString({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!valid) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractCategoryId(rawText: string, expenseCategories: CategoryOption[]): string | null {
  const normalized = normalizeVietnamese(rawText);
  const match = resolveCategory(normalized, expenseCategories);
  return match?.id ?? null;
}

// Giữ import CATEGORY_INTENTS để đảm bảo resolveCategory và danh sách từ khóa
// dùng chung một nguồn — không định nghĩa lại danh sách intent ở đây.
void CATEGORY_INTENTS;
```

- [ ] **Step 4: Chạy lại test, xác nhận pass**

Run: `node_modules/.bin/vitest run src/lib/receipt-scan/parser.test.ts`
Expected: PASS toàn bộ 9 test.

- [ ] **Step 5: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/lib/receipt-scan/`
Expected: sạch, không lỗi. Nếu ESLint báo `no-unused-expressions` hoặc tương tự cho dòng `void CATEGORY_INTENTS;`, xóa hẳn dòng đó và bỏ `CATEGORY_INTENTS` khỏi import (chỉ giữ lại nếu compiler thực sự cần — mục đích ban đầu chỉ là tài liệu hoá, không bắt buộc).

- [ ] **Step 6: Commit**

```bash
git add src/lib/receipt-scan/parser.ts src/lib/receipt-scan/parser.test.ts
git commit -m "feat: add parseReceiptText for OCR-extracted amount/date/category"
```

---

## Task 3: Cài `tesseract.js` và tự host asset

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (tự động qua `pnpm add`)
- Create: `public/tesseract/worker.min.js`
- Create: `public/tesseract/core/tesseract-core.wasm.js`
- Create: `public/tesseract/core/tesseract-core-simd.wasm.js`
- Create: `public/tesseract/core/tesseract-core-lstm.wasm.js`
- Create: `public/tesseract/core/tesseract-core-simd-lstm.wasm.js`
- Create: `public/tesseract/lang-data/vie.traineddata.gz`

Không có test tự động cho task này (chỉ là file tĩnh) — verify bằng cách kiểm tra file tồn tại đúng chỗ, đúng định dạng.

- [ ] **Step 1: Cài dependency**

```bash
pnpm add tesseract.js tesseract.js-core
```

- [ ] **Step 2: Copy worker script**

```bash
mkdir -p public/tesseract/core public/tesseract/lang-data
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/worker.min.js
```

- [ ] **Step 3: Copy 4 file core wasm (đúng tên bắt buộc theo docs tesseract.js-core — `corePath` phải trỏ tới thư mục chứa đủ cả 4 file)**

```bash
cp node_modules/tesseract.js-core/tesseract-core.wasm.js public/tesseract/core/
cp node_modules/tesseract.js-core/tesseract-core-simd.wasm.js public/tesseract/core/
cp node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js public/tesseract/core/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js public/tesseract/core/
```

- [ ] **Step 4: Tải `vie.traineddata` (nguồn chính thức của tesseract.js, đã verify HTTP 200 và ~3.8 MB)**

```bash
curl -sL "https://tessdata.projectnaptha.com/4.0.0/vie.traineddata.gz" -o public/tesseract/lang-data/vie.traineddata.gz
```

- [ ] **Step 5: Verify toàn bộ file đã đúng chỗ và hợp lệ**

```bash
ls -la public/tesseract/worker.min.js public/tesseract/core/ public/tesseract/lang-data/
file public/tesseract/lang-data/vie.traineddata.gz
```

Expected: `worker.min.js` tồn tại; thư mục `core/` có đủ 4 file `.wasm.js`; `vie.traineddata.gz` tồn tại và lệnh `file` báo `gzip compressed data`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml public/tesseract/
git commit -m "chore: add tesseract.js dependency and self-hosted OCR assets"
```

---

## Task 4: `recognizeReceiptImage` — wrapper gọi Tesseract.js

**Files:**
- Create: `src/lib/receipt-scan/ocr.ts`

**Interfaces:**
- Consumes: package `tesseract.js` (Task 3), asset tại `/tesseract/*` (Task 3).
- Produces: `export const MAX_RECEIPT_IMAGE_BYTES: number`, `export async function recognizeReceiptImage(file: File, onProgress?: (percent: number) => void): Promise<string>` — Task 5 dùng cả hai.

Không unit test được có ý nghĩa (gọi Tesseract worker thật, cần môi trường browser thật) — cùng quy ước với `src/lib/transactions/data.ts` hiện tại trong repo. Verify bằng typecheck/lint/build và bằng browser thật ở Task 7.

- [ ] **Step 1: Viết implementation**

Tạo `src/lib/receipt-scan/ocr.ts`:

```ts
export const MAX_RECEIPT_IMAGE_BYTES = 15_000_000; // 15 MB
const MAX_IMAGE_DIMENSION = 1800;

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TesseractWorker> | null = null;
let currentOnProgress: ((percent: number) => void) | undefined;

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("vie", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang-data",
        logger: (message) => {
          if (message.status === "recognizing text") {
            currentOnProgress?.(Math.round(message.progress * 100));
          }
        },
      });
    })();
  }
  return workerPromise;
}

export async function recognizeReceiptImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (file.size > MAX_RECEIPT_IMAGE_BYTES) {
    throw new Error("RECEIPT_IMAGE_TOO_LARGE");
  }

  const image = await resizeImageIfNeeded(file, MAX_IMAGE_DIMENSION);
  const worker = await getWorker();

  currentOnProgress = onProgress;
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    currentOnProgress = undefined;
  }
}

async function resizeImageIfNeeded(file: File, maxDimension: number): Promise<File | Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const largestSide = Math.max(bitmap.width, bitmap.height);
  if (largestSide <= maxDimension) {
    bitmap.close();
    return file;
  }

  const scale = maxDimension / largestSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", 0.92);
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/lib/receipt-scan/`
Expected: sạch. Nếu `tsc` báo không tìm thấy type cho `tesseract.js` (thư viện có thể không kèm sẵn type declaration đầy đủ), thêm dòng sau vào đầu file `src/lib/receipt-scan/ocr.ts`:

```ts
// @ts-expect-error - tesseract.js không xuất type worker.recognize đầy đủ cho bản đang dùng.
```

ngay trước dòng `import` hoặc lời gọi cụ thể bị lỗi type — chỉ thêm nếu `tsc` thực sự báo lỗi ở bước này, không thêm trước.

- [ ] **Step 3: Commit**

```bash
git add src/lib/receipt-scan/ocr.ts
git commit -m "feat: add recognizeReceiptImage Tesseract.js wrapper with resize and size guard"
```

---

## Task 5: `ReceiptScanButton` — UI quét hóa đơn

**Files:**
- Create: `src/components/transactions/receipt-scan-button.tsx`
- Test: `src/components/transactions/receipt-scan-button.test.tsx`

**Interfaces:**
- Consumes: `ParsedReceipt`, `parseReceiptText` từ `@/lib/receipt-scan/parser` (Task 2); `MAX_RECEIPT_IMAGE_BYTES`, `recognizeReceiptImage` từ `@/lib/receipt-scan/ocr` (Task 4, import động); `CategoryOption` từ `@/lib/transactions/data`; `Button` từ `@/components/ui/button`; `useToast` từ `@/components/ui/toast`.
- Produces: `export function ReceiptScanButton(props: { categories: CategoryOption[]; disabled?: boolean; onExtracted: (result: ParsedReceipt) => void }): JSX.Element` — Task 6 dùng trong `TransactionForm`.

- [ ] **Step 1: Viết test trước (RED)**

Tạo `src/components/transactions/receipt-scan-button.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  { id: "cat-salary", name: "Lương", type: "income" as const, color: "#0F8B6F", icon: "salary", sortOrder: 2 },
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
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node_modules/.bin/vitest run src/components/transactions/receipt-scan-button.test.tsx`
Expected: FAIL — không tìm thấy module `@/components/transactions/receipt-scan-button`.

- [ ] **Step 3: Viết implementation**

Tạo `src/components/transactions/receipt-scan-button.tsx`:

```tsx
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

      if (result.amount === null && result.transactionDate === null && result.categoryId === null) {
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
```

- [ ] **Step 4: Chạy lại test, xác nhận pass**

Run: `node_modules/.bin/vitest run src/components/transactions/receipt-scan-button.test.tsx`
Expected: PASS toàn bộ 4 test.

- [ ] **Step 5: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint src/components/transactions/`
Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/receipt-scan-button.tsx src/components/transactions/receipt-scan-button.test.tsx
git commit -m "feat: add ReceiptScanButton component"
```

---

## Task 6: Nối `ReceiptScanButton` vào `TransactionForm`

**Files:**
- Modify: `src/components/transactions/transaction-manager.tsx`
- Test: `src/components/transactions/transaction-form.test.tsx` (thêm case mới vào file đã có)

**Interfaces:**
- Consumes: `ReceiptScanButton` (Task 5), `ParsedReceipt` (Task 2).

- [ ] **Step 1: Viết test tích hợp trước (RED)**

Trong `src/components/transactions/transaction-form.test.tsx`, thêm mock ở đầu file (cạnh các `vi.mock` đã có) và 1 test mới vào cuối `describe("TransactionForm offline draft", ...)`:

```ts
const { recognizeReceiptImageMock } = vi.hoisted(() => ({
  recognizeReceiptImageMock: vi.fn(),
}));

vi.mock("@/lib/receipt-scan/ocr", () => ({
  MAX_RECEIPT_IMAGE_BYTES: 15_000_000,
  recognizeReceiptImage: recognizeReceiptImageMock,
}));
```

Và thêm test:

```tsx
it("điền số tiền và ngày vào form sau khi quét hóa đơn thành công", async () => {
  recognizeReceiptImageMock.mockResolvedValue(
    "SIEU THI\nNgay 05/09/2026\nTONG CONG 84.000",
  );
  renderForm();

  const fileInput = screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File([new Uint8Array(1000)], "receipt.jpg", { type: "image/jpeg" })] },
  });

  await waitFor(() =>
    expect(screen.getByLabelText("Số tiền hoặc biểu thức")).toHaveValue("84.000"),
  );
  expect(screen.getByLabelText("Ngày giao dịch")).toHaveValue("2026-09-05");
});

it("hiện chú thích khi quét hóa đơn không đọc được số tiền nhưng đọc được ngày", async () => {
  recognizeReceiptImageMock.mockResolvedValue("Ngay 05/09/2026\nkhong co tong cong");
  renderForm();

  const fileInput = screen.getByLabelText("Chọn ảnh hóa đơn") as HTMLInputElement;
  fireEvent.change(fileInput, {
    target: { files: [new File([new Uint8Array(1000)], "receipt.jpg", { type: "image/jpeg" })] },
  });

  expect(await screen.findByText("Không nhận được số tiền từ ảnh, vui lòng nhập tay.")).toBeInTheDocument();
  expect(screen.getByLabelText("Ngày giao dịch")).toHaveValue("2026-09-05");
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node_modules/.bin/vitest run src/components/transactions/transaction-form.test.tsx`
Expected: FAIL — không tìm thấy phần tử có label "Chọn ảnh hóa đơn" (`ReceiptScanButton` chưa được gắn vào form).

- [ ] **Step 3: Import và gắn `ReceiptScanButton` vào `TransactionForm`**

Trong `src/components/transactions/transaction-manager.tsx`, thêm import (cạnh các import khác của thư mục `transactions`):

```ts
import { ReceiptScanButton } from "@/components/transactions/receipt-scan-button";
```

và thêm type import:

```ts
import type { ParsedReceipt } from "@/lib/receipt-scan/parser";
```

Trong hàm `TransactionForm`, thêm state mới ngay cạnh khai báo `showCalculator` hiện có:

```tsx
  const [receiptAmountMissing, setReceiptAmountMissing] = useState(false);
```

Thêm handler ngay sau khai báo `closeForm` (trước `useEffect` theo dõi `state.status`):

```tsx
  const applyReceiptResult = (result: ParsedReceipt) => {
    setDraftDirty(true);
    if (type !== "expense") {
      setType("expense");
      setCategoryId("");
    }
    setReceiptAmountMissing(result.amount === null);
    if (result.amount !== null) setAmountExpression(formatAmountValue(result.amount));
    if (result.transactionDate !== null) setTransactionDate(result.transactionDate);
    if (result.categoryId !== null) setCategoryId(result.categoryId);
  };
```

Tìm handler `onChange` hiện có của ô số tiền:

```tsx
            onChange={(event) => {
              setDraftDirty(true);
              setAmountExpression(formatAmountExpressionInput(event.target.value));
            }}
```

Đổi thành (thêm 1 dòng để tắt cảnh báo ngay khi người dùng tự gõ lại số tiền):

```tsx
            onChange={(event) => {
              setDraftDirty(true);
              setReceiptAmountMissing(false);
              setAmountExpression(formatAmountExpressionInput(event.target.value));
            }}
```

Trong JSX, tìm đoạn hiện có:

```tsx
            <Button onClick={() => setShowCalculator((open) => !open)} size="sm" type="button" variant="secondary">
              {showCalculator ? "Ẩn máy tính" : "Mở máy tính"}
            </Button>
          </div>
          {state.fieldErrors?.amountExpression ? <p className="mt-2 text-xs font-semibold text-expense">{state.fieldErrors.amountExpression}</p> : null}
```

Đổi thành:

```tsx
            <div className="flex items-center gap-2">
              <ReceiptScanButton categories={categories} disabled={pending} onExtracted={applyReceiptResult} />
              <Button onClick={() => setShowCalculator((open) => !open)} size="sm" type="button" variant="secondary">
                {showCalculator ? "Ẩn máy tính" : "Mở máy tính"}
              </Button>
            </div>
          </div>
          {receiptAmountMissing ? (
            <p className="mt-2 text-xs font-semibold text-expense">
              Không nhận được số tiền từ ảnh, vui lòng nhập tay.
            </p>
          ) : null}
          {state.fieldErrors?.amountExpression ? <p className="mt-2 text-xs font-semibold text-expense">{state.fieldErrors.amountExpression}</p> : null}
```

Lưu ý: đoạn trên chỉ thay 1 dòng `<Button ...>Mở máy tính</Button>` bằng `<div className="flex items-center gap-2">...</div>` bọc quanh nó — dòng `</div>` đóng khối cha (`<div className="mt-2 flex items-center justify-between gap-3">`) và dòng kiểm tra `state.fieldErrors?.amountExpression` ngay sau đó giữ nguyên vị trí tương đối, chỉ chèn thêm khối `receiptAmountMissing` vào giữa.

- [ ] **Step 4: Chạy lại test, xác nhận pass**

Run: `node_modules/.bin/vitest run src/components/transactions/transaction-form.test.tsx`
Expected: PASS toàn bộ (test cũ + test mới).

- [ ] **Step 5: Chạy toàn bộ test suite + typecheck + lint**

Run: `node_modules/.bin/vitest run && node_modules/.bin/tsc --noEmit && node_modules/.bin/eslint .`
Expected: tất cả sạch, không test nào khác bị vỡ.

- [ ] **Step 6: Commit**

```bash
git add src/components/transactions/transaction-manager.tsx src/components/transactions/transaction-form.test.tsx
git commit -m "feat: wire receipt scanning into the transaction form"
```

---

## Task 7: Xác minh cuối cùng

**Files:** không tạo/sửa file mới — chỉ verify.

- [ ] **Step 1: `pnpm check` đầy đủ**

Run: `node_modules/.bin/eslint . && node_modules/.bin/tsc --noEmit && node_modules/.bin/vitest run`
Expected: tất cả pass, không warning.

- [ ] **Step 2: Production build**

Run: `rm -rf .next && node_modules/.bin/next build`
Expected: build thành công, route `/transactions` vẫn nằm trong danh sách dynamic route như trước.

- [ ] **Step 3: Kiểm tra bundle không tải Tesseract ngay từ đầu**

Run: `node_modules/.bin/next build 2>&1 | grep -A2 "transactions"` rồi so sánh kích thước First Load JS của route `/transactions` với log build trước khi có tính năng này (đã ghi lại trong lịch sử build ở các bước trước) — kích thước không được tăng đáng kể (vài KB do thêm `ReceiptScanButton`/`parser.ts`, KHÔNG phải hàng trăm KB/MB của `tesseract.js`, vì thư viện đó chỉ `import()` động lúc runtime khi bấm nút).

- [ ] **Step 4: Ghi chú giới hạn verify trình duyệt**

Giống các tính năng trước trong repo này: `.env.local` trỏ Supabase production nên không tự đăng nhập để thử luồng quét thật — cần tài khoản test hoặc người dùng tự thử. Ghi rõ điều này khi báo cáo hoàn thành, không tự ý tạo tài khoản mới trên production.

- [ ] **Step 5: Commit cuối (nếu Task 7 có sửa gì phát sinh trong lúc verify)**

Chỉ commit nếu Step 1-3 phát hiện và bạn phải sửa gì đó; nếu mọi thứ đã sạch từ Task 1-6 thì không có gì để commit ở bước này.
