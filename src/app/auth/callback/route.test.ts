import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/profile", () => ({ ensureUserProfile: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { ensureUserProfile } from "@/lib/auth/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GET } from "./route";

const ensureProfile = vi.mocked(ensureUserProfile);
const createClient = vi.mocked(createServerSupabaseClient);

describe("OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("đổi code, tạo profile OAuth nếu cần và giữ next nội bộ", async () => {
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockResolvedValue({ id: "user-1", household_id: "household-1" } as never);

    const response = await GET(new NextRequest("http://localhost/auth/callback?code=oauth-code&next=%2Fonboarding%3Ffrom%3Doauth"));

    expect(response.headers.get("location")).toBe("http://localhost/onboarding?from=oauth");
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith("oauth-code");
    expect(ensureProfile).toHaveBeenCalledWith(client, { id: "user-1" });
  });

  it("giữ đường dẫn đích sau khi người dùng OAuth chọn household", async () => {
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockResolvedValue({ id: "user-1", household_id: null } as never);

    const response = await GET(new NextRequest("http://localhost/auth/callback?code=oauth-code&next=%2Ftransactions%3Fmonth%3D2026-08"));

    expect(response.headers.get("location")).toBe("http://localhost/onboarding?next=%2Ftransactions%3Fmonth%3D2026-08");
  });

  it("đưa provider error về login", async () => {
    const response = await GET(new NextRequest("http://localhost/auth/callback?error=access_denied&next=%2Ftransactions"));

    expect(response.headers.get("location")).toBe("http://localhost/login?error=auth_callback_failed&next=%2Ftransactions");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("đưa lỗi tạo profile về login và đăng xuất session cục bộ", async () => {
    const client = createFakeClient();
    client.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    client.auth.signOut.mockResolvedValue({ error: null });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockRejectedValue(new Error("profile insert failed"));

    const response = await GET(new NextRequest("http://localhost/auth/callback?code=oauth-code&next=%2F"));

    expect(response.headers.get("location")).toBe("http://localhost/login?error=auth_callback_failed&next=%2F");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

function createFakeClient() {
  return {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
    },
  };
}
