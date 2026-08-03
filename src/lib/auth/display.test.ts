import { describe, expect, it } from "vitest";

import { getFirstName, getInitials } from "./display";

describe("profile display helpers", () => {
  it("tạo tên ngắn và chữ cái đại diện cho tên Việt Nam", () => {
    expect(getFirstName("Nguyễn Minh An")).toBe("An");
    expect(getInitials("Nguyễn Minh An")).toBe("NA");
  });
});
