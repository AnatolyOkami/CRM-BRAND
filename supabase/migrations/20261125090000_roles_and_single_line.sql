-- Roles of the technical task (owner, office head, manager, designer, one role per workshop, installer),
-- the card no longer moves to "sent to production" (a mark and the cards of the workshops replace it),
-- the designer reads the deals of the design stages.

-- Old roles become the new ones: sales head -> office head, workshop and production head -> the three
-- workshops, fulfillment -> installer, the administrator account -> owner.
alter table public.staff_roles drop constraint staff_roles_role_check;
insert into public.staff_roles (sales_id, role)
    select r.sales_id, n.role from public.staff_roles r
    join (values ('sales_head', 'office_head'), ('workshop', 'shop_typography'), ('workshop', 'shop_wide_format'), ('workshop', 'shop_signs'),
                 ('production_head', 'shop_typography'), ('production_head', 'shop_wide_format'), ('production_head', 'shop_signs'),
                 ('fulfillment', 'installer')) as n(old_role, role) on n.old_role = r.role
    on conflict do nothing;
delete from public.staff_roles where role in ('sales_head', 'workshop', 'production_head', 'fulfillment');
insert into public.staff_roles (sales_id, role)
    select s.id, 'owner' from public.sales s where s.administrator
    on conflict do nothing;
alter table public.staff_roles
    add constraint staff_roles_role_check check (role in ('owner', 'office_head', 'manager', 'designer', 'shop_typography', 'shop_wide_format', 'shop_signs', 'installer'));

alter table public.deal_stage_history drop constraint deal_stage_history_event_check;
alter table public.deal_stage_history
    add constraint deal_stage_history_event_check check (event in ('created', 'claimed', 'stage', 'assigned', 'released', 'call', 'source', 'handoff'));

alter table public.deals add column sent_to_production_at timestamp with time zone;

-- Deals that stood in "sent to production" stay on the approved stage with the mark
update public.deals d
    set sent_to_production_at = coalesce((select o.created_at from public.production_orders o where o.deal_id = d.id), d.updated_at),
        stage = 'approved'
    where d.stage = 'sent-to-production';

CREATE OR REPLACE FUNCTION "private"."has_role"("p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.staff_roles r
    join public.sales s on s.id = r.sales_id
    where s.user_id = (select auth.uid()) and not s.disabled and r.role in (p_role, 'owner')
  )
$$;

CREATE OR REPLACE FUNCTION "private"."is_sales_head"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('office_head')
$$;

CREATE OR REPLACE FUNCTION "private"."is_sales_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('manager') or private.has_role('office_head')
$$;

CREATE OR REPLACE FUNCTION "private"."is_production_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('shop_typography') or private.has_role('shop_wide_format') or private.has_role('shop_signs')
$$;

-- Deal id encoded as the first folder of an order file path, e.g. "12/3f2a-banner.pdf"

CREATE OR REPLACE FUNCTION "private"."is_designer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('designer')
$$;

CREATE OR REPLACE FUNCTION "private"."is_installer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('installer')
$$;

-- Moment of the first reply deadline: first_response_minutes of working time after p_received

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  delete from public.user_invitations where user_id = new.id;
  if sales_count > 0 and not found and not new.is_sso_user then
    raise exception 'Sign up is not allowed';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then FALSE else TRUE end
  );

  -- The very first account bootstraps the company: it becomes the owner, who holds every role.
  -- Everybody else has no business role until an administrator assigns one.
  if sales_count = 0 then
    insert into public.staff_roles (sales_id, role)
    select s.id, r.role
    from public.sales s, (values ('owner')) as r(role)
    where s.user_id = new.id;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_staff_roles"("p_sales_id" bigint, "p_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not (public.is_admin() or private.has_role('owner')) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.sales s where s.id = p_sales_id) then
    raise exception 'sales_not_found' using errcode = 'PT404';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) r
    where r not in ('owner', 'office_head', 'manager', 'designer', 'shop_typography', 'shop_wide_format', 'shop_signs', 'installer')
  ) then
    raise exception 'invalid_role' using errcode = 'PT422';
  end if;

  delete from public.staff_roles where sales_id = p_sales_id and role <> all (coalesce(p_roles, '{}'::text[]));
  insert into public.staff_roles (sales_id, role)
  select p_sales_id, r from unnest(coalesce(p_roles, '{}'::text[])) r
  on conflict do nothing;
end;
$$;

--
-- Production handoff, workshop board and notifications
--

CREATE OR REPLACE FUNCTION "public"."deals_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' then
    -- The version moves only when the business content changes, never on a reorder
    if (to_jsonb(new) - 'version' - 'index' - 'updated_at') is distinct from (to_jsonb(old) - 'version' - 'index' - 'updated_at') then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Plain inserts are reserved for the import of past deals made by the sales head
    if not (new.is_historical and private.is_sales_head()) then
      raise exception 'use_create_manual_deal' using errcode = 'PT403';
    end if;
    new.version := 1;
    return new;
  end if;

  if new.stage is distinct from old.stage
     or new.sales_id is distinct from old.sales_id
     or new.index is distinct from old.index
     or new.source is distinct from old.source
     or new.received_at is distinct from old.received_at
     or new.first_response_due_at is distinct from old.first_response_due_at
     or new.first_responded_at is distinct from old.first_responded_at
     or new.sent_to_production_at is distinct from old.sent_to_production_at
     or new.partner_id is distinct from old.partner_id
     or new.intake_key is distinct from old.intake_key
     or new.utm is distinct from old.utm
     or new.lost_reason is distinct from old.lost_reason
     or new.is_historical is distinct from old.is_historical then
    raise exception 'deal_system_fields_are_read_only' using errcode = 'PT403',
      hint = 'Use claim_deal, transition_deal or assign_deal';
  end if;

  return new;
