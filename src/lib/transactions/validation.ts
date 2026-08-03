import { evaluateAmountExpression } from "./amount-calculator";

export type TransactionField =
  | "amountExpression"
  | "categoryId"
  | "userId"
  | "transactionDate"
  | "note";

export type TransactionInput = {
  amountExpression: string;
  categoryId: string;
  userId: string;
  transactionDate: string;
  note: string;
};

export type ValidatedTransactionInput = {
  amount: number;
  categoryId: string;
  userId: string;
  transactionDate: string;
  note: string | null;
};

export type TransactionValidationResult =
  | { success: true; data: ValidatedTransactionInput }
  | { success: false; fieldErrors: Partial<Record<TransactionField, string>> };

export function normalizeTransactionNote(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean || null;
}

export function validateTransactionInput(input: TransactionInput): TransactionValidationResult {
  const fieldErrors: Partial<Record<TransactionField, string>> = {};
  const amountResult = evaluateAmountExpression(input.amountExpression);
  const categoryId = input.categoryId.trim();
  const userId = input.userId.trim();
  const transactionDate = input.transactionDate.trim();
  const note = normalizeTransactionNote(input.note);

  if (!amountResult.isValid || amountResult.value === null || amountResult.value <= 0) {
    fieldErrors.amountExpression =
      amountResult.errorMessage ?? "Số tiền phải lớn hơn 0.";
  } else if (amountResult.value > Number.MAX_SAFE_INTEGER) {
    fieldErrors.amountExpression = "Số tiền quá lớn.";
  }

  if (!categoryId) fieldErrors.categoryId = "Vui lòng chọn danh mục.";
  if (!userId) fieldErrors.userId = "Vui lòng chọn người thực hiện.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate) || Number.isNaN(Date.parse(`${transactionDate}T00:00:00`))) {
    fieldErrors.transactionDate = "Ngày giao dịch không hợp lệ.";
  }
  if (note && note.length > 240) fieldErrors.note = "Ghi chú tối đa 240 ký tự.";

  if (Object.keys(fieldErrors).length > 0 || amountResult.value === null) {
    return { success: false, fieldErrors };
  }

  return {
    success: true,
    data: {
      amount: amountResult.value,
      categoryId,
      userId,
      transactionDate,
      note,
    },
  };
}

export function readTransactionFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
