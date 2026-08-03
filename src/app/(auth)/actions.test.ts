import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/auth/profile", () => ({
  ensureUserProfile: vi.fn(),
}));

import {
  createHouseholdAction,
  joinHouseholdAction,
  loginAction,
  logoutAction,
} from "./actions";
import { ensureUserProfile } from "@/lib/auth/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createClient = vi.mocked(createServerSupabaseClient);
const ensureProfile = vi.mocked(ensureUserProfile);
const initialState = { status: "idle" as const };

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("đăng nhập thành công và giữ redirect nội bộ", async () => {
    const client = createFakeClient();
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: {} },
      error: null,
    });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockResolvedValue({ household_id: "household-1" } as never);

    const formData = makeFormData({
      email: "an@example.com",
      password: "password123",
      next: "/transactions?month=7",
    });

    await expect(loginAction(initialState, formData)).rejects.toThrow(
      "NEXT_REDIRECT:/transactions?month=7",
    );
  });

  it("đưa người chưa có household tới onboarding", async () => {
    const client = createFakeClient();
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-1" }, session: {} },
      error: null,
    });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockResolvedValue({ household_id: null } as never);

    await expect(
      loginAction(
        initialState,
        makeFormData({
          email: "an@example.com",
          password: "password123",
          next: "/budgets",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/onboarding?next=%2Fbudgets");
  });

  it("hiển thị lỗi khi thông tin đăng nhập sai", async () => {
    const client = createFakeClient();
    client.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });
    createClient.mockResolvedValue(client as never);

    await expect(
      loginAction(
        initialState,
        makeFormData({ email: "an@example.com", password: "sai-mat-khau" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Email hoặc mật khẩu không đúng.",
    });
  });

  it("chuyển về login khi session mất trong lúc onboarding", async () => {
    const client = createFakeClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "session missing" },
    });
    createClient.mockResolvedValue(client as never);

    await expect(
      createHouseholdAction(
        initialState,
        makeFormData({ householdName: "Gia đình An", next: "/transactions" }),
      ),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/login?error=session_expired&next=%2Ftransactions",
    );
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("không gọi RPC khi mã mời sai định dạng", async () => {
    await expect(
      joinHouseholdAction(
        initialState,
        makeFormData({ inviteCode: "123", next: "/" }),
      ),
    ).resolves.toEqual({
      status: "error",
      fieldErrors: { inviteCode: "Mã mời cần từ 6 đến 8 chữ hoặc số." },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("đổi lỗi RPC mã mời sang thông báo tiếng Việt", async () => {
    const client = createFakeClient();
    client.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    client.rpc.mockResolvedValue({
      data: null,
      error: { message: "INVALID_INVITE_CODE", code: "P0002" },
    });
    createClient.mockResolvedValue(client as never);
    ensureProfile.mockResolvedValue({ id: "user-1" } as never);

    await expect(
      joinHouseholdAction(
        initialState,
        makeFormData({ inviteCode: "ABC123", next: "/" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "Mã mời không tồn tại hoặc đã hết hạn.",
    });
  });

  it("đăng xuất session cục bộ và về login", async () => {
    const client = createFakeClient();
    client.auth.signOut.mockResolvedValue({ error: null });
    createClient.mockResolvedValue(client as never);

    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

function createFakeClient() {
  return {
    auth: {
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  };
}

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}
