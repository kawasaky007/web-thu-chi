import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RegisterServiceWorker } from "./register-service-worker";

describe("RegisterServiceWorker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("đăng ký ngay khi trang đã tải xong", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");

    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    render(<RegisterServiceWorker />);

    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }));
  });

  it("thông báo khi thiết bị chuyển sang offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    render(<RegisterServiceWorker />);

    expect(await screen.findByText(/Bạn đang offline/i)).toBeInTheDocument();
  });

  it("không hiển thị banner cài app khi trình duyệt phát install prompt", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperties(event, {
      prompt: { value: prompt },
      userChoice: { value: Promise.resolve({ outcome: "accepted", platform: "web" }) },
    });

    render(<RegisterServiceWorker />);
    fireEvent(window, event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("button", { name: "Cài app" })).not.toBeInTheDocument();
    expect(prompt).not.toHaveBeenCalled();
  });
});
