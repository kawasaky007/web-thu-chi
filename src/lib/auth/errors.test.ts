import { describe, expect, it } from "vitest";

import { friendlyAuthError, friendlyMembershipError } from "./errors";

describe("friendly auth errors", () => {
  it("ẩn thông báo kỹ thuật khi sai thông tin đăng nhập", () => {
    expect(friendlyAuthError({ message: "Invalid login credentials" })).toBe(
      "Email hoặc mật khẩu không đúng.",
    );
  });

  it("giải thích mã mời sai và session hết hạn", () => {
    expect(friendlyMembershipError({ message: "INVALID_INVITE_CODE" })).toBe(
      "Mã mời không tồn tại hoặc đã hết hạn.",
    );
    expect(friendlyMembershipError({ message: "AUTH_REQUIRED" })).toBe(
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    );
  });
});
