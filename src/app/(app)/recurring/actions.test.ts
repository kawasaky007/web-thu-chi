import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createRecurringRuleAction,
  initialRecurringActionState,
  materializeRecurringTransactionsAction,
  updateRecurringRuleAction,
} from "./actions";

const membershipMock = vi.mocked(getCurrentMembership);
const clientMock = vi.mocked(createServerSupabaseClient);

describe("recurring actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({
      userId: "user-1",
      email: "an@example.com",
      metadataFullName: "An",
      profile: { household_id: "household-1" },
      household: { id: "household-1" },
    } as never);
  });

  it("không gọi Supabase khi rule không hợp lệ", async () => {
    const result = await createRecurringRuleAction(
      initialRecurringActionState,
      makeFormData({ categoryId: "", amountExpression: "0", nextDueDate: "bad" }),
    );

    expect(result.status).toBe("error");
    expect(membershipMock).not.toHaveBeenCalled();
    expect(clientMock).not.toHaveBeenCalled();
  });

  it("tạo rule bằng category và member cùng household", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", type: "expense" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1" }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    clientMock.mockResolvedValue({
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce({ insert }),
    } as never);

    const result = await createRecurringRuleAction(
      initialRecurringActionState,
      validFormData({
        frequency: "weekly",
        intervalCount: "2",
        nextDueDate: "2026-08-03",
      }),
    );

    expect(result.status).toBe("success");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      household_id: "household-1",
      category_id: "cat-1",
      user_id: "user-1",
      created_by: "user-1",
      type: "expense",
      amount: 500000,
      frequency: "weekly",
      interval_count: 2,
      day_of_week: 1,
      day_of_month: null,
      start_date: "2026-08-03",
      next_due_date: "2026-08-03",
    }));
  });

  it("update luôn giới hạn theo household hiện tại", async () => {
    const categoryQuery = createChain({ data: { id: "cat-1", type: "income" }, error: null });
    const memberQuery = createChain({ data: { id: "user-1" }, error: null });
    const updateQuery = createChain({ data: { id: "rule-1" }, error: null });
    clientMock.mockResolvedValue({
      from: vi.fn()
        .mockReturnValueOnce(categoryQuery)
        .mockReturnValueOnce(memberQuery)
        .mockReturnValueOnce(updateQuery),
    } as never);

    const formData = validFormData();
    formData.set("ruleId", "rule-1");
    const result = await updateRecurringRuleAction(initialRecurringActionState, formData);

    expect(result.status).toBe("success");
    expect(updateQuery.eq).toHaveBeenCalledWith("household_id", "household-1");
  });

  it("ghi kỳ đến hạn qua RPC với giới hạn chống backlog", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { generatedCount: 3, existingCount: 0, remainingDueCount: 1 },
      error: null,
    });
    clientMock.mockResolvedValue({ rpc } as never);

    const result = await materializeRecurringTransactionsAction(
      initialRecurringActionState,
      makeFormData({ ruleId: "rule-1" }),
    );

    expect(rpc).toHaveBeenCalledWith("materialize_due_recurring_transactions", {
      p_rule_id: "rule-1",
      p_max_occurrences: 48,
    });
    expect(result).toEqual({
      status: "success",
      message: "Đã ghi 3 giao dịch đến hạn. Còn 1 lịch quá hạn, bạn có thể ghi tiếp.",
    });
  });
});

function validFormData(overrides: Record<string, string> = {}) {
  return makeFormData({
    categoryId: "cat-1",
    userId: "user-1",
    amountExpression: "500.000",
    frequency: "monthly",
    intervalCount: "1",
    nextDueDate: "2026-08-05",
    endDate: "",
    note: "Tiền định kỳ",
    ...overrides,
  });
}

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

function createChain(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  return chain;
}
