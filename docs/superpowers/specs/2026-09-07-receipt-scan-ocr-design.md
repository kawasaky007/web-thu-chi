# Quét hóa đơn tự điền giao dịch (OCR client-side)

Ngày viết: 07/09/2026. Tính năng nằm trong danh sách "Tính năng miễn phí nên
bổ sung sau feature parity" tại `docs/migration-map.md`: *"OCR hóa đơn bằng
Tesseract.js chạy trên thiết bị; nên để tùy chọn vì khá nặng."*

## Bối cảnh

Form "Thêm giao dịch" hiện tại (`TransactionForm` trong
`src/components/transactions/transaction-manager.tsx`) đã có sẵn: chọn loại
thu/chi, nhập số tiền qua ô biểu thức có máy tính (`amountExpression`), chọn
danh mục theo lưới, chọn người thực hiện, chọn ngày, ghi chú. Server Action
`createTransactionAction` validate lại category/member cùng household trước
khi ghi, không đổi.

Tính năng này chỉ thêm **một cách điền nhanh** các ô đã có sẵn của form đó
bằng cách đọc ảnh hóa đơn, không tạo route/bảng dữ liệu mới, không đổi luồng
lưu giao dịch.

## Mục tiêu

- Người dùng chụp/chọn ảnh hóa đơn ngay trong Sheet "Thêm giao dịch" và có
  **số tiền**, **ngày giao dịch**, **gợi ý danh mục** được điền sẵn để xem lại
  và sửa trước khi lưu.
- Toàn bộ xử lý ảnh chạy trên thiết bị (Tesseract.js/WASM), không gửi ảnh lên
  server hay dịch vụ ngoài nào.
- Không ảnh hưởng bundle chính của app khi người dùng không dùng tính năng
  này (lazy-load).

## Ngoài phạm vi (non-goals)

- **Không lưu ảnh hóa đơn.** Ảnh chỉ tồn tại tạm trong bộ nhớ trình duyệt để
  OCR, không upload lên Supabase Storage, không đính kèm vào transaction làm
  bằng chứng. Đây là quyết định phạm vi, không phải giới hạn kỹ thuật — nếu
  sau này cần "lưu ảnh làm bằng chứng" thì đó là một tính năng khác (cần
  bucket Storage + RLS + UI xem lại), không nằm trong spec này.
- Không tự động submit giao dịch. Người dùng luôn phải xem lại và bấm "Lưu
  giao dịch" như hiện tại.
- Không cố nhận diện người thực hiện (`userId`) hay ghi chú (`note`) từ hóa
  đơn — hai ô này giữ hành vi mặc định hiện có của form.
- Không hỗ trợ hóa đơn nhiều ảnh/nhiều trang trong 1 lần quét.
- Không áp dụng cho giao dịch loại "Thu nhập" — hóa đơn luôn được hiểu là
  khoản chi (xem phần Thuật toán).

## Luồng người dùng

1. Trong Sheet "Thêm giao dịch", cạnh nút "Mở máy tính" ở ô số tiền, thêm nút
   **"Quét hóa đơn"**.
2. Bấm nút → `<input type="file" accept="image/*" capture="environment" hidden>`
   được kích hoạt: mở camera trực tiếp trên mobile (nhờ `capture="environment"`),
   hoặc mở hộp thoại chọn file trên desktop.
3. Chọn/chụp ảnh xong → form chuyển sang trạng thái "Đang đọc hóa đơn..." kèm
   % tiến trình (Tesseract.js báo qua `logger` callback), các trường vẫn hiển
   thị nhưng bị disable trong lúc xử lý; người dùng có thể huỷ.
4. OCR xong (`worker.recognize` trả `data.text`) → chuyển văn bản thô qua
   `parseReceiptText` → nhận `{ amount, transactionDate, categoryId }`.
5. Áp kết quả vào state hiện có của `TransactionForm`:
   - `type` → ép về `"expense"` nếu đang khác (đổi tab loại giao dịch).
   - `amountExpression` → nếu `amount !== null`, set bằng
     `formatAmountValue(amount)`; nếu `null`, giữ nguyên giá trị đang có và
     hiện dòng chú thích nhỏ "Không nhận được số tiền, vui lòng nhập tay."
   - `transactionDate` → nếu có ngày hợp lệ thì set, không thì giữ mặc định
     hôm nay (hành vi hiện tại).
   - `categoryId` → nếu có gợi ý và category đó thuộc loại `expense`, set làm
     lựa chọn sẵn (người dùng vẫn có thể đổi bình thường trên lưới danh mục).
