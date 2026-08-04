import type { CategoryOption } from "@/lib/transactions/data";

export type AssistantTransactionCommand = {
  kind: "create_transaction";
  amount: number;
  category: CategoryOption;
  transactionDate: string;
  note: string;
};

export type AssistantCommand =
  | AssistantTransactionCommand
  | { kind: "monthly_summary" }
  | { kind: "navigate"; href: string; label: string }
  | { kind: "clarification"; message: string }
  | { kind: "help"; message: string };

type CategoryIntent = {
  keywords: string[];
  icons: string[];
  fallbackIcons?: string[];
};

const CATEGORY_INTENTS: CategoryIntent[] = [
  { keywords: ["ca phe", "cafe", "coffee", "tra sua"], icons: ["coffee"], fallbackIcons: ["food"] },
  { keywords: ["di cho", "sieu thi", "thuc pham", "rau", "thit", "tap hoa"], icons: ["grocery"], fallbackIcons: ["food", "shopping"] },
  { keywords: ["an sang", "an trua", "an toi", "com", "pho", "bun", "do an", "nha hang"], icons: ["food"] },
  { keywords: ["xang", "taxi", "grab", "gui xe", "xe buyt", "ve xe"], icons: ["transport"] },
  { keywords: ["tien nha", "thue nha", "sua nha", "noi that"], icons: ["home"] },
  { keywords: ["mua sam", "quan ao", "giay", "shopee", "lazada"], icons: ["shopping"] },
  { keywords: ["thuoc", "kham benh", "benh vien", "suc khoe"], icons: ["health"] },
  { keywords: ["hoc phi", "khoa hoc", "sach", "giao duc"], icons: ["education"] },
  { keywords: ["xem phim", "phim", "game", "karaoke", "giai tri"], icons: ["entertainment"] },
  { keywords: ["tiet kiem", "bo heo"], icons: ["saving"] },
  { keywords: ["hoa don", "tien dien", "tien nuoc"], icons: ["bill"] },
  { keywords: ["internet", "wifi", "cuoc mang"], icons: ["internet"], fallbackIcons: ["bill"] },
  { keywords: ["du lich", "khach san", "may bay"], icons: ["travel"] },
  { keywords: ["thu cung", "con cho", "cho canh", "cho cho", "meo"], icons: ["pet"] },
  { keywords: ["qua tang", "mua qua"], icons: ["gift"], fallbackIcons: ["shopping"] },
  { keywords: ["gym", "the thao", "bong da"], icons: ["sport"] },
  { keywords: ["bao hiem"], icons: ["insurance"] },
  { keywords: ["dau tu", "chung khoan", "co phieu"], icons: ["investment"] },
  { keywords: ["luong"], icons: ["salary"] },
  { keywords: ["thuong", "bonus"], icons: ["bonus"] },
];

const NAVIGATION_INTENTS = [
  { href: "/", label: "Tổng quan", keywords: ["tong quan", "dashboard", "trang chu"] },
  { href: "/transactions", label: "Giao dịch", keywords: ["giao dich", "lich su thu chi"] },
  { href: "/categories", label: "Danh mục", keywords: ["danh muc"] },
  { href: "/budgets", label: "Ngân sách", keywords: ["ngan sach"] },
  { href: "/goals", label: "Mục tiêu", keywords: ["muc tieu", "quy tiet kiem"] },
  { href: "/recurring", label: "Giao dịch định kỳ", keywords: ["dinh ky"] },
  { href: "/backup", label: "Sao lưu", keywords: ["sao luu", "backup", "xuat du lieu"] },
  { href: "/profile", label: "Cá nhân", keywords: ["ca nhan", "ho so", "tai khoan"] },
];

const INCOME_KEYWORDS = [
  "nhan luong",
  "tien luong",
  "duoc tra",
  "duoc chuyen",
  "nhan duoc",
  "thu nhap",
  "tien thuong",
  "duoc thuong",
  "ban duoc",
  "thu ve",
  "nhan loi nhuan",
  "loi nhuan dau tu",
  "lai chung khoan",
];

