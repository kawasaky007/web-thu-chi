-- Transactions are shared within a household, but only the member who owns a
-- transaction can delete it. Keep the selected member constrained to the same
-- household for both direct clients and the web Server Actions.

drop policy if exists "Users can delete own transactions"
on public.transactions;

drop policy if exists "Users can insert transactions"
on public.transactions;

drop policy if exists "Users can update transactions"
on public.transactions;

drop policy if exists "Users can view transactions in same household"
on public.transactions;

create policy "Household members can view transactions"
on public.transactions
for select
to authenticated
using (household_id = public.current_user_household_id());

create policy "Household members can insert transactions"
on public.transactions
for insert
to authenticated
with check (
  household_id = public.current_user_household_id()
  and exists (
    select 1
    from public.profiles as transaction_member
    where transaction_member.id = transactions.user_id
      and transaction_member.household_id = public.current_user_household_id()
  )
);

create policy "Household members can update transactions"
on public.transactions
for update
to authenticated
using (household_id = public.current_user_household_id())
with check (
  household_id = public.current_user_household_id()
  and exists (
    select 1
    from public.profiles as transaction_member
    where transaction_member.id = transactions.user_id
      and transaction_member.household_id = public.current_user_household_id()
  )
);

create policy "Transaction owners can delete transactions"
on public.transactions
for delete
to authenticated
using (
  household_id = public.current_user_household_id()
  and user_id = auth.uid()
);

create index if not exists transactions_household_date_created_idx
on public.transactions (household_id, transaction_date desc, created_at desc, id desc);
