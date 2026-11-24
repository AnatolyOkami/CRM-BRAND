-- Statuses of the deal exactly as the technical task lists them: new, processing, order, the design
-- stages, approval, approved, sent to production, order finished, refusal. "Proposal sent" and "Postponed"
-- are not in the task: the deals that stand there move to processing, the history keeps what happened.

alter table public.deals drop constraint deals_stage_check;
alter table public.deals
    add constraint deals_stage_check check (stage in ('opportunity', 'processing', 'order', 'design-task', 'design-in-progress', 'design-ready', 'approval', 'approved', 'sent-to-production', 'won', 'lost', 'proposal-sent', 'delayed', 'to-contact', 'contacted', 'in-work', 'in-negociation', 'contract-signed'));

create temporary table moved_deals on commit drop as
    select id, stage as old_stage, sales_id from public.deals where stage in ('proposal-sent', 'delayed');
insert into public.deal_stage_history (deal_id, event, from_stage, to_stage, from_sales_id, to_sales_id, reason)
    select id, 'stage', old_stage, 'processing', sales_id, sales_id, 'Перенос на новую воронку' from moved_deals;
update public.deals set stage = 'processing', updated_at = now() where id in (select id from moved_deals);
update public.deals d set index = r.rn - 1
    from (select id, row_number() over (order by index nulls last, id) as rn
          from public.deals where stage = 'processing' and archived_at is null) r
    where d.id = r.id;

