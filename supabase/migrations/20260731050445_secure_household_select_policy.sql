drop policy if exists "Anyone can view household by invite code"
on public.households;

drop policy if exists "Household members can view own household"
on public.households;

create policy "Household members can view own household"
on public.households
for select
to authenticated
using (
  owner_id = auth.uid()
  or id = public.current_user_household_id()
);
