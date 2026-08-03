export const CATEGORY_TYPES = ["expense", "income"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const CATEGORY_COLOR_OPTIONS = [
  "#0F8B6F",
  "#2563EB",
  "#7C3AED",
  "#C2410C",
  "#DC2626",
  "#0891B2",
  "#16A34A",
  "#CA8A04",
] as const;

export const CATEGORY_ICON_OPTIONS = [
  { value: "salary", label: "Lương" },
  { value: "bonus", label: "Thưởng" },
  { value: "food", label: "Ăn uống" },
  { value: "home", label: "Nhà cửa" },
  { value: "transport", label: "Di chuyển" },
  { value: "shopping", label: "Mua sắm" },
  { value: "health", label: "Sức khỏe" },
  { value: "education", label: "Giáo dục" },
  { value: "entertainment", label: "Giải trí" },
  { value: "saving", label: "Tiết kiệm" },
  { value: "bill", label: "Hóa đơn" },
  { value: "coffee", label: "Cà phê" },
  { value: "grocery", label: "Đi chợ" },
  { value: "travel", label: "Du lịch" },
  { value: "pet", label: "Thú cưng" },
  { value: "gift", label: "Quà tặng" },
  { value: "sport", label: "Thể thao" },
  { value: "insurance", label: "Bảo hiểm" },
  { value: "internet", label: "Internet" },
  { value: "work", label: "Công việc" },
  { value: "investment", label: "Đầu tư" },
  { value: "other", label: "Khác" },
] as const;

export const DEFAULT_CATEGORY_VALUES: Record<
  CategoryType,
  { color: (typeof CATEGORY_COLOR_OPTIONS)[number]; icon: string }
> = {
  income: { color: "#0F8B6F", icon: "salary" },
  expense: { color: "#C2410C", icon: "food" },
};

export function isCategoryType(value: string): value is CategoryType {
  return CATEGORY_TYPES.includes(value as CategoryType);
}

export function categoryTypeLabel(type: CategoryType) {
  return type === "income" ? "Thu" : "Chi";
}

export function categoryTypeLabelLowercase(type: CategoryType) {
  return type === "income" ? "thu nhập" : "chi tiêu";
}
