import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getAssistantTodayExpensesAction } from "./actions";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const getMembership = vi.mocked(getCurrentMembership);
const createClient = vi.mocked(createServerSupabaseClient);

describe("assistant actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T03:00:00Z"));
    getMembership.mockResolvedValue({
      userId: "user-1",
      profile: { household_id: "household-1" },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("đọc và cộng các khoản chi hôm nay trong household", async () => {
    const query = createQuery({
      data: [
        { id: "tx-1", amount: 18_000, title: "Cà phê", note: null, transaction_date: "2026-08-04T00:00:00" },
        { id: "tx-2", amount: 50_000, title: "Ăn uống", note: "Bữa trưa", transaction_date: "2026-08-04T00:00:00" },
      ],
      error: null,
    });
    createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) } as never);

    const result = await getAssistantTodayExpensesAction();

    expect(result).toMatchObject({ status: "success", count: 2, total: 68_000 });
    expect(query.eq).toHaveBeenCalledWith("household_id", "household-1");
    expect(query.eq).toHaveBeenCalledWith("type", "expense");
    expect(query.gte).toHaveBeenCalledWith("transaction_date", "2026-08-04T00:00:00+07:00");
    expect(query.lt).toHaveBeenCalledWith("transaction_date", "2026-08-05T00:00:00+07:00");
  });
});

function createQuery(result: { data: unknown[]; error: null }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  return query;
}
