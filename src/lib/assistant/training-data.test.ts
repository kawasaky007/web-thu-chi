import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseAssistantCommand } from "./parser";
import type { CategoryOption } from "@/lib/transactions/data";

type TrainingCase = {
  id: string;
  input: string;
  expected: {
    kind: "create_transaction" | "monthly_summary" | "navigate" | "clarification" | "help";
    type?: "expense" | "income";
    amount?: number;
    categoryIcon?: string;
    transactionDate?: string;
    href?: string;
  };
  tags: string[];
};

const categories: CategoryOption[] = [
  category("expense-coffee", "Cà phê", "expense", "coffee"),
  category("expense-grocery", "Đi chợ", "expense", "grocery"),
  category("expense-food", "Ăn uống", "expense", "food"),
  category("expense-transport", "Di chuyển", "expense", "transport"),
  category("expense-home", "Nhà cửa", "expense", "home"),
  category("expense-shopping", "Mua sắm", "expense", "shopping"),
  category("expense-health", "Sức khỏe", "expense", "health"),
  category("expense-education", "Giáo dục", "expense", "education"),
  category("expense-entertainment", "Giải trí", "expense", "entertainment"),
  category("expense-saving", "Tiết kiệm", "expense", "saving"),
  category("expense-bill", "Hóa đơn", "expense", "bill"),
  category("expense-internet", "Internet", "expense", "internet"),
  category("expense-travel", "Du lịch", "expense", "travel"),
  category("expense-pet", "Thú cưng", "expense", "pet"),
  category("expense-gift", "Quà tặng", "expense", "gift"),
  category("expense-sport", "Thể thao", "expense", "sport"),
  category("expense-insurance", "Bảo hiểm", "expense", "insurance"),
  category("expense-investment", "Đầu tư", "expense", "investment"),
  category("income-salary", "Lương", "income", "salary"),
  category("income-bonus", "Thưởng", "income", "bonus"),
  category("income-investment", "Lợi nhuận đầu tư", "income", "investment"),
];

const trainingCases = readTrainingCases();
const fixedNow = new Date("2026-08-04T03:00:00Z");

describe("assistant Vietnamese training corpus", () => {
  it("có đúng 1.000 case duy nhất và đủ phân bố intent", () => {
    expect(trainingCases).toHaveLength(1000);
    expect(new Set(trainingCases.map((item) => item.id)).size).toBe(1000);
    expect(new Set(trainingCases.map((item) => item.input.toLocaleLowerCase("vi-VN"))).size).toBe(1000);
    expect(countByIntent(trainingCases)).toEqual({
      create_transaction: 700,
      monthly_summary: 100,
      navigate: 100,
      clarification: 75,
      help: 25,
    });
  });

  it("hiểu đúng toàn bộ 1.000 case", () => {
    const failures = trainingCases.flatMap((trainingCase) => {
      const actual = parseAssistantCommand(trainingCase.input, categories, fixedNow);
      const expected = trainingCase.expected;
      if (actual.kind !== expected.kind) {
        return [{ id: trainingCase.id, input: trainingCase.input, expected, actual }];
      }
      if (actual.kind === "create_transaction") {
        const matches = actual.category.type === expected.type
          && actual.amount === expected.amount
          && actual.category.icon === expected.categoryIcon
          && actual.transactionDate === expected.transactionDate;
        return matches ? [] : [{ id: trainingCase.id, input: trainingCase.input, expected, actual }];
      }
      if (actual.kind === "navigate" && actual.href !== expected.href) {
        return [{ id: trainingCase.id, input: trainingCase.input, expected, actual }];
      }
      return [];
    });

    expect(failures.slice(0, 20)).toEqual([]);
    expect(failures).toHaveLength(0);
  });
});

function readTrainingCases(): TrainingCase[] {
  const path = resolve(process.cwd(), "src/lib/assistant/data/vi-agent-training.jsonl");
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as TrainingCase);
}

function category(
  id: string,
  name: string,
  type: CategoryOption["type"],
  icon: string,
): CategoryOption {
  return { id, name, type, icon, color: type === "income" ? "#0F8B6F" : "#C2410C", sortOrder: 0 };
}

function countByIntent(cases: TrainingCase[]) {
  return cases.reduce<Record<string, number>>((counts, item) => {
    counts[item.expected.kind] = (counts[item.expected.kind] ?? 0) + 1;
    return counts;
  }, {});
}
