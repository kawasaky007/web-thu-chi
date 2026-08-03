import { describe, expect, it } from "vitest";

import {
  clearTransactionDraft,
  readTransactionDraft,
  transactionDraftKey,
  writeTransactionDraft,
} from "./transaction-draft";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

const draft = {
  type: "expense" as const,
  categoryId: "food",
  userId: "member-1",
  amountExpression: "125000 + 25000",
  transactionDate: "2026-08-03",
  note: "Đi chợ cuối tuần",
};

describe("transaction draft", () => {
  it("lưu và đọc nháp theo từng người dùng", () => {
    const storage = createStorage();

    const saved = writeTransactionDraft(storage, "user-1", draft);

    expect(saved?.version).toBe(1);
    expect(readTransactionDraft(storage, "user-1")).toMatchObject(draft);
    expect(readTransactionDraft(storage, "user-2")).toBeNull();
  });

  it("bỏ qua dữ liệu hỏng hoặc sai phiên bản", () => {
    const storage = createStorage();
    storage.setItem(transactionDraftKey("user-1"), "{not-json");
    expect(readTransactionDraft(storage, "user-1")).toBeNull();

    storage.setItem(transactionDraftKey("user-1"), JSON.stringify({ ...draft, version: 2 }));
    expect(readTransactionDraft(storage, "user-1")).toBeNull();
  });

  it("xóa nháp sau khi đồng bộ thành công", () => {
    const storage = createStorage();
    writeTransactionDraft(storage, "user-1", draft);

    expect(clearTransactionDraft(storage, "user-1")).toBe(true);
    expect(readTransactionDraft(storage, "user-1")).toBeNull();
  });
});
