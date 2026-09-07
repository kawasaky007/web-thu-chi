import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useLinkStatusMock } = vi.hoisted(() => ({ useLinkStatusMock: vi.fn() }));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  return { ...actual, useLinkStatus: useLinkStatusMock };
});

const { LinkPendingOverlay } = await import("./link-pending-overlay");

describe("LinkPendingOverlay", () => {
  it("không hiện gì khi Link chưa ở trạng thái pending", () => {
    useLinkStatusMock.mockReturnValue({ pending: false });
    render(<LinkPendingOverlay />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hiện overlay kèm chỉ báo đang tải khi Link đang pending", () => {
    useLinkStatusMock.mockReturnValue({ pending: true });
    render(<LinkPendingOverlay />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Đang tải...")).toBeInTheDocument();
  });
});