const EXPENSE_KEYWORDS = [
  "moi mua",
  "da mua",
  "mua ",
  "tra tien",
  "thanh toan",
  "ton ",
];

export function parseAssistantCommand(
  input: string,
  categories: CategoryOption[],
  now = new Date(),
): AssistantCommand {
  const cleanInput = input.trim().replace(/\s+/g, " ");
  const normalized = normalizeVietnamese(cleanInput);

  if (!cleanInput) {
    return { kind: "help", message: "Bạn hãy nhập một câu, ví dụ: “Mới mua cà phê 18k”." };
  }

  if (isMonthlySummaryIntent(normalized)) return { kind: "monthly_summary" };

  const amount = parseVietnameseAmount(normalized);
  if (amount !== null) {
    const type = inferTransactionType(normalized);
    const typedCategories = categories.filter((category) => category.type === type);
    const category = resolveCategory(normalized, typedCategories);

    if (typedCategories.length === 0) {
      return {
        kind: "clarification",
        message: `Household chưa có danh mục ${type === "income" ? "thu nhập" : "chi tiêu"}. Hãy tạo danh mục trước nhé.`,
      };
    }
    if (!category) {
      return {
        kind: "clarification",
        message: `Mình đã hiểu số tiền ${formatMoney(amount)}, nhưng chưa xác định được danh mục. Hãy nói rõ hơn, ví dụ: “Ăn uống 50k” hoặc “Cà phê 18k”.`,
      };
    }

    return {
      kind: "create_transaction",
      amount,
      category,
      transactionDate: parseTransactionDate(normalized, now),
      note: cleanInput.slice(0, 240),
    };
  }

  const navigation = resolveNavigation(normalized);
  if (navigation) return navigation;

  if (looksLikeTransaction(normalized)) {
    return {
      kind: "clarification",
      message: "Mình chưa thấy số tiền. Bạn có thể nói như: “Mua cà phê 18k” hoặc “Nhận lương 12 triệu”.",
    };
  }

  return {
    kind: "help",
    message: "Hiện mình có thể tự thêm giao dịch, đọc tổng quan tháng và mở nhanh các tính năng. Thử nói: “Mua cà phê 18k”, “Tháng này chi bao nhiêu?” hoặc “Mở ngân sách”.",
  };
}

