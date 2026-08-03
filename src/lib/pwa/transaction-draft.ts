import type { CategoryType } from "@/lib/categories/constants";

const DRAFT_PREFIX = "thu-chi:transaction-draft:v1";

export type TransactionDraft = {
  version: 1;
  type: CategoryType;
  categoryId: string;
  userId: string;
  amountExpression: string;
  transactionDate: string;
  note: string;
  updatedAt: string;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function transactionDraftKey(userId: string) {
  return `${DRAFT_PREFIX}:${userId}`;
}

export function readTransactionDraft(storage: DraftStorage, userId: string) {
  try {
    const raw = storage.getItem(transactionDraftKey(userId));
    if (!raw) return null;
    return parseTransactionDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeTransactionDraft(
  storage: DraftStorage,
  userId: string,
  draft: Omit<TransactionDraft, "version" | "updatedAt">,
) {
  try {
    const value: TransactionDraft = {
      ...draft,
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(transactionDraftKey(userId), JSON.stringify(value));
    return value;
  } catch {
    return null;
  }
}

export function clearTransactionDraft(storage: DraftStorage, userId: string) {
  try {
    storage.removeItem(transactionDraftKey(userId));
    return true;
  } catch {
    return false;
  }
}

function parseTransactionDraft(value: unknown): TransactionDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<TransactionDraft>;

  if (draft.version !== 1 || (draft.type !== "income" && draft.type !== "expense")) {
    return null;
  }
  if (
    !isShortString(draft.categoryId, 100) ||
    !isShortString(draft.userId, 100) ||
    !isShortString(draft.amountExpression, 80) ||
    !isShortString(draft.note, 240) ||
    !isDateInput(draft.transactionDate) ||
    typeof draft.updatedAt !== "string" ||
    Number.isNaN(Date.parse(draft.updatedAt))
  ) {
    return null;
  }

  return draft as TransactionDraft;
}

function isShortString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isDateInput(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00`))
  );
}
