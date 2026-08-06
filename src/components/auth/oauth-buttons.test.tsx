import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OAuthButtons } from "./oauth-buttons";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const createClient = vi.mocked(createBrowserSupabaseClient);

describe("OAuthButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bắt đầu đăng nhập Google với callback nội bộ", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    createClient.mockReturnValue({ auth: { signInWithOAuth } } as never);

    render(<OAuthButtons nextPath="/transactions?month=2026-08" />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập bằng Google" }));

    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledOnce());
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=%2Ftransactions%3Fmonth%3D2026-08",
      },
    });
  });

  it("bắt đầu đăng nhập Apple và hiển thị lỗi provider", async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: new Error("provider disabled") });
    createClient.mockReturnValue({ auth: { signInWithOAuth } } as never);

    render(<OAuthButtons nextPath="/" />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập bằng Apple" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập bằng Apple");
  });
});
