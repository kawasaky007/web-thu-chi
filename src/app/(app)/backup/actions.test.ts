import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentMembership } from "@/lib/auth/session";
import { initialBackupActionState } from "@/lib/backup/action-state";
import { createTransactionBackup } from "@/lib/backup/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { importTransactionsAction } from "./actions";

const membershipMock = vi.mocked(getCurrentMembership);
const clientMock = vi.mocked(createServerSupabaseClient);

const userId = "33333333-3333-4333-8333-333333333333";
const categoryId = "22222222-2222-4222-8222-222222222222";
const transactionId = "11111111-1111-4111-8111-111111111111";

describe("backup import action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({
      userId,
      email: "an@example.com",
      metadataFullName: "An",
      profile: { id: userId, household_id: "household-1" },
      household: { id: "household-1", name: "Nhà An" },
    } as never);
  });

  it("không xử lý file khi chưa xác nhận preview", async () => {
    const result = await importTransactionsAction(initialBackupActionState, formData({ payload: payload() }));

    expect(result.status).toBe("error");
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it("từ chối toàn bộ batch khi category hoặc member không khớp", async () => {
    const categories = queryResult({ data: [], error: null });
    const members = queryResult({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValueOnce(categories).mockReturnValueOnce(members) };
    clientMock.mockResolvedValue(client as never);

    const result = await importTransactionsAction(
      initialBackupActionState,
      formData({ confirmation: "confirmed", payload: payload() }),
    );

    expect(result.status).toBe("error");
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining("danh mục"), expect.stringContaining("thành viên")]));
    expect(client.from).toHaveBeenCalledTimes(2);
  });

  it("upsert một batch, giữ ID và khóa household hiện tại", async () => {
    const categories = queryResult({ data: [{ id: categoryId, name: "Ăn uống", type: "expense" }], error: null });
    const members = queryResult({ data: [{ id: userId, email: "an@example.com" }], error: null });
    const upsert = upsertResult({ data: [{ id: transactionId }], error: null });
    const client = { from: vi.fn().mockReturnValueOnce(categories).mockReturnValueOnce(members).mockReturnValueOnce(upsert) };
    clientMock.mockResolvedValue(client as never);

    const result = await importTransactionsAction(
      initialBackupActionState,
      formData({ confirmation: "confirmed", payload: payload() }),
    );

    expect(result).toMatchObject({ status: "success", imported: 1, skipped: 0 });
    expect(upsert.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: transactionId,
        household_id: "household-1",
        category_id: categoryId,
        user_id: userId,
        created_by: userId,
        amount: 125000,
      }),
    ], { onConflict: "id", ignoreDuplicates: true });
  });

  it("báo số giao dịch đã có mà không ghi đè", async () => {
    const categories = queryResult({ data: [{ id: categoryId, name: "Ăn uống", type: "expense" }], error: null });
    const members = queryResult({ data: [{ id: userId, email: "an@example.com" }], error: null });
    const upsert = upsertResult({ data: [], error: null });
    clientMock.mockResolvedValue({ from: vi.fn().mockReturnValueOnce(categories).mockReturnValueOnce(members).mockReturnValueOnce(upsert) } as never);

    const result = await importTransactionsAction(
      initialBackupActionState,
      formData({ confirmation: "confirmed", payload: payload() }),
    );

    expect(result).toMatchObject({ status: "success", imported: 0, skipped: 1 });
  });
});

function payload() {
  return JSON.stringify(createTransactionBackup("Nhà An", [{
    id: transactionId,
    type: "expense",
    amount: 125000,
    transactionDate: "2026-08-03",
    categoryId,
    categoryName: "Ăn uống",
    memberId: userId,
    memberEmail: "an@example.com",
    memberName: "An",
    note: "Đi chợ",
    createdAt: "2026-08-03T01:00:00.000Z",
  }]));
}

function formData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function queryResult(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain);
  return chain;
}

function upsertResult(result: { data: unknown; error: unknown }) {
  const chain = { upsert: vi.fn(), select: vi.fn().mockResolvedValue(result) };
  chain.upsert.mockReturnValue(chain);
  return chain;
}