6. Người dùng xem lại toàn bộ ô, sửa nếu cần, bấm "Lưu giao dịch" — không có
   gì khác với luồng nhập tay hiện tại từ bước này trở đi.

## Kiến trúc & thư viện

- Thêm dependency `tesseract.js` (bản ổn định mới nhất tại thời điểm code —
  chốt version cụ thể khi `pnpm add`, không ghim version trong spec này).
- **Tự host asset** của Tesseract (worker script, tesseract-core wasm,
  `vie.traineddata`) trong `public/tesseract/` thay vì dùng CDN mặc định
  (`cdn.jsdelivr.net`) của thư viện — nhất quán với cách app tự host icon,
  `sw.js`, `offline.html`; tránh phụ thuộc uptime của CDN ngoài cho một tính
  năng lõi. Cấu hình qua `createWorker('vie', 1, { workerPath, corePath,
  langPath, logger })` trỏ vào các file trong `public/tesseract/` (danh sách
  file chính xác phụ thuộc version tesseract.js cài đặt — xác định lúc code,
  copy từ `node_modules/tesseract.js*/dist` và `node_modules/tesseract.js-core`
  vào `public/tesseract/` theo hướng dẫn "Local installation" của thư viện).
- Dùng 1 pass OCR duy nhất, ngôn ngữ `vie` — chữ số nhận tốt với mọi gói
  ngôn ngữ, và cần tiếng Việt để đoán danh mục từ tên hàng/cửa hàng.
- Toàn bộ module gọi Tesseract (`src/lib/receipt-scan/ocr.ts` và chính thư
  viện `tesseract.js`) chỉ được `import()` động bên trong handler xử lý sự
  kiện chọn file — không xuất hiện trong bundle ban đầu của trang giao dịch.
- Worker Tesseract nên được tạo 1 lần và giữ lại (module-level singleton
  trong `ocr.ts`, khởi tạo lười) để lần quét thứ hai trở đi trong cùng phiên
  không phải load lại core/lang data.

## Thành phần code mới

### `src/lib/receipt-scan/parser.ts` (hàm pure, TDD)

```
export type ParsedReceipt = {
  amount: number | null;
  transactionDate: string | null; // "yyyy-mm-dd" hoặc null
  categoryId: string | null;
};

export function parseReceiptText(
  rawText: string,
  expenseCategories: CategoryOption[],
  today = currentVietnamDate(), // tái dùng từ lib/recurring/data.ts
): ParsedReceipt
```

Không phụ thuộc Tesseract, chỉ nhận text thô → test bằng text mẫu, không cần
mock gì.

### `src/lib/receipt-scan/ocr.ts` (wrapper Tesseract, không unit test)

```
export const MAX_RECEIPT_IMAGE_BYTES = 15_000_000; // 15 MB, chặn trước khi resize/OCR

export async function recognizeReceiptImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> // trả rawText
```

Cùng dạng với `src/lib/transactions/data.ts` hiện tại: gọi API ngoài (ở đây
là Tesseract worker thay vì Supabase), không unit test được có ý nghĩa, verify
qua browser giống các phần khác của app.

Ảnh chụp trực tiếp từ camera mobile có thể rất lớn (10+ MP), làm OCR chậm và
tốn bộ nhớ không cần thiết — chữ trên hóa đơn không cần độ phân giải đó.
`recognizeReceiptImage` chịu trách nhiệm:
1. Từ chối sớm nếu `file.size > MAX_RECEIPT_IMAGE_BYTES` (báo lỗi thân thiện,
   không đưa vào Tesseract) — cùng tinh thần `MAX_BACKUP_BYTES` đã dùng ở
   `src/lib/backup/format.ts`.
2. Resize ảnh về chiều dài cạnh lớn nhất khoảng 1600–2000px trước khi đưa vào
   `worker.recognize` (dùng `<canvas>`/`createImageBitmap` có sẵn của trình
   duyệt, không cần thêm thư viện) — giảm đáng kể thời gian OCR trên máy yếu
   mà không ảnh hưởng khả năng đọc chữ in.

### `src/components/transactions/receipt-scan-button.tsx` (UI mới, file riêng)