export function parseVietnameseAmount(input: string): number | null {
  const normalizedInput = normalizeVietnamese(input);
  const compactMillion = /(?:^|\s)(\d+)\s*tr\s*(\d{1,3})(?=\s|$)/.exec(normalizedInput);
  if (compactMillion) {
    const fractionText = compactMillion[2];
    const fractionMultiplier = 10 ** (6 - fractionText.length);
    return Number(compactMillion[1]) * 1_000_000 + Number(fractionText) * fractionMultiplier;
  }

  const suffixed = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(trieu|tr|cu|nghin|ngan|k)(?=\s|\b)/g;
  const suffixedMatches = [...normalizedInput.matchAll(suffixed)];
  if (suffixedMatches.length > 0) {
    const match = suffixedMatches.at(-1)!;
    const value = Number(match[1].replace(",", "."));
    const multiplier = ["trieu", "tr", "cu"].includes(match[2]) ? 1_000_000 : 1_000;
    const amount = value * multiplier;
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
  }

  const withoutDates = normalizedInput.replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ");
  const plain = /(?:^|\s)(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:\s*(?:d|dong))?(?=\s|$)/g;
  const plainMatches = [...withoutDates.matchAll(plain)];
  if (plainMatches.length === 0) return null;
  const amount = Number(plainMatches.at(-1)![1].replace(/[.,]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function normalizeVietnamese(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9.,/%\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferTransactionType(input: string): "income" | "expense" {
  if (INCOME_KEYWORDS.some((keyword) => hasPhrase(input, keyword))) return "income";
  if (EXPENSE_KEYWORDS.some((keyword) => hasPhrase(input, keyword))) return "expense";
  if (CATEGORY_INTENTS.slice(-2).some((intent) => intent.keywords.some((keyword) => hasPhrase(input, keyword)))) {
    return "income";
  }
  return "expense";
}

function resolveCategory(input: string, categories: CategoryOption[]) {
  const explicitMatches = categories
    .map((category) => ({ category, name: normalizeVietnamese(category.name) }))
    .filter(({ name }) => name.length >= 2 && hasPhrase(input, name))
    .sort((left, right) => right.name.length - left.name.length);
  if (explicitMatches.length > 0) return explicitMatches[0].category;

  const intent = CATEGORY_INTENTS.find((candidate) =>
    candidate.keywords.some((keyword) => hasPhrase(input, keyword)),
  );
  if (intent) {
    for (const icon of intent.icons) {
      const category = categories.find((candidate) => candidate.icon === icon);
      if (category) return category;
    }
    for (const icon of intent.fallbackIcons ?? []) {
      const category = categories.find((candidate) => candidate.icon === icon);
      if (category) return category;
    }
  }

  const tokenMatches = categories.filter((category) => {
    const tokens = normalizeVietnamese(category.name).split(" ").filter((token) => token.length >= 4);
    return tokens.some((token) => hasPhrase(input, token));
  });
  if (tokenMatches.length === 1) return tokenMatches[0];
  if (categories.length === 1) return categories[0];
  return null;
}

function parseTransactionDate(input: string, now: Date) {
  const today = vietnamDateParts(now);
  if (hasPhrase(input, "hom qua")) return shiftDate(today, -1);

  const explicitDate = /\b(?:ngay\s*)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(input);
  if (explicitDate) {
    const yearValue = explicitDate[3]
      ? Number(explicitDate[3].length === 2 ? `20${explicitDate[3]}` : explicitDate[3])
      : today.year;
    const date = { year: yearValue, month: Number(explicitDate[2]), day: Number(explicitDate[1]) };
    if (isValidDate(date)) return formatDate(date);
  }

  return formatDate(today);
}

function vietnamDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function shiftDate(date: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return formatDate({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function isValidDate(date: { year: number; month: number; day: number }) {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return value.getUTCFullYear() === date.year
    && value.getUTCMonth() + 1 === date.month
    && value.getUTCDate() === date.day;
}

function formatDate(date: { year: number; month: number; day: number }) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function isMonthlySummaryIntent(input: string) {
  const asksAmount = ["bao nhieu", "tong chi", "tong thu", "so du", "con lai", "tong quan"].some((keyword) => hasPhrase(input, keyword));
  return asksAmount && ["thang nay", "thang hien tai", "thang"].some((keyword) => hasPhrase(input, keyword));
}

function resolveNavigation(input: string): AssistantCommand | null {
  const hasNavigationVerb = ["mo", "xem", "di den", "chuyen den", "vao"].some((keyword) => hasPhrase(input, keyword));
  if (!hasNavigationVerb) return null;
  const intent = NAVIGATION_INTENTS.find((candidate) =>
    candidate.keywords.some((keyword) => hasPhrase(input, keyword)),
  );
  return intent ? { kind: "navigate", href: intent.href, label: intent.label } : null;
}

function looksLikeTransaction(input: string) {
  return INCOME_KEYWORDS.some((keyword) => hasPhrase(input, keyword))
    || EXPENSE_KEYWORDS.some((keyword) => hasPhrase(input, keyword))
    || CATEGORY_INTENTS.some((intent) => intent.keywords.some((keyword) => hasPhrase(input, keyword)));
}

function hasPhrase(input: string, phrase: string) {
  return ` ${input} `.includes(` ${phrase.trim()} `);
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}
