import {
  CATEGORY_INTENTS,
  normalizeVietnamese,
  parseVietnameseAmount,
  resolveCategory,
} from "@/lib/assistant/parser";
import { currentVietnamDate } from "@/lib/recurring/data";
import type { CategoryOption } from "@/lib/transactions/data";

export type ParsedReceipt = {
  amount: number | null;
  transactionDate: string | null;
  categoryId: string | null;
};

const TOTAL_KEYWORDS = [
  "tong cong",
  "tong tien",
  "thanh tien",
  "tong thanh toan",
  "total",
  "grand total",
  "net total",
];

const DATE_PATTERN =
  /\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

export function parseReceiptText(
  rawText: string,
  expenseCategories: CategoryOption[],
  today: string = currentVietnamDate(),
): ParsedReceipt {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    amount: extractAmount(lines),
    transactionDate: extractDate(rawText, today),
    categoryId: extractCategoryId(rawText, expenseCategories),
  };
}

function extractAmount(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeVietnamese(lines[index]);
    if (!TOTAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) continue;

    const onSameLine = parseVietnameseAmount(lines[index]);
    if (onSameLine !== null) return onSameLine;

    const nextLine = lines[index + 1];
    const onNextLine = nextLine ? parseVietnameseAmount(nextLine) : null;
    if (onNextLine !== null) return onNextLine;
  }

  const allAmounts = lines
    .map((line) => parseVietnameseAmount(line))
    .filter((amount): amount is number => amount !== null);
  if (allAmounts.length === 0) return null;
  return Math.max(...allAmounts);
}

function extractDate(rawText: string, today: string): string | null {
  const matches = rawText.matchAll(DATE_PATTERN);
  for (const match of matches) {
    const parsed = match[4]
      ? { year: Number(match[4]), month: Number(match[5]), day: Number(match[6]) }
      : { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
    const candidate = toDateString(parsed);
    if (candidate && candidate >= "2000-01-01" && candidate <= today) {
      return candidate;
    }
  }
  return null;
}

function toDateString({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!valid) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractCategoryId(rawText: string, expenseCategories: CategoryOption[]): string | null {
  const normalized = normalizeVietnamese(rawText);
  const match = resolveCategory(normalized, expenseCategories);
  return match?.id ?? null;
}

// Giữ import CATEGORY_INTENTS để đảm bảo resolveCategory và danh sách từ khóa
// dùng chung một nguồn — không định nghĩa lại danh sách intent ở đây.
void CATEGORY_INTENTS;
