export type BudgetMonthRow = { month: number; year: number };

export function resolveBudgetCloneSource(rows: BudgetMonthRow[], target: BudgetMonthRow) {
  const targetExists = rows.some((row) => row.month === target.month && row.year === target.year);
  if (targetExists) return { targetExists: true, source: null };

  const source = [...rows]
    .filter((row) => row.year < target.year || (row.year === target.year && row.month < target.month))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0] ?? null;
  return { targetExists: false, source };
}