end;
$$;

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

  -- The retired stages (sent-to-production, proposal-sent, delayed, to-contact, contacted, in-work, in-negociation, contract-signed) are never entered again
  if p_to_stage is null or p_to_stage not in ('opportunity', 'processing', 'order', 'design-task', 'design-in-progress', 'design-ready', 'approval', 'approved', 'won', 'lost') then
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

  -- The handoff to production has its own command and does not move the card.
  -- A deal is finished when the workshop has finished its order
  if p_to_stage = 'won' and v_deal.stage <> 'won' then
    select o.stage into v_order_stage from public.production_orders o where o.deal_id = p_deal_id;
    if v_order_stage is distinct from 'ready' then
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

CREATE OR REPLACE FUNCTION "public"."assign_deal"("p_deal_id" bigint, "p_expected_version" integer, "p_to_sales_id" bigint, "p_reason" "text" DEFAULT NULL::"text", "p_request_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_me bigint := private.current_sales_id();
  v_head boolean;
  v_deal public.deals%rowtype;
  v_res jsonb;
  v_task_id bigint;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  v_head := private.is_sales_head();

  v_res := private.command_replay(v_uid, p_request_key, 'assign_deal');
  if v_res is not null then
    return v_res;
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.archived_at is not null then
    raise exception 'deal_not_found' using errcode = 'PT404';
  end if;
  if p_expected_version is null or v_deal.version <> p_expected_version then
    raise exception 'deal_version_conflict' using errcode = 'PT409';
  end if;
  if v_deal.stage in ('won', 'lost') then
    raise exception 'deal_closed' using errcode = 'PT422';
  end if;

  if p_to_sales_id is null then
    -- return to the shared queue: the owner or the sales head, only before real work started
    if not v_head and v_deal.sales_id is distinct from v_me then
      raise exception 'not_your_deal' using errcode = 'PT403';
    end if;
    if v_deal.stage not in ('opportunity', 'processing', 'to-contact') then
      raise exception 'release_not_allowed_in_stage' using errcode = 'PT422';
    end if;
    delete from public.tasks t where t.deal_id = p_deal_id and t.type = 'first-contact' and t.done_date is null;
    update public.deals set sales_id = null, stage = 'opportunity', updated_at = now() where id = p_deal_id;
    perform private.log_deal_event(p_deal_id, 'released', v_deal.stage, 'opportunity', v_deal.sales_id, null, v_me, v_reason);
  else
    if not v_head then
      raise exception 'forbidden' using errcode = 'PT403';
    end if;
    if not exists (
      select 1 from public.sales s join public.staff_roles r on r.sales_id = s.id
      where s.id = p_to_sales_id and not s.disabled and r.role in ('manager', 'office_head', 'owner')
    ) then
      raise exception 'invalid_assignee' using errcode = 'PT422';
    end if;
    if v_deal.stage = 'opportunity' then
      v_task_id := private.apply_claim(p_deal_id, p_to_sales_id, v_me, 'assigned');
    else
      update public.deals set sales_id = p_to_sales_id, updated_at = now() where id = p_deal_id;
      update public.tasks t set sales_id = p_to_sales_id
        where t.deal_id = p_deal_id and t.type = 'first-contact' and t.done_date is null;
      perform private.log_deal_event(p_deal_id, 'assigned', v_deal.stage, v_deal.stage, v_deal.sales_id, p_to_sales_id, v_me, v_reason);
    end if;
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  return private.command_store(v_uid, p_request_key, 'assign_deal', p_deal_id, jsonb_build_object(
    'deal_id', v_deal.id, 'version', v_deal.version, 'stage', v_deal.stage, 'sales_id', v_deal.sales_id,
    'task_id', v_task_id, 'replayed', false));
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
  if v_deal.stage not in ('order', 'design-task', 'design-in-progress', 'design-ready', 'approval', 'approved', 'contract-signed') then
    raise exception 'order_stage_required' using errcode = 'PT422',
      hint = 'Move the deal to "order" before the handoff';
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

  -- The card stays where it is: it only gets the mark "sent to production"
  update public.deals set sent_to_production_at = now(), updated_at = now() where id = p_deal_id;
  perform private.log_deal_event(p_deal_id, 'handoff', v_deal.stage, v_deal.stage, v_deal.sales_id, v_deal.sales_id, v_me, v_name);

  select * into v_deal from public.deals where id = p_deal_id;
  return private.command_store(v_uid, p_request_key, 'handoff_deal_to_production', p_deal_id, jsonb_build_object(
    'order_id', v_order.id, 'deal_id', p_deal_id, 'version', v_deal.version, 'stage', v_deal.stage,
    'order_stage', v_order.stage, 'replayed', false));
end;
$$;

drop policy "Deals are visible by role" on public.deals;
create policy "Deals are visible by role" on public.deals for select to authenticated using (
    (select private.is_sales_staff())
    or ((select private.is_designer()) and stage in ('design-task', 'design-in-progress', 'design-ready', 'approval', 'approved'))
);

revoke all on function private.is_designer() from public, anon;
revoke all on function private.is_installer() from public, anon;
grant execute on function private.is_designer() to authenticated, service_role;
grant execute on function private.is_installer() to authenticated, service_role;
