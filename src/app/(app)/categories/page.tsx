import { CategoriesManager, type CategoryView } from "@/components/categories/categories-manager";
import { getCurrentMembership } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function CategoriesPage() {
  const membership = await getCurrentMembership();
  const householdId = membership?.profile?.household_id;
  if (!householdId) return null;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, color, icon, sort_order")
    .eq("household_id", householdId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  const categories: CategoryView[] = data.flatMap((category) => {
    if (category.type !== "income" && category.type !== "expense") return [];
    return [
      {
        id: category.id,
        name: category.name,
        type: category.type,
        color: category.color ?? (category.type === "income" ? "#0F8B6F" : "#C2410C"),
        icon: category.icon ?? "other",
        sortOrder: category.sort_order ?? 0,
      },
    ];
  });

  return <CategoriesManager categories={categories} />;
}
