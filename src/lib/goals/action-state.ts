import type { SavingsEntryField, SavingsGoalField } from "@/lib/goals/validation";

export type SavingsActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<SavingsGoalField | SavingsEntryField, string>>;
};

export const initialSavingsActionState: SavingsActionState = { status: "idle" };
