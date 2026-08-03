import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/backup/data", () => ({ getTransactionBackupRows: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { getCurrentMembership } from "@/lib/auth/session";
import { getTransactionBackupRows } from "@/lib/backup/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GET } from "./route";

const membershipMock = vi.mocked(getCurrentMembership);
const rowsMock = vi.mocked(getTransactionBackupRows);
const clientMock = vi.mocked(createServerSupabaseClient);

describe("backup export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipMock.mockResolvedValue({
      userId: "user-1",
      email: "an@example.com",
      metadataFullName: "An",
      profile: { household_id: "household-1" },
      household: { id: "household-1", name: "Gia đình An" },
    } as never);
    clientMock.mockResolvedValue({} as never);
    rowsMock.mockResolvedValue([]);
  });

  it("trả 401 và no-store khi chưa đăng nhập", async () => {
    membershipMock.mockResolvedValue(null);

    const response = await GET(request("json"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("xuất JSON attachment đúng household", async () => {
    const response = await GET(request("json"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("thu-chi-gia-dinh-an");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({ schema: "thu-chi-transactions", householdName: "Gia đình An", rowCount: 0 });
  });

  it("xuất CSV có BOM và header ổn định", async () => {
    const response = await GET(request("csv"));
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(body).toContain("id,type,amount,transaction_date");
  });
});

function request(format: string) {
  return new NextRequest(`http://localhost/api/backup/transactions?format=${format}`);
}