Tách file riêng thay vì viết inline trong `transaction-manager.tsx` (khác với
`MemberFilterMenu` trước đây) vì thành phần này có pipeline bất đồng bộ thật
sự (đọc file → OCR có tiến trình → parse → callback áp kết quả) và phụ thuộc
ngoài (Tesseract) — tách ra giữ `transaction-manager.tsx` không phình to
thêm. Props: `categories: CategoryOption[]`, `onExtracted: (result:
ParsedReceipt) => void`, `disabled?: boolean`. Tự quản lý state cục bộ:
`idle | reading | error`, tự hiện input file ẩn, progress bar, thông báo lỗi.

`TransactionForm` gọi component này, nhận `onExtracted` rồi set các state
`type`/`amountExpression`/`transactionDate`/`categoryId` đang có sẵn — không
đổi field mới nào của form.

### Thay đổi nhỏ ở file đã có

- `src/lib/assistant/parser.ts`: export thêm `CATEGORY_INTENTS` và
  `resolveCategory` (hiện là hàm nội bộ, không export) để tái dùng cho việc
  đoán danh mục từ text hóa đơn, tránh viết lại danh sách từ khóa lần hai.

## Thuật toán trích xuất

Input cho cả 3 hàm dưới là `rawText` gốc từ Tesseract (giữ nguyên dấu xuống
dòng — **không** chạy `normalizeVietnamese` lên toàn bộ text trước, vì hàm đó
gộp hết dòng thành 1 chuỗi và làm mất cấu trúc dòng cần để tìm dòng
"TỔNG CỘNG").

**Số tiền** — quét từng dòng (`rawText.split(/\r?\n/)`):
1. Chuẩn hóa từng dòng bằng `normalizeVietnamese` (đã có), tìm dòng chứa 1
   trong các từ khóa: `tong cong`, `tong tien`, `thanh tien`,
   `tong thanh toan`, `total`, `grand total`, `net total`.
2. Nếu thấy dòng khớp: thử lấy số tiền trên chính dòng đó bằng cách tái dùng
   logic regex số kiểu VNĐ đã có trong `src/lib/assistant/parser.ts`
   (`parseVietnameseAmount`, đã export sẵn) — hàm này trả về số tiền **cuối
   cùng** xuất hiện trên dòng, không phải số lớn nhất (một dòng nhãn tổng
   cộng thực tế chỉ có đúng 1 số nên khác biệt này không ảnh hưởng); nếu dòng
   đó không có số, thử dòng kế tiếp (số tiền hay in xuống dòng sau nhãn).
3. Nếu không có dòng nào khớp từ khóa (hoặc khớp nhưng không tìm được số):
   chạy `parseVietnameseAmount` trên **từng dòng** của toàn bộ hóa đơn, gom
   mọi số tìm được, trả về **giá trị lớn nhất** — tổng cộng luôn là số tiền
   lớn nhất in trên hóa đơn (lớn hơn từng dòng hàng, thuế, tiền thối...).
4. Không tìm được số nào → trả `null` (form giữ nguyên, không đoán bừa).

**Ngày giao dịch** — quét toàn bộ `rawText` (không cần tách dòng):
1. Regex tìm các mẫu `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`, `yyyy-mm-dd`
   (cùng kiểu parse/validate ngày hợp lệ như `parseDateOnly` trong
   `src/lib/recurring/validation.ts` — reject ngày không tồn tại như 31/02).
2. Loại các match mà năm < 2000 hoặc ngày ở tương lai so với `today` (Việt
   Nam) — hóa đơn không thể có ngày tương lai; theo cùng nguyên tắc
   `entryDate > today` đã dùng ở `goals/validation.ts`.
3. Nhiều match hợp lệ → lấy match **đầu tiên xuất hiện trong text** (ngày
   giao dịch thường in ở đầu hóa đơn, trước các ngày khác như hạn bảo hành).
   Đây là heuristic, không phải tuyệt đối chính xác — ghi rõ trong phần Rủi
   ro bên dưới.
4. Không có match hợp lệ → trả `null` (form giữ mặc định hôm nay).

**Gợi ý danh mục**:
1. Chuẩn hóa toàn bộ `rawText` bằng `normalizeVietnamese` (ở bước này gộp
   dòng là chấp nhận được vì chỉ cần tìm từ khóa xuất hiện ở đâu đó).
2. Gọi thẳng `resolveCategory(normalizedText, expenseCategories)` (vừa export
   thêm ở trên) — dùng lại đúng logic khớp tên category/keyword icon đã có
   trong trợ lý chat, chỉ khác nguồn input là text OCR thay vì câu chat.
