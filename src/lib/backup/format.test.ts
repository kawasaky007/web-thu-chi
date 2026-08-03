import { describe, expect, it } from "vitest";

import {
  createImportPayload,
  createTransactionBackup,
  parseTransactionBackup,
  serializeTransactionsCsv,
  type BackupTransactionRow,
} from "./format";

const row: BackupTransactionRow = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "expense",
  amount: 125000,
  transactionDate: "2026-08-03",
  categoryId: "22222222-2222-4222-8222-222222222222",
  categoryName: "Ăn uống",
  memberId: "33333333-3333-4333-8333-333333333333",
  memberEmail: "an@example.com",
  memberName: "Nguyễn An",
  note: "Đi chợ, mua rau\nvà thịt",
  createdAt: "2026-08-03T08:00:00.000Z",
};

describe("transaction backup format", () => {
  it("round-trip JSON giữ nguyên dữ liệu cần khôi phục", () => {
    const backup = createTransactionBackup("Gia đình An", [row]);

    const parsed = parseTransactionBackup(JSON.stringify(backup), "backup.json");

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.householdName).toBe("Gia đình An");
      expect(parsed.rows[0]).toMatchObject(row);
    }
  });

  it("round-trip CSV xử lý dấu phẩy, xuống dòng và Unicode", () => {
    const parsed = parseTransactionBackup(serializeTransactionsCsv([row]), "backup.csv");

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.rows[0]).toMatchObject(row);
  });

  it("chặn CSV formula injection nhưng khôi phục đúng nội dung", () => {
    const dangerous = { ...row, note: "=HYPERLINK(\"https://example.com\")" };
    const csv = serializeTransactionsCsv([dangerous]);

    expect(csv).toContain("'=HYPERLINK");
    const parsed = parseTransactionBackup(csv, "backup.csv");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.rows[0].note).toBe(dangerous.note);
  });

  it("từ chối ID trùng và member không thể ánh xạ", () => {
    const duplicate = createTransactionBackup("Gia đình An", [row, row]);
    const duplicateResult = parseTransactionBackup(JSON.stringify(duplicate), "backup.json");
    expect(duplicateResult.success).toBe(false);

    const invalidMember = createTransactionBackup("Gia đình An", [{ ...row, memberId: null, memberEmail: "" }]);
    const memberResult = parseTransactionBackup(JSON.stringify(invalidMember), "backup.json");
    expect(memberResult.success).toBe(false);
  });

  it("payload import không gửi sourceRow do client tạo", () => {
    const parsed = parseTransactionBackup(JSON.stringify(createTransactionBackup("Nhà", [row])), "backup.json");
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const payload = JSON.parse(createImportPayload(parsed.rows));
    expect(payload.transactions[0].sourceRow).toBeUndefined();
  });

  it("từ chối version lạ và ngày không tồn tại trên lịch", () => {
    const wrongVersion = { ...createTransactionBackup("Nhà", [row]), version: 0 };
    expect(parseTransactionBackup(JSON.stringify(wrongVersion), "backup.json").success).toBe(false);

    const invalidDate = createTransactionBackup("Nhà", [{ ...row, transactionDate: "2026-02-31" }]);
    expect(parseTransactionBackup(JSON.stringify(invalidDate), "backup.json").success).toBe(false);
  });
});
