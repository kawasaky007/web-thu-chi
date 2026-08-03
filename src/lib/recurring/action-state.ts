import type { RecurringField } from "@/lib/recurring/validation";

export type RecurringActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<RecurringField | "ruleId", string>>;
};

export const initialRecurringActionState: RecurringActionState = { status: "idle" };
