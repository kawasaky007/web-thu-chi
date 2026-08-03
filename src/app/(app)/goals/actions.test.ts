import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { initialSavingsActionState } from "@/lib/goals/action-state";
import {
  createSavingsGoalAction,
  recordSavingsGoalEntryAction,
  updateSavingsGoalAction,
} from "./actions";

const membershipMock = vi.mocked(getCurrentMembership);
const clientMock = vi.mocked(createServerSupabaseClient);

describe("savings actions", () => {
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

  it("không gọi Supabase khi mục tiêu không hợp lệ", async () => {
    const result = await createSavingsGoalAction(
      initialSavingsActionState,
      makeFormData({ name: "", targetAmount: "0" }),
    );
    expect(result.status).toBe("error");
    expect(membershipMock).not.toHaveBeenCalled();
  });

  it("tạo mục tiêu trong household hiện tại", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    clientMock.mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as never);

    const result = await createSavingsGoalAction(initialSavingsActionState, validGoalForm());

    expect(result.status).toBe("success");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      household_id: "household-1",
      created_by: "user-1",
      name: "Quỹ khẩn cấp",
      kind: "emergency",
      target_amount: 100000000,
    }));
  });

  it("cập nhật target và tự đánh dấu hoàn thành theo aggregate", async () => {
    const updateQuery = createChain({ data: { id: "goal-1" }, error: null });
    const rpc = vi.fn().mockResolvedValue({
      data: { today: "2026-08-03", goals: [{ id: "goal-1", name: "Quỹ", kind: "general", targetAmount: 200000000, targetDate: null, color: "#1F3D2B", icon: "saving", status: "active", createdAt: "", currentAmount: 120000000, entryCount: 1, recentEntries: [] }] },
      error: null,
    });
    clientMock.mockResolvedValue({ rpc, from: vi.fn().mockReturnValue(updateQuery) } as never);
    const formData = validGoalForm({ targetAmount: "100.000.000" });
    formData.set("goalId", "goal-1");

    const result = await updateSavingsGoalAction(initialSavingsActionState, formData);

    expect(result.status).toBe("success");
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(updateQuery.eq).toHaveBeenCalledWith("household_id", "household-1");
  });

  it("ghi đóng góp qua RPC sau khi kiểm tra member", async () => {
    const memberQuery = createChain({ data: { id: "user-1" }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: { currentAmount: 5500000 }, error: null });
    clientMock.mockResolvedValue({ from: vi.fn().mockReturnValue(memberQuery), rpc } as never);

    const result = await recordSavingsGoalEntryAction(
      initialSavingsActionState,
      makeFormData({
        goalId: "goal-1",
        requestId: "5d3daef4-7bde-4c2e-88f5-5f8b7fd8bc66",
        entryType: "deposit",
        amount: "500.000",
        entryDate: "2026-08-03",
        userId: "user-1",
        note: "Trích từ lương",
      }),
    );

    expect(rpc).toHaveBeenCalledWith("record_savings_goal_entry", {
      p_goal_id: "goal-1",
      p_entry_type: "deposit",
      p_amount: 500000,
      p_entry_date: "2026-08-03",
      p_request_id: "5d3daef4-7bde-4c2e-88f5-5f8b7fd8bc66",
      p_note: "Trích từ lương",
      p_user_id: "user-1",
    });
    expect(result.message).toContain("5.500.000");
  });

  it("hiển thị lỗi riêng khi rút vượt số dư", async () => {
    const memberQuery = createChain({ data: { id: "user-1" }, error: null });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "SAVINGS_WITHDRAWAL_EXCEEDS_BALANCE" } });
    clientMock.mockResolvedValue({ from: vi.fn().mockReturnValue(memberQuery), rpc } as never);

    const result = await recordSavingsGoalEntryAction(
      initialSavingsActionState,
      makeFormData({ goalId: "goal-1", requestId: "ec3156b2-1118-4d62-9090-5b0ff116855b", entryType: "withdrawal", amount: "900.000", entryDate: "2026-08-03", userId: "user-1", note: "" }),
    );
    expect(result.fieldErrors?.amount).toContain("vượt quá số dư");
  });
});

function validGoalForm(overrides: Record<string, string> = {}) {
  return makeFormData({
    name: "Quỹ khẩn cấp",
    kind: "emergency",
    targetAmount: "100.000.000",
    targetDate: "2027-08-03",
    color: "#1F3D2B",
    icon: "shield",
    ...overrides,
  });
}

function makeFormData(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

function createChain(result: { data: unknown; error: unknown }) {
  const chain = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}
