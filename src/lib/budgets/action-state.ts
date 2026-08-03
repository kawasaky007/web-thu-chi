export type BudgetActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"categoryId" | "amount" | "month" | "orderedIds", string>>;
};

export const initialBudgetActionState: BudgetActionState = { status: "idle" };
