export type BudgetField = "categoryId" | "amount" | "month" | "orderedIds";

export function readBudgetFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseBudgetAmount(value: string) {
  const cleanValue = value.trim().replace(/\s/g, "");
  if (!cleanValue) return null;

  // Budget amounts are whole VND. Accept both 3.500.000 and 3500000.
  const normalized = cleanValue.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) return null;
  return Math.round(amount);
}

export function validateBudgetMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || month < 1 || month > 12) return null;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

export function parseOrderedIds(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 200) return null;
    const ids = parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((id) => id.trim());
    return new Set(ids).size === ids.length ? ids : null;
  } catch {
    return null;
  }
}
