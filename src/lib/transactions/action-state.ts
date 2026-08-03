import type { TransactionField } from "@/lib/transactions/validation";

export type TransactionActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<TransactionField, string>>;
};

export const initialTransactionActionState: TransactionActionState = { status: "idle" };
