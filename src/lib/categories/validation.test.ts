import { describe, expect, it } from "vitest";

import { validateCategoryInput } from "./validation";

describe("category validation", () => {
  it("chuẩn hóa tên và chấp nhận dữ liệu hợp lệ", () => {
    const result = validateCategoryInput({
      name: "  Ăn   uống  ",
      type: "expense",
      color: "#c2410c",
      icon: "food",
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Ăn uống",
        type: "expense",
        color: "#C2410C",
        icon: "food",
      },
    });
  });

  it("từ chối tên quá ngắn và option không nằm trong design system", () => {
    const result = validateCategoryInput({
      name: "A",
      type: "other",
      color: "#ffffff",
      icon: "unknown",
    });

    expect(result).toEqual({
      success: false,
      fieldErrors: {
        name: "Tên danh mục cần tối thiểu 2 ký tự.",
        type: "Loại danh mục không hợp lệ.",
        color: "Màu danh mục không hợp lệ.",
        icon: "Icon danh mục không hợp lệ.",
      },
    });
  });

  it("chấp nhận icon danh mục mở rộng", () => {
    const result = validateCategoryInput({
      name: "Du lịch",
      type: "expense",
      color: "#2563EB",
      icon: "travel",
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Du lịch",
        type: "expense",
        color: "#2563EB",
        icon: "travel",
      },
    });
  });
});
