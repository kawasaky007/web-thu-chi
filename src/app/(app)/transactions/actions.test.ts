import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn((callback: () => unknown) => { void callback(); }) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/notifications/push", () => ({ sendTransactionPushNotifications: vi.fn().mockResolvedValue(undefined) }));

import {
  createTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
} from "./actions";
import { getCurrentMembership } from "@/lib/auth/session";
import { sendTransactionPushNotifications } from "@/lib/notifications/push";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialTransactionActionState } from "@/lib/transactions/action-state";

const getMembership = vi.mocked(getCurrentMembership);
const createClient = vi.mocked(createServerSupabaseClient);
const sendPush = vi.mocked(sendTransactionPushNotifications);

describe("transaction actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMembership.mockResolvedValue({
      userId: "user-1",
      email: "an@example.com",
      metadataFullName: "An",
      profile: { household_id: "household-1" },
      household: { id: "household-1" },
    } as never);
  });

  it("không gọi Supabase khi số tiền hoặc liên kết thiếu", async () => {
    const result = await createTransactionAction(
      initialTransactionActionState,
      makeFormData({ amountExpression: "0", categoryId: "", userId: "", transactionDate: "bad" }),
    );

    expect(result.status).toBe("error");
    expect(getMembership).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("tạo giao dịch bằng category và member cùng household", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", household_id: "household-1", name: "Ăn uống", type: "expense" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1", household_id: "household-1" }, error: null });
    const insertQuery = createChain({ data: { id: "tx-new" }, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(insertQuery),
    };
    createClient.mockResolvedValue(client as never);

    const result = await createTransactionAction(
      initialTransactionActionState,
      makeFormData({
        amountExpression: "125.000 + 25.000",
        categoryId: "cat-1",
        userId: "user-1",
        transactionDate: "2026-08-03",
        note: "Đi chợ",
      }),
    );

    expect(result.status).toBe("success");
    expect(result.transactionId).toBe("tx-new");
    expect(insertQuery.insert).toHaveBeenCalledWith({
      household_id: "household-1",
      category_id: "cat-1",
      user_id: "user-1",
      created_by: "user-1",
      type: "expense",
      amount: 150000,
      title: "Ăn uống",
      note: "Đi chợ",
      transaction_date: "2026-08-03T00:00:00",
    });
  });

  it("vẫn trả success dù gửi thông báo push thất bại", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", household_id: "household-1", name: "Ăn uống", type: "expense" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1", household_id: "household-1" }, error: null });
    const insertQuery = createChain({ data: { id: "tx-new" }, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(insertQuery),
    };
    createClient.mockResolvedValue(client as never);
    sendPush.mockRejectedValueOnce(new Error("push failed"));

    const result = await createTransactionAction(
      initialTransactionActionState,
      makeFormData({
        amountExpression: "45000",
        categoryId: "cat-1",
        userId: "user-1",
        transactionDate: "2026-08-03",
        note: "",
      }),
    );

    expect(result.status).toBe("success");
    expect(sendPush).toHaveBeenCalledOnce();
  });

  it("update luôn kèm household hiện tại", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", household_id: "household-1", name: "Lương", type: "income" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1", household_id: "household-1" }, error: null });
    const updateQuery = createChain({ data: { id: "tx-1" }, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(updateQuery),
    };
    createClient.mockResolvedValue(client as never);

    const result = await updateTransactionAction(
      initialTransactionActionState,
      makeFormData({
        transactionId: "tx-1",
        amountExpression: "5.000.000",
        categoryId: "cat-1",
        userId: "user-1",
        transactionDate: "2026-08-03",
        note: "Lương tháng này",
      }),
    );

    expect(result.status).toBe("success");
    expect(updateQuery.eq).toHaveBeenCalledWith("household_id", "household-1");
  });

  it("không giả vờ xóa thành công khi RLS không trả dòng", async () => {
    const deleteQuery = createChain({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(deleteQuery) };
    createClient.mockResolvedValue(client as never);

    const result = await deleteTransactionAction(
      initialTransactionActionState,
      makeFormData({ transactionId: "tx-other" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Chỉ người thực hiện giao dịch mới có thể xóa giao dịch này.",
    });
  });
});

function createChain(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    delete: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  return chain;
}

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}
