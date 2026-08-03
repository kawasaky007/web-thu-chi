import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  deleteHouseholdAction,
  initialProfileActionState,
  leaveHouseholdAction,
  transferOwnershipAction,
  updateProfileNameAction,
} from "./actions";

const membershipMock = vi.mocked(getCurrentMembership);
const clientMock = vi.mocked(createServerSupabaseClient);

describe("profile actions", () => {
  beforeEach(() => {
    membershipMock.mockResolvedValue({
      userId: "user-1",
      email: "an@example.com",
      metadataFullName: "An",
      profile: { id: "user-1", household_id: "household-1" },
      household: { id: "household-1", name: "Nhà An", owner_id: "user-1" },
    } as never);
  });

  it("updates only the current profile with normalized name", async () => {
    const query = createChain({ data: { id: "user-1" }, error: null });
    clientMock.mockResolvedValue({ from: vi.fn().mockReturnValue(query) } as never);

    const result = await updateProfileNameAction(initialProfileActionState, formData({ fullName: "  Nguyễn   An " }));

    expect(result.status).toBe("success");
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Nguyễn An" }));
    expect(query.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("transfers ownership through the transactional RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    clientMock.mockResolvedValue({ rpc } as never);

    const result = await transferOwnershipAction(initialProfileActionState, formData({ newOwnerId: "user-2" }));

    expect(result.status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("transfer_household_ownership", { new_owner_id: "user-2" });
  });

  it("blocks owner leave and wrong delete confirmation before calling RPC", async () => {
    const rpc = vi.fn();
    clientMock.mockResolvedValue({ rpc } as never);

    const leaveResult = await leaveHouseholdAction(initialProfileActionState, new FormData());
    const deleteResult = await deleteHouseholdAction(initialProfileActionState, formData({ confirmation: "Sai tên" }));

    expect(leaveResult.status).toBe("error");
    expect(deleteResult.fieldErrors?.confirmation).toBeDefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});

function formData(values: Record<string, string>) {
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
