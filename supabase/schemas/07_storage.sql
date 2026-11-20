--
-- Storage
-- This file declares storage bucket policies.
--

create policy "Attachments 1mt4rzk_0" on storage.objects for select to authenticated using (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_1" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_3" on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- Order files live in a private bucket: no public URL, every read passes these policies.
-- The first folder of a path is the deal id.
insert into storage.buckets (id, name, public)
values ('order-files', 'order-files', false)
on conflict (id) do nothing;

create policy "Order files can be read by the people who work on the order" on storage.objects for select to authenticated using (
    bucket_id = 'order-files'
    and (
        ((select private.is_sales_staff()) and exists (select 1 from public.deals d where d.id = private.order_file_deal_id(storage.objects.name)))
        or ((select private.is_production_staff()) and exists (select 1 from public.production_orders o where o.deal_id = private.order_file_deal_id(storage.objects.name)))
    )
);
create policy "Order files can be uploaded for visible deals" on storage.objects for insert to authenticated with check (
    bucket_id = 'order-files'
    and (select private.is_sales_staff())
    and exists (select 1 from public.deals d where d.id = private.order_file_deal_id(storage.objects.name))
);
