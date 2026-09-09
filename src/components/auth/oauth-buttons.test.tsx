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

  it("hiển thị lỗi và ghi log chi tiết khi provider chưa được bật", async () => {
    const providerError = new Error("provider is not enabled");
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: providerError });
    createClient.mockReturnValue({ auth: { signInWithOAuth } } as never);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<OAuthButtons nextPath="/" />);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập bằng Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể đăng nhập bằng Google");
    expect(consoleError).toHaveBeenCalledWith("Đăng nhập google thất bại:", providerError);
    consoleError.mockRestore();
  });

  it("chưa hiển thị nút Apple vì provider chưa được cấu hình", () => {
    createClient.mockReturnValue({ auth: { signInWithOAuth: vi.fn() } } as never);

    render(<OAuthButtons nextPath="/" />);

    expect(screen.queryByRole("button", { name: "Đăng nhập bằng Apple" })).not.toBeInTheDocument();
  });
});
