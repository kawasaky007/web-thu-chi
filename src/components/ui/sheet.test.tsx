import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Sheet } from "./sheet";

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Mở biểu mẫu</button>
      <Sheet description="Nội dung mô tả" onClose={() => setOpen(false)} open={open} title="Biểu mẫu thử">
        <button type="button">Hành động đầu tiên</button>
      </Sheet>
    </>
  );
}

describe("Sheet accessibility", () => {
  it("đưa focus vào dialog và trả lại nút mở khi đóng", async () => {
    render(<SheetHarness />);
    const opener = screen.getByRole("button", { name: "Mở biểu mẫu" });

    opener.focus();
    fireEvent.click(opener);
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
