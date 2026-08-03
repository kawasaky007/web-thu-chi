import { currentVietnamDate } from "@/lib/recurring/data";
import { evaluateAmountExpression } from "@/lib/transactions/amount-calculator";
import { normalizeTransactionNote } from "@/lib/transactions/validation";

export const savingsGoalIcons = ["saving", "shield", "home", "travel", "education", "car", "other"] as const;
export const savingsGoalKinds = ["general", "emergency"] as const;

export type SavingsGoalField = "name" | "kind" | "targetAmount" | "targetDate" | "color" | "icon";
export type SavingsEntryField = "goalId" | "requestId" | "entryType" | "amount" | "entryDate" | "userId" | "note";

export function validateSavingsGoalInput(input: {
  name: string;
  kind: string;
  targetAmount: string;
  targetDate: string;
  color: string;
  icon: string;
}) {
  const fieldErrors: Partial<Record<SavingsGoalField, string>> = {};
  const name = input.name.trim().replace(/\s+/g, " ");
  const kind = savingsGoalKinds.find((value) => value === input.kind);
  const amountResult = evaluateAmountExpression(input.targetAmount);
  const targetDate = input.targetDate.trim() ? parseDateOnly(input.targetDate) : null;
  const color = input.color.trim().toUpperCase();
  const icon = savingsGoalIcons.find((value) => value === input.icon);

  if (!name) fieldErrors.name = "Vui lòng nhập tên mục tiêu.";
  else if (name.length > 80) fieldErrors.name = "Tên mục tiêu tối đa 80 ký tự.";
  if (!kind) fieldErrors.kind = "Loại mục tiêu không hợp lệ.";
  if (!amountResult.isValid || amountResult.value === null || amountResult.value <= 0) {
    fieldErrors.targetAmount = amountResult.errorMessage ?? "Số tiền mục tiêu phải lớn hơn 0.";
  } else if (amountResult.value > 1_000_000_000_000_000) {
    fieldErrors.targetAmount = "Số tiền mục tiêu quá lớn.";
  }
  if (input.targetDate.trim() && !targetDate) fieldErrors.targetDate = "Ngày mục tiêu không hợp lệ.";
  if (!/^#[0-9A-F]{6}$/.test(color)) fieldErrors.color = "Màu mục tiêu không hợp lệ.";
  if (!icon) fieldErrors.icon = "Biểu tượng mục tiêu không hợp lệ.";

  if (Object.keys(fieldErrors).length || !kind || !icon || amountResult.value === null) {
    return { success: false as const, fieldErrors };
  }
  return {
    success: true as const,
    data: { name, kind, targetAmount: amountResult.value, targetDate, color, icon },
  };
}

export function validateSavingsEntryInput(input: {
  goalId: string;
  requestId: string;
  entryType: string;
  amount: string;
  entryDate: string;
  userId: string;
  note: string;
}, today = currentVietnamDate()) {
  const fieldErrors: Partial<Record<SavingsEntryField, string>> = {};
  const goalId = input.goalId.trim();
  const requestId = input.requestId.trim();
  const entryType = input.entryType === "deposit" || input.entryType === "withdrawal"
    ? input.entryType
    : null;
  const amountResult = evaluateAmountExpression(input.amount);
  const entryDate = parseDateOnly(input.entryDate);
  const userId = input.userId.trim();
  const note = normalizeTransactionNote(input.note);

  if (!goalId) fieldErrors.goalId = "Mục tiêu không hợp lệ.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    fieldErrors.requestId = "Mã yêu cầu không hợp lệ. Vui lòng mở lại biểu mẫu.";
  }
  if (!entryType) fieldErrors.entryType = "Loại biến động không hợp lệ.";
  if (!amountResult.isValid || amountResult.value === null || amountResult.value <= 0) {
    fieldErrors.amount = amountResult.errorMessage ?? "Số tiền phải lớn hơn 0.";
  } else if (amountResult.value > 1_000_000_000_000) {
    fieldErrors.amount = "Số tiền mỗi lần tối đa 1.000 tỷ đồng.";
  }
  if (!entryDate || entryDate > today) fieldErrors.entryDate = "Ngày ghi quỹ không được ở tương lai.";
  if (!userId) fieldErrors.userId = "Vui lòng chọn người đóng góp.";
  if (note && note.length > 240) fieldErrors.note = "Ghi chú tối đa 240 ký tự.";

  if (Object.keys(fieldErrors).length || !entryType || !entryDate || amountResult.value === null) {
    return { success: false as const, fieldErrors };
  }
  return {
    success: true as const,
    data: { goalId, requestId, entryType, amount: amountResult.value, entryDate, userId, note },
  };
}

export function readSavingsFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 2000
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}
