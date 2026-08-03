export function readProfileFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(value: string) {
  const fullName = normalizeDisplayName(value);
  if (!fullName) return { success: false as const, message: "Tên hiển thị không được để trống." };
  if (fullName.length > 50) return { success: false as const, message: "Tên hiển thị tối đa 50 ký tự." };
  return { success: true as const, fullName };
}

export function validateHouseholdName(value: string) {
  const name = normalizeDisplayName(value);
  if (name.length < 2) return { success: false as const, message: "Tên household cần tối thiểu 2 ký tự." };
  if (name.length > 60) return { success: false as const, message: "Tên household tối đa 60 ký tự." };
  return { success: true as const, name };
}

export function matchesHouseholdConfirmation(value: string, householdName: string) {
  return value.trim() === householdName;
}
