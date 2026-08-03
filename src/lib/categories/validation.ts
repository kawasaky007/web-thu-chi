import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  isCategoryType,
  type CategoryType,
} from "./constants";

export type CategoryField = "categoryId" | "name" | "type" | "color" | "icon";

export type CategoryInput = {
  name: string;
  type: string;
  color: string;
  icon: string;
};

export type ValidatedCategoryInput = {
  name: string;
  type: CategoryType;
  color: (typeof CATEGORY_COLOR_OPTIONS)[number];
  icon: string;
};

export type CategoryValidationResult =
  | { success: true; data: ValidatedCategoryInput }
  | { success: false; fieldErrors: Partial<Record<CategoryField, string>> };

export function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateCategoryInput(input: CategoryInput): CategoryValidationResult {
  const name = normalizeCategoryName(input.name);
  const fieldErrors: Partial<Record<CategoryField, string>> = {};

  if (name.length < 2) {
    fieldErrors.name = "Tên danh mục cần tối thiểu 2 ký tự.";
  } else if (name.length > 40) {
    fieldErrors.name = "Tên danh mục tối đa 40 ký tự.";
  }

  if (!isCategoryType(input.type)) {
    fieldErrors.type = "Loại danh mục không hợp lệ.";
  }

  const color = input.color.toUpperCase();
  if (!CATEGORY_COLOR_OPTIONS.includes(color as (typeof CATEGORY_COLOR_OPTIONS)[number])) {
    fieldErrors.color = "Màu danh mục không hợp lệ.";
  }

  if (!CATEGORY_ICON_OPTIONS.some((option) => option.value === input.icon)) {
    fieldErrors.icon = "Icon danh mục không hợp lệ.";
  }

  if (Object.keys(fieldErrors).length > 0 || !isCategoryType(input.type)) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      name,
      type: input.type,
      color: color as (typeof CATEGORY_COLOR_OPTIONS)[number],
      icon: input.icon,
    },
  };
}

export function readCategoryFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
