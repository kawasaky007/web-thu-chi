import type { CategoryField } from "@/lib/categories/validation";

export type CategoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<CategoryField, string>>;
};

export const initialCategoryActionState: CategoryActionState = { status: "idle" };
