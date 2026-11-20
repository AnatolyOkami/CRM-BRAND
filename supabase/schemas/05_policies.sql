--
-- Row Level Security
-- This file declares RLS policies for all tables.
--
-- Access model: the working role (public.staff_roles) decides what a signed-in person sees.
-- Managers see unassigned deals and their own deals, the sales head sees every deal.
-- A person without a sales role (shop floor, delivery, nobody yet) sees no sales data at all.
-- Helper functions live in the private schema and wrap auth.uid() in a select for a single evaluation.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;
alter table public.user_invitations enable row level security;
alter table public.staff_roles enable row level security;
alter table public.business_settings enable row level security;
alter table public.deal_stage_history enable row level security;

-- Companies
create policy "Sales staff can read companies" on public.companies for select to authenticated using ((select private.is_sales_staff()));
create policy "Sales staff can insert companies" on public.companies for insert to authenticated with check ((select private.is_sales_staff()));
create policy "Sales staff can update companies" on public.companies for update to authenticated using ((select private.is_sales_staff())) with check ((select private.is_sales_staff()));
create policy "Sales head can delete companies" on public.companies for delete to authenticated using ((select private.is_sales_head()));

-- Contacts
create policy "Sales staff can read contacts" on public.contacts for select to authenticated using ((select private.is_sales_staff()));
create policy "Sales staff can insert contacts" on public.contacts for insert to authenticated with check ((select private.is_sales_staff()));
create policy "Sales staff can update contacts" on public.contacts for update to authenticated using ((select private.is_sales_staff())) with check ((select private.is_sales_staff()));
create policy "Sales head can delete contacts" on public.contacts for delete to authenticated using ((select private.is_sales_head()));

-- Contact Notes
create policy "Sales staff can read contact notes" on public.contact_notes for select to authenticated using ((select private.is_sales_staff()));
create policy "Sales staff can insert contact notes" on public.contact_notes for insert to authenticated with check ((select private.is_sales_staff()));
create policy "Sales staff can update contact notes" on public.contact_notes for update to authenticated using ((select private.is_sales_staff())) with check ((select private.is_sales_staff()));
create policy "Sales staff can delete contact notes" on public.contact_notes for delete to authenticated using ((select private.is_sales_staff()));

-- Deals: the sales head sees everything, a manager sees the shared queue and own deals
create policy "Deals are visible by role" on public.deals for select to authenticated using (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (sales_id is null or sales_id = (select private.current_sales_id())))
);
create policy "Deals can be updated by role" on public.deals for update to authenticated using (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (sales_id is null or sales_id = (select private.current_sales_id())))
) with check (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (sales_id is null or sales_id = (select private.current_sales_id())))
);
-- Inserts are limited by the deals_guard trigger to the import of past deals made by the sales head
create policy "Sales head can insert deals" on public.deals for insert to authenticated with check ((select private.is_sales_head()));
create policy "Sales head can delete deals" on public.deals for delete to authenticated using ((select private.is_sales_head()));

-- Deal Notes: follow the visibility of the deal
create policy "Deal notes follow deal visibility" on public.deal_notes for select to authenticated using (
    exists (select 1 from public.deals d where d.id = deal_notes.deal_id)
);
create policy "Deal notes can be added to visible deals" on public.deal_notes for insert to authenticated with check (
    (select private.is_sales_staff()) and exists (select 1 from public.deals d where d.id = deal_notes.deal_id)
);
create policy "Deal notes can be updated on visible deals" on public.deal_notes for update to authenticated using (
    (select private.is_sales_staff()) and exists (select 1 from public.deals d where d.id = deal_notes.deal_id)
) with check (
    (select private.is_sales_staff()) and exists (select 1 from public.deals d where d.id = deal_notes.deal_id)
);
create policy "Deal notes can be deleted on visible deals" on public.deal_notes for delete to authenticated using (
    (select private.is_sales_staff()) and exists (select 1 from public.deals d where d.id = deal_notes.deal_id)
);

-- Deal stage history: follows the visibility of the deal, written only by the deal commands
create policy "History follows deal visibility" on public.deal_stage_history for select to authenticated using (
    exists (select 1 from public.deals d where d.id = deal_stage_history.deal_id)
);

-- Sales (people): names are needed everywhere to show owners
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Working roles: everybody reads own roles, the sales head and administrators read all, writes only through set_staff_roles
create policy "Read own roles or all as head" on public.staff_roles for select to authenticated using (
    sales_id = (select private.current_sales_id()) or (select private.is_sales_head()) or (select public.is_admin())
);

-- Business calendar: everybody reads, only administrators write
create policy "Enable read for authenticated" on public.business_settings for select to authenticated using (true);
create policy "Enable update for admins" on public.business_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Enable insert for admins" on public.business_settings for insert to authenticated with check ((select public.is_admin()));

-- Tags
create policy "Sales staff can read tags" on public.tags for select to authenticated using ((select private.is_sales_staff()));
create policy "Sales staff can insert tags" on public.tags for insert to authenticated with check ((select private.is_sales_staff()));
create policy "Sales staff can update tags" on public.tags for update to authenticated using ((select private.is_sales_staff()));
create policy "Sales staff can delete tags" on public.tags for delete to authenticated using ((select private.is_sales_staff()));

-- Tasks: own and unowned tasks, tasks of visible deals, everything for the sales head
create policy "Tasks are visible by role" on public.tasks for select to authenticated using (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (
        sales_id is null
        or sales_id = (select private.current_sales_id())
        or (deal_id is not null and exists (select 1 from public.deals d where d.id = tasks.deal_id))
    ))
);
create policy "Sales staff can insert tasks" on public.tasks for insert to authenticated with check (
    (select private.is_sales_staff())
    and (deal_id is null or exists (select 1 from public.deals d where d.id = tasks.deal_id))
);
create policy "Tasks can be updated by role" on public.tasks for update to authenticated using (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (
        sales_id is null
        or sales_id = (select private.current_sales_id())
        or (deal_id is not null and exists (select 1 from public.deals d where d.id = tasks.deal_id))
    ))
) with check (
    (select private.is_sales_staff())
    and (deal_id is null or exists (select 1 from public.deals d where d.id = tasks.deal_id))
);
create policy "Tasks can be deleted by role" on public.tasks for delete to authenticated using (
    (select private.is_sales_head())
    or ((select private.has_role('manager')) and (
        sales_id is null
        or sales_id = (select private.current_sales_id())
        or (deal_id is not null and exists (select 1 from public.deals d where d.id = tasks.deal_id))
    ))
);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);
