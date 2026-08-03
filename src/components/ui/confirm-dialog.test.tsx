import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmAction, ConfirmDialog } from "./confirm-dialog";

function DialogHarness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Mở xác nhận</button>
      <ConfirmDialog
        description="Thao tác thử nghiệm không thể hoàn tác."
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        open={open}
        title="Xác nhận thao tác?"
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("ưu tiên focus nút hủy và trả focus về nút mở", async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Mở xác nhận" });

    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole("alertdialog", { name: "Xác nhận thao tác?" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Hủy" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("gọi callback xác nhận", () => {
    const onConfirm = vi.fn();
    render(<DialogHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Mở xác nhận" }));
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("ConfirmAction", () => {
  it("chỉ gửi form sau khi người dùng xác nhận", async () => {
    const action = vi.fn();
    render(
      <ConfirmAction
        action={action}
        description="Dữ liệu thử nghiệm sẽ bị xóa."
        title="Xóa dữ liệu?"
        trigger={(openDialog) => <button onClick={openDialog} type="button">Xóa</button>}
      >
        <input name="itemId" type="hidden" value="item-1" readOnly />
      </ConfirmAction>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(action).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(action.mock.calls[0][0]).toBeInstanceOf(FormData);
    expect((action.mock.calls[0][0] as FormData).get("itemId")).toBe("item-1");
  });
});