3. Không khớp → trả `null` (không đoán bừa, người dùng tự chọn danh mục như
   bình thường).

## Trạng thái UI & xử lý lỗi

| Tình huống | Hành vi |
| --- | --- |
| Chọn file vượt `MAX_RECEIPT_IMAGE_BYTES` | Toast lỗi ngay khi chọn file, không mở Tesseract |
| Đang đọc ảnh (OCR chạy) | Progress bar theo %, các ô form disable, có nút Huỷ |
| Không tìm được số tiền | Điền ngày/danh mục nếu có, để trống số tiền, hiện dòng chú thích nhỏ dưới ô số tiền |
| Không tìm được ngày | Giữ mặc định hôm nay, không hiện lỗi (đây là trường hợp bình thường) |
| Không tìm được danh mục | Không chọn sẵn danh mục nào, không hiện lỗi (bình thường) |
| Không tìm được gì cả | Toast lỗi "Không đọc được thông tin từ ảnh này, vui lòng nhập tay", form giữ nguyên trạng thái trước khi quét |
| Lỗi tải Tesseract lần đầu (mất mạng) | Toast lỗi, cho phép bấm lại nút để thử lại |
| Người dùng huỷ khi đang xử lý | Dừng, quay lại trạng thái `idle`, không set field nào |

## Testing

- `parseReceiptText` (TDD, test trước khi code): chuẩn bị ~5-8 đoạn text hóa
  đơn mẫu (tự viết tay dựa trên bố cục hóa đơn Việt Nam phổ biến — siêu thị,
  quán ăn, có/không có dòng "TỔNG CỘNG", có/không có ngày, có lỗi OCR điển
  hình như ký tự lẫn lộn) → assert đúng `amount`/`transactionDate`/
  `categoryId` kỳ vọng. Bao gồm case rawText rỗng, case toàn nhiễu không có
  số nào.
- `resolveCategory`/`CATEGORY_INTENTS` sau khi export: các test hiện có của
  `assistant/parser.test.ts` và `assistant/training-data.test.ts` phải tiếp
  tục pass nguyên vẹn (không đổi hành vi, chỉ đổi visibility export).
- `recognizeReceiptImage` và `ReceiptScanButton`: không unit test phần gọi
  Tesseract thật (giống quy ước hiện có cho mọi hàm gọi Supabase/API ngoài
  trong repo). `ReceiptScanButton` có thể có 1 test nhỏ cho state UI
  (idle/reading/error) nếu tách được phần state ra khỏi lời gọi OCR thật khi
  code, nhưng không bắt buộc — quyết định lúc implement.

## Rủi ro & giới hạn đã biết

- Độ chính xác OCR phụ thuộc chất lượng ảnh (ánh sáng, góc chụp, hóa đơn
  nhàu) — không có cách khắc phục ngoài để người dùng luôn xem lại/sửa tay.
- Heuristic "ngày đầu tiên xuất hiện" và "số tiền lớn nhất" có thể sai với
  hóa đơn bố cục lạ — chấp nhận được vì kết quả luôn hiển thị để sửa trước
  khi lưu, không tự động ghi dữ liệu sai.
- `vie.traineddata` + core wasm có thể vài MB — lần quét đầu tiên của mỗi
  người dùng sẽ chậm hơn (tải asset); nên cache được nhờ `cachePath`/IndexedDB
  mà Tesseract.js tự quản lý, các lần sau nhanh hơn nhiều.
- Cần kiểm tra license file `vie.traineddata` khi tải về (traineddata chính
  thức của dự án Tesseract dùng giấy phép Apache 2.0, tương thích tự host).

## Xác minh khi triển khai

- `pnpm check` (lint + typecheck + test) và `pnpm build` phải sạch, giống
  quy trình đã áp dụng cho các tính năng trước.
- Kiểm tra kích thước bundle trang `/transactions` KHÔNG tăng đáng kể so với
  trước khi thêm tính năng (xác nhận lazy-load hoạt động đúng — `tesseract.js`
  không nằm trong chunk tải ban đầu).
- Verify UI thật trong browser vẫn vướng constraint đã nêu ở các tính năng
  trước: `.env.local` trỏ Supabase production, cần tài khoản test hoặc người
  dùng tự thử để xem trọn luồng quét → điền form → lưu.
