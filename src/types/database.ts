import type {
  Database as GeneratedDatabase,
  Json as GeneratedJson,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.generated";

export type Database = GeneratedDatabase;
export type Json = GeneratedJson;

export type Budget = Tables<"budgets">;
export type Category = Tables<"categories">;
export type Household = Tables<"households">;
export type Profile = Tables<"profiles">;
export type RecurringOccurrence = Tables<"recurring_occurrences">;
export type RecurringRule = Tables<"recurring_rules">;
export type SavingsGoal = Tables<"savings_goals">;
export type SavingsGoalEntry = Tables<"savings_goal_entries">;
export type Transaction = Tables<"transactions">;

export type BudgetInsert = TablesInsert<"budgets">;
export type CategoryInsert = TablesInsert<"categories">;
export type HouseholdInsert = TablesInsert<"households">;
export type ProfileInsert = TablesInsert<"profiles">;
export type RecurringOccurrenceInsert = TablesInsert<"recurring_occurrences">;
export type RecurringRuleInsert = TablesInsert<"recurring_rules">;
export type SavingsGoalInsert = TablesInsert<"savings_goals">;
export type SavingsGoalEntryInsert = TablesInsert<"savings_goal_entries">;
export type TransactionInsert = TablesInsert<"transactions">;

export type BudgetUpdate = TablesUpdate<"budgets">;
export type CategoryUpdate = TablesUpdate<"categories">;
export type HouseholdUpdate = TablesUpdate<"households">;
export type ProfileUpdate = TablesUpdate<"profiles">;
export type RecurringOccurrenceUpdate = TablesUpdate<"recurring_occurrences">;
export type RecurringRuleUpdate = TablesUpdate<"recurring_rules">;
export type SavingsGoalUpdate = TablesUpdate<"savings_goals">;
export type SavingsGoalEntryUpdate = TablesUpdate<"savings_goal_entries">;
export type TransactionUpdate = TablesUpdate<"transactions">;
