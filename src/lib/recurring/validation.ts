import { evaluateAmountExpression } from "@/lib/transactions/amount-calculator";
import { normalizeTransactionNote } from "@/lib/transactions/validation";

export type RecurringField =
  | "categoryId"
  | "userId"
  | "amountExpression"
  | "frequency"
  | "intervalCount"
  | "nextDueDate"
  | "endDate"
  | "note";

export type RecurringInput = {
  categoryId: string;
  userId: string;
  amountExpression: string;
  frequency: string;
  intervalCount: string;
  nextDueDate: string;
  endDate: string;
  note: string;
};

export type ValidatedRecurringInput = {
  categoryId: string;
  userId: string;
  amount: number;
  frequency: "weekly" | "monthly";
  intervalCount: number;
  nextDueDate: string;
  endDate: string | null;
  note: string | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
};

export type RecurringValidationResult =
  | { success: true; data: ValidatedRecurringInput }
  | { success: false; fieldErrors: Partial<Record<RecurringField, string>> };

export function validateRecurringInput(input: RecurringInput): RecurringValidationResult {
  const fieldErrors: Partial<Record<RecurringField, string>> = {};
  const categoryId = input.categoryId.trim();
  const userId = input.userId.trim();
  const amountResult = evaluateAmountExpression(input.amountExpression);
  const frequency = input.frequency === "weekly" || input.frequency === "monthly"
    ? input.frequency
    : null;
  const intervalCount = Number(input.intervalCount);
  const nextDueDate = parseDateOnly(input.nextDueDate);
  const endDate = input.endDate.trim() ? parseDateOnly(input.endDate) : null;
  const note = normalizeTransactionNote(input.note);

  if (!categoryId) fieldErrors.categoryId = "Vui lòng chọn danh mục.";
  if (!userId) fieldErrors.userId = "Vui lòng chọn người thực hiện.";
  if (!amountResult.isValid || amountResult.value === null || amountResult.value <= 0) {
    fieldErrors.amountExpression = amountResult.errorMessage ?? "Số tiền phải lớn hơn 0.";
  } else if (amountResult.value > 1_000_000_000_000) {
    fieldErrors.amountExpression = "Số tiền tối đa là 1.000 tỷ đồng.";
  }
  if (!frequency) fieldErrors.frequency = "Chu kỳ chỉ hỗ trợ theo tuần hoặc theo tháng.";
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 12) {
    fieldErrors.intervalCount = "Khoảng lặp phải từ 1 đến 12.";
  }
  if (!nextDueDate) fieldErrors.nextDueDate = "Ngày bắt đầu không hợp lệ.";
  if (input.endDate.trim() && !endDate) fieldErrors.endDate = "Ngày kết thúc không hợp lệ.";
  if (nextDueDate && endDate && endDate < nextDueDate) {
    fieldErrors.endDate = "Ngày kết thúc phải từ ngày bắt đầu trở đi.";
  }
  if (note && note.length > 240) fieldErrors.note = "Ghi chú tối đa 240 ký tự.";

  if (
    Object.keys(fieldErrors).length > 0
    || !frequency
    || !nextDueDate
    || amountResult.value === null
  ) {
    return { success: false, fieldErrors };
  }

  const date = new Date(`${nextDueDate}T00:00:00Z`);
  return {
    success: true,
    data: {
      categoryId,
      userId,
      amount: amountResult.value,
      frequency,
      intervalCount,
      nextDueDate,
      endDate,
      note,
      dayOfWeek: frequency === "weekly" ? date.getUTCDay() : null,
      dayOfMonth: frequency === "monthly" ? date.getUTCDate() : null,
    },
  };
}

export function readRecurringFormString(formData: FormData, key: string) {
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
