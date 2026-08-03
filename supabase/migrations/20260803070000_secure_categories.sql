-- Categories are household-owned data. Keep both the database constraint and
-- RLS aligned so every client sees the same duplicate-name rules.

drop policy if exists "Allow all authenticated users to insert categories"
on public.categories;

drop policy if exists "Allow all authenticated users to select categories"
on public.categories;

drop policy if exists "Users can delete own household categories"
on public.categories;

drop policy if exists "Users can update own household categories"
on public.categories;

drop policy if exists "Household members can select categories"
on public.categories;

drop policy if exists "Household members can insert categories"
on public.categories;

drop policy if exists "Household members can update categories"
on public.categories;

drop policy if exists "Household members can delete categories"
on public.categories;

create policy "Household members can select categories"
on public.categories
for select
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can insert categories"
on public.categories
for insert
to authenticated
with check (household_id = public.current_user_household_id());

create policy "Household members can update categories"
on public.categories
for update
to authenticated
using (household_id = public.current_user_household_id())
with check (household_id = public.current_user_household_id());

create policy "Household members can delete categories"
on public.categories
for delete
to authenticated
using (household_id = public.current_user_household_id());

create unique index if not exists categories_household_type_name_unique_idx
on public.categories (
  household_id,
  type,
  lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
);