CREATE OR REPLACE FUNCTION "public"."transition_deal"("p_deal_id" bigint, "p_expected_version" integer, "p_to_stage" "text", "p_before_deal_id" bigint DEFAULT NULL::bigint, "p_reason" "text" DEFAULT NULL::"text", "p_request_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_me bigint := private.current_sales_id();
  v_head boolean;
  v_deal public.deals%rowtype;
  v_res jsonb;
  v_ids bigint[];
  v_new_ids bigint[];
  v_pos integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_order_stage text;
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  v_head := private.is_sales_head();

  -- The retired stages (proposal-sent, delayed, to-contact, contacted, in-work, in-negociation, contract-signed) are never entered again
  if p_to_stage is null or p_to_stage not in ('opportunity', 'processing', 'order', 'design-task', 'design-in-progress', 'design-ready', 'approval', 'approved', 'sent-to-production', 'won', 'lost') then
    raise exception 'invalid_stage' using errcode = 'PT422';
  end if;

  v_res := private.command_replay(v_uid, p_request_key, 'transition_deal');
  if v_res is not null then
    return v_res;
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.archived_at is not null then
    raise exception 'deal_not_found' using errcode = 'PT404';
  end if;
  -- Every manager works with the deals of colleagues: moving a deal never changes its owner
  if p_expected_version is null or v_deal.version <> p_expected_version then
    raise exception 'deal_version_conflict' using errcode = 'PT409';
  end if;

  -- The handoff has its own command: it creates the order, keeps the materials and moves the deal
  if p_to_stage = 'sent-to-production' and v_deal.stage <> 'sent-to-production' then
    raise exception 'handoff_required' using errcode = 'PT422',
      hint = 'A deal is sent to production only through handoff_deal_to_production';
  end if;
  if v_deal.stage = 'sent-to-production' and p_to_stage not in ('sent-to-production', 'won') then
    raise exception 'in_production_locked' using errcode = 'PT422';
  end if;
  -- A deal is won when the workshop has finished its order
  if p_to_stage = 'won' and v_deal.stage <> 'won' then
    select o.stage into v_order_stage from public.production_orders o where o.deal_id = p_deal_id;
    if v_deal.stage <> 'sent-to-production' or v_order_stage is distinct from 'ready' then
      raise exception 'won_requires_ready_order' using errcode = 'PT422',
        hint = 'A deal becomes won after its production order is ready';
    end if;
  end if;
  if v_deal.stage = 'won' and p_to_stage <> 'won' then
    raise exception 'won_is_final' using errcode = 'PT422';
  end if;
  if v_deal.stage = 'lost' and p_to_stage <> 'lost' and not v_head then
    raise exception 'only_head_reopens_lost' using errcode = 'PT403';
  end if;
  if p_to_stage = 'lost' and v_deal.stage <> 'lost' and v_reason is null then
    raise exception 'reason_required' using errcode = 'PT422';
  end if;
  if v_deal.sales_id is null and p_to_stage <> 'opportunity' then
    raise exception 'claim_required' using errcode = 'PT422', hint = 'Take the deal with claim_deal first';
  end if;
  if v_deal.sales_id is not null and p_to_stage = 'opportunity' then
    raise exception 'use_release' using errcode = 'PT422', hint = 'Return the deal to the queue with assign_deal';
  end if;

  -- one move at a time per column keeps the order consistent
  perform pg_advisory_xact_lock(hashtextextended('deal_stage:' || p_to_stage, 0));

  update public.deals
    set stage = p_to_stage,
        updated_at = now(),
        lost_reason = case
          when p_to_stage = 'lost' and v_deal.stage <> 'lost' then v_reason
          when v_deal.stage = 'lost' and p_to_stage <> 'lost' then null
          else lost_reason end
    where id = p_deal_id;

  select coalesce(array_agg(d.id order by d.index nulls last, d.id), '{}'::bigint[]) into v_ids
  from public.deals d
  where d.stage = p_to_stage and d.archived_at is null and d.id <> p_deal_id;

  v_pos := case when p_before_deal_id is null then null else array_position(v_ids, p_before_deal_id) end;
  if v_pos is null then
    v_new_ids := v_ids || p_deal_id;
  else
    v_new_ids := v_ids[1:v_pos - 1] || p_deal_id || v_ids[v_pos:array_length(v_ids, 1)];
  end if;

  update public.deals d
    set index = o.ord - 1
    from unnest(v_new_ids) with ordinality as o(id, ord)
    where d.id = o.id and d.index is distinct from (o.ord - 1)::smallint;

  if v_deal.stage <> p_to_stage then
    perform private.log_deal_event(p_deal_id, 'stage', v_deal.stage, p_to_stage, v_deal.sales_id, v_deal.sales_id, v_me, v_reason);
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  return private.command_store(v_uid, p_request_key, 'transition_deal', p_deal_id, jsonb_build_object(
    'deal_id', v_deal.id, 'version', v_deal.version, 'stage', v_deal.stage, 'index', v_deal.index,
    'sales_id', v_deal.sales_id, 'replayed', false));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handoff_deal_to_production"("p_deal_id" bigint, "p_expected_version" integer, "p_product_name" "text", "p_instructions" "text" DEFAULT NULL::"text", "p_due_date" "date" DEFAULT NULL::"date", "p_files" "jsonb" DEFAULT '[]'::"jsonb", "p_links" "jsonb" DEFAULT '[]'::"jsonb", "p_request_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_me bigint := private.current_sales_id();
  v_deal public.deals%rowtype;
  v_order public.production_orders%rowtype;
  v_res jsonb;
  v_name text := nullif(btrim(coalesce(p_product_name, '')), '');
  v_instructions text := nullif(btrim(coalesce(p_instructions, '')), '');
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_links jsonb := coalesce(p_links, '[]'::jsonb);
  v_item jsonb;
  v_url text;
  v_path text;
  v_customer text;
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  v_res := private.command_replay(v_uid, p_request_key, 'handoff_deal_to_production');
  if v_res is not null then
    return v_res;
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.archived_at is not null then
    raise exception 'deal_not_found' using errcode = 'PT404';
  end if;

  -- A second request, or a second window, gets the same order
  select * into v_order from public.production_orders o where o.deal_id = p_deal_id;
  if found then
    return private.command_store(v_uid, p_request_key, 'handoff_deal_to_production', p_deal_id, jsonb_build_object(
      'order_id', v_order.id, 'deal_id', p_deal_id, 'version', v_deal.version, 'stage', v_deal.stage,
      'order_stage', v_order.stage, 'replayed', true));
  end if;

  if p_expected_version is null or v_deal.version <> p_expected_version then
    raise exception 'deal_version_conflict' using errcode = 'PT409';
  end if;
  if v_deal.stage not in ('order', 'approval', 'approved', 'contract-signed') then
    raise exception 'order_stage_required' using errcode = 'PT422',
      hint = 'Move the deal to "order", "approval" or "approved" before the handoff';
  end if;
  if v_name is null then
    raise exception 'product_name_required' using errcode = 'PT422';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_typeof(v_links) <> 'array'
     or jsonb_array_length(v_files) > 30 or jsonb_array_length(v_links) > 30 then
    raise exception 'invalid_materials' using errcode = 'PT422';
  end if;

  for v_item in select * from jsonb_array_elements(v_links) loop
    v_url := btrim(coalesce(v_item ->> 'url', ''));
    if v_url !~ '^https?://[^[:space:]]+$' then
      raise exception 'invalid_link' using errcode = 'PT422';
    end if;
  end loop;
  for v_item in select * from jsonb_array_elements(v_files) loop
    v_path := coalesce(v_item ->> 'path', '');
    if private.order_file_deal_id(v_path) is distinct from p_deal_id
       or not exists (select 1 from storage.objects so where so.bucket_id = 'order-files' and so.name = v_path) then
      raise exception 'invalid_file' using errcode = 'PT422';
    end if;
  end loop;

  select coalesce(nullif(btrim(co.name), ''), nullif(btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), '')
    into v_customer
  from (select 1) x
    left join public.companies co on co.id = v_deal.company_id
    left join public.contacts c on c.id = v_deal.contact_ids[1];

  insert into public.production_orders (deal_id, product_name, instructions, due_date, customer_name, files_count, links_count, handed_off_by)
  values (p_deal_id, v_name, v_instructions, p_due_date, coalesce(v_customer, ''),
          jsonb_array_length(v_files), jsonb_array_length(v_links), v_me)
  returning * into v_order;

  insert into public.production_order_materials (order_id, kind, file_path, file_name, file_size, mime_type)
  select v_order.id, 'file', f ->> 'path', coalesce(nullif(btrim(f ->> 'name'), ''), f ->> 'path'),
         nullif(f ->> 'size', '')::bigint, nullif(f ->> 'type', '')
  from jsonb_array_elements(v_files) f;
  insert into public.production_order_materials (order_id, kind, url, label)
  select v_order.id, 'link', btrim(l ->> 'url'), nullif(btrim(coalesce(l ->> 'label', '')), '')
  from jsonb_array_elements(v_links) l;

  insert into public.order_stage_history (order_id, event, to_stage, changed_by)
  values (v_order.id, 'created', 'accepted', v_me);

  update public.deals
    set stage = 'sent-to-production',
        updated_at = now(),
        index = (select coalesce(max(d.index), -1) + 1 from public.deals d where d.stage = 'sent-to-production' and d.archived_at is null)
    where id = p_deal_id;
  perform private.log_deal_event(p_deal_id, 'stage', v_deal.stage, 'sent-to-production', v_deal.sales_id, v_deal.sales_id, v_me, null);

  select * into v_deal from public.deals where id = p_deal_id;
  return private.command_store(v_uid, p_request_key, 'handoff_deal_to_production', p_deal_id, jsonb_build_object(
    'order_id', v_order.id, 'deal_id', p_deal_id, 'version', v_deal.version, 'stage', v_deal.stage,
    'order_stage', v_order.stage, 'replayed', false));
end;
$$;
