import { describe, expect, it } from "vitest";

import {
  normalizeInviteCode,
  validateHouseholdName,
  validateInviteCode,
  validateLoginInput,
  validateRegisterInput,
} from "./validation";

describe("auth validation", () => {
  it("chuẩn hóa email khi đăng nhập", () => {
    expect(
      validateLoginInput({ email: "  AN@EXAMPLE.COM ", password: "secret" }),
    ).toEqual({
      success: true,
      data: { email: "an@example.com", password: "secret" },
    });
  });

  it("trả lỗi cho form đăng ký không hợp lệ", () => {
    const result = validateRegisterInput({
      fullName: "A",
      email: "khong-hop-le",
      password: "1234567",
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        fullName: "Tên hiển thị cần tối thiểu 2 ký tự.",
        email: "Email không hợp lệ.",
        password: "Mật khẩu cần tối thiểu 8 ký tự.",
      },
    });
  });

  it("chuẩn hóa và kiểm tra mã mời", () => {
    expect(normalizeInviteCode(" a7-k9 q2 ")).toBe("A7K9Q2");
    expect(validateInviteCode("A7K9Q2")).toEqual({
      success: true,
      data: { inviteCode: "A7K9Q2" },
    });
    expect(validateInviteCode("123")).toEqual({
      success: false,
      fieldErrors: { inviteCode: "Mã mời cần từ 6 đến 8 chữ hoặc số." },
    });
  });

  it("giới hạn tên household giống RPC production", () => {
    expect(validateHouseholdName("  Nhà   của An ")).toEqual({
      success: true,
      data: { householdName: "Nhà của An" },
    });
    expect(validateHouseholdName("A").success).toBe(false);
  });
});
