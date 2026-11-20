--
-- Functions
-- This file declares all PL/pgSQL functions in the public schema.
--

CREATE OR REPLACE FUNCTION "public"."cleanup_note_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    DECLARE
      payload jsonb;
      request_headers jsonb;
      auth_header text;
    BEGIN
      request_headers := coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb,
        '{}'::jsonb
      );
      auth_header := request_headers ->> 'authorization';

      IF auth_header IS NULL OR auth_header = '' THEN
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;

        RETURN NEW;
      END IF;

      payload := jsonb_build_object(
        'old_record', OLD,
        'record', NEW,
        'type', TG_OP
      );

      PERFORM net.http_post(
        url := public.get_note_attachments_function_url(),
        body := payload,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          auth_header
        ),
        timeout_milliseconds := 10000
      );

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      RETURN NEW;
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_avatar_for_email"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare email_hash text;
declare gravatar_url text;
declare gravatar_status int8;
declare email_domain text;
declare favicon_url text;
declare domain_status int8;

begin
    -- Try to fetch a gravatar image
    email_hash = encode(extensions.digest(email, 'sha256'), 'hex');
    gravatar_url = concat('https://www.gravatar.com/avatar/', email_hash, '?d=404');

    select status from extensions.http_get(gravatar_url) into gravatar_status;

    if gravatar_status = 200 then
        return gravatar_url;
    end if;

    -- Fallback to email's domain favicon if not excluded
    email_domain = split_part(email, '@', 2);
    return get_domain_favicon(email_domain);
exception
    when others then
        return 'ERROR';
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_domain_favicon"("domain_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare domain_status int8;
declare domain_host text;
declare favicon_url text;

begin
    if exists (select from favicons_excluded_domains as fav where fav.domain = domain_name) then
        return null;
    end if;

    domain_host = (regexp_matches(domain_name, '^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)', 'i'))[1];
    if domain_host is null then
        return null;
    end if;

    -- Try the favicon.ico of the domain first
    favicon_url = concat('https://', domain_host, '/favicon.ico');
    begin
        perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '5000');
        select status from extensions.http_get(favicon_url) into domain_status;

        if domain_status = 200 then
            return favicon_url;
        end if;
    exception
        when others then
            null;
    end;

    -- Fallback to favicon.show
    return concat('https://favicon.show/', domain_host);
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_note_attachments_function_url"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
    DECLARE
      issuer text;
      function_url text;
    BEGIN
      issuer := coalesce(
        nullif(current_setting('request.jwt.claim.iss', true), ''),
        (
          coalesce(
            nullif(current_setting('request.jwt.claims', true), ''),
            '{}'
          )::jsonb ->> 'iss'
        )
      );
      issuer := nullif(issuer, '');
      IF issuer IS NOT NULL THEN
        issuer := rtrim(issuer, '/');
        IF right(issuer, 8) = '/auth/v1' THEN
          function_url :=
            left(issuer, length(issuer) - 8) || '/functions/v1/delete_note_attachments';

          IF function_url LIKE 'http://127.0.0.1:%' THEN
            RETURN replace(
              function_url,
              'http://127.0.0.1:',
              'http://host.docker.internal:'
            );
          END IF;

          IF function_url LIKE 'http://localhost:%' THEN
            RETURN replace(
              function_url,
              'http://localhost:',
              'http://host.docker.internal:'
            );
          END IF;

          RETURN function_url;
        END IF;
      END IF;

      RETURN 'http://host.docker.internal:54321/functions/v1/delete_note_attachments';
    END;
    $$;

CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS TABLE("id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  RETURN QUERY SELECT au.id FROM auth.users au WHERE au.email = $1;
END;
$_$;

CREATE OR REPLACE FUNCTION "public"."handle_company_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare company_logo text;

begin
    if new.logo is not null then
        return new;
    end if;

    company_logo = get_domain_favicon(new.website);
    if company_logo is null then
        return new;
    end if;

    new.logo = concat('{"src":"', company_logo, '","title":"Company favicon"}');
    return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_note_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set last_seen = new.date where contacts.id = new.contact_id and contacts.last_seen < new.date;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_contact_saved"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$declare contact_avatar text;
declare emails_length int8;
declare item jsonb;

begin
    if new.avatar is not null then
        return new;
    end if;

    if tg_op = 'UPDATE' and new.email_jsonb is not distinct from old.email_jsonb then
        return new;
    end if;

    select coalesce(jsonb_array_length(new.email_jsonb), 0) into emails_length;

    if emails_length = 0 then
        return new;
    end if;

    for item in select jsonb_array_elements(new.email_jsonb)
    loop
        select public.get_avatar_for_email(item->>'email') into contact_avatar;
        if (contact_avatar is not null) then
            exit;
        end if;
    end loop;

    if contact_avatar is null then
        return new;
    end if;

    new.avatar = concat('{"src":"', contact_avatar, '"}');
    return new;
end;$$;

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

  -- The very first account bootstraps the company: it gets the sales roles.
  -- Everybody else has no business role until an administrator assigns one.
  if sales_count = 0 then
    insert into public.staff_roles (sales_id, role)
    select s.id, r.role
    from public.sales s, (values ('manager'), ('sales_head')) as r(role)
    where s.user_id = new.id;
  end if;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_tag_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.contacts set tags = array_remove(tags, old.id) where tags @> array[old.id];
  return old;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_update_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  update public.sales
  set
    first_name = coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    last_name = coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    email = new.email
  where user_id = new.id;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;

CREATE OR REPLACE FUNCTION "public"."merge_contacts"("loser_id" bigint, "winner_id" bigint) RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  winner_contact contacts%ROWTYPE;
  loser_contact contacts%ROWTYPE;
  deal_record RECORD;
  merged_emails jsonb;
  merged_phones jsonb;
  merged_tags bigint[];
  winner_emails jsonb;
  loser_emails jsonb;
  winner_phones jsonb;
  loser_phones jsonb;
  email_map jsonb;
  phone_map jsonb;
BEGIN
  -- Fetch both contacts
  SELECT * INTO winner_contact FROM contacts WHERE id = winner_id;
  SELECT * INTO loser_contact FROM contacts WHERE id = loser_id;

  IF winner_contact IS NULL OR loser_contact IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;

  -- 1. Reassign tasks from loser to winner
  UPDATE tasks SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 2. Reassign contact notes from loser to winner
  UPDATE contact_notes SET contact_id = winner_id WHERE contact_id = loser_id;

  -- 3. Update deals - replace loser with winner in contact_ids array
  FOR deal_record IN
    SELECT id, contact_ids
    FROM deals
    WHERE contact_ids @> ARRAY[loser_id]
  LOOP
    UPDATE deals
    SET contact_ids = (
      SELECT ARRAY(
        SELECT DISTINCT unnest(
          array_remove(deal_record.contact_ids, loser_id) || ARRAY[winner_id]
        )
      )
    )
    WHERE id = deal_record.id;
  END LOOP;

  -- 4. Merge contact data

  -- Get email arrays
  winner_emails := COALESCE(winner_contact.email_jsonb, '[]'::jsonb);
  loser_emails := COALESCE(loser_contact.email_jsonb, '[]'::jsonb);

  -- Merge emails with deduplication by email address
  -- Build a map of email -> email object, then convert back to array
  email_map := '{}'::jsonb;

  -- Add winner emails to map
  IF jsonb_array_length(winner_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_emails)-1 LOOP
      email_map := email_map || jsonb_build_object(
        winner_emails->i->>'email',
        winner_emails->i
      );
    END LOOP;
  END IF;

  -- Add loser emails to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_emails) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_emails)-1 LOOP
      IF NOT email_map ? (loser_emails->i->>'email') THEN
        email_map := email_map || jsonb_build_object(
          loser_emails->i->>'email',
          loser_emails->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_emails := (SELECT jsonb_agg(value) FROM jsonb_each(email_map));
  merged_emails := COALESCE(merged_emails, '[]'::jsonb);

  -- Get phone arrays
  winner_phones := COALESCE(winner_contact.phone_jsonb, '[]'::jsonb);
  loser_phones := COALESCE(loser_contact.phone_jsonb, '[]'::jsonb);

  -- Merge phones with deduplication by number
  phone_map := '{}'::jsonb;

  -- Add winner phones to map
  IF jsonb_array_length(winner_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(winner_phones)-1 LOOP
      phone_map := phone_map || jsonb_build_object(
        winner_phones->i->>'number',
        winner_phones->i
      );
    END LOOP;
  END IF;

  -- Add loser phones to map (won't overwrite existing keys)
  IF jsonb_array_length(loser_phones) > 0 THEN
    FOR i IN 0..jsonb_array_length(loser_phones)-1 LOOP
      IF NOT phone_map ? (loser_phones->i->>'number') THEN
        phone_map := phone_map || jsonb_build_object(
          loser_phones->i->>'number',
          loser_phones->i
        );
      END IF;
    END LOOP;
  END IF;

  -- Convert map back to array
  merged_phones := (SELECT jsonb_agg(value) FROM jsonb_each(phone_map));
  merged_phones := COALESCE(merged_phones, '[]'::jsonb);

  -- Merge tags (remove duplicates)
  merged_tags := ARRAY(
    SELECT DISTINCT unnest(
      COALESCE(winner_contact.tags, ARRAY[]::bigint[]) ||
      COALESCE(loser_contact.tags, ARRAY[]::bigint[])
    )
  );

  -- 5. Update winner with merged data
  UPDATE contacts SET
    avatar = COALESCE(winner_contact.avatar, loser_contact.avatar),
    gender = COALESCE(winner_contact.gender, loser_contact.gender),
    first_name = COALESCE(winner_contact.first_name, loser_contact.first_name),
    last_name = COALESCE(winner_contact.last_name, loser_contact.last_name),
    title = COALESCE(winner_contact.title, loser_contact.title),
    company_id = COALESCE(winner_contact.company_id, loser_contact.company_id),
    email_jsonb = merged_emails,
    phone_jsonb = merged_phones,
    linkedin_url = COALESCE(winner_contact.linkedin_url, loser_contact.linkedin_url),
    background = COALESCE(winner_contact.background, loser_contact.background),
    has_newsletter = COALESCE(winner_contact.has_newsletter, loser_contact.has_newsletter),
    first_seen = LEAST(COALESCE(winner_contact.first_seen, loser_contact.first_seen), COALESCE(loser_contact.first_seen, winner_contact.first_seen)),
    last_seen = GREATEST(COALESCE(winner_contact.last_seen, loser_contact.last_seen), COALESCE(loser_contact.last_seen, winner_contact.last_seen)),
    sales_id = COALESCE(winner_contact.sales_id, loser_contact.sales_id),
    tags = merged_tags
  WHERE id = winner_id;

  -- 6. Delete loser contact
  DELETE FROM contacts WHERE id = loser_id;

  RETURN winner_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."lowercase_email_jsonb"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.email_jsonb IS NOT NULL THEN
    NEW.email_jsonb = COALESCE((
      SELECT jsonb_agg(
        jsonb_set(elem, '{email}', to_jsonb(LOWER(elem->>'email')))
      )
      FROM jsonb_array_elements(NEW.email_jsonb) AS elem
    ), '[]'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_sales_id_default"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- The deal commands set crm.keep_unassigned to create a deal without owner
  IF NEW.sales_id IS NULL AND coalesce(current_setting('crm.keep_unassigned', true), '') <> 'on' THEN
    SELECT id INTO NEW.sales_id FROM sales WHERE user_id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

--
-- Roles and deal commands (sales workflow)
--
-- Error contract of the commands: SQLSTATE PT<http status> (PostgREST turns it into that HTTP status)
-- and a machine readable message such as deal_already_assigned, deal_version_conflict, claim_required.
--

CREATE OR REPLACE FUNCTION "private"."current_sales_id"() RETURNS bigint
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select s.id from public.sales s where s.user_id = (select auth.uid()) and not s.disabled
$$;

CREATE OR REPLACE FUNCTION "private"."has_role"("p_role" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.staff_roles r
    join public.sales s on s.id = r.sales_id
    where s.user_id = (select auth.uid()) and not s.disabled and r.role = p_role
  )
$$;

CREATE OR REPLACE FUNCTION "private"."is_sales_head"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('sales_head')
$$;

CREATE OR REPLACE FUNCTION "private"."is_sales_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select private.has_role('manager') or private.has_role('sales_head')
$$;

-- Moment of the first reply deadline: first_response_minutes of working time after p_received
CREATE OR REPLACE FUNCTION "private"."compute_first_response_due"("p_received" timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_tz text := 'Europe/Moscow';
  v_days smallint[] := '{1,2,3,4,5}';
  v_start time := '09:00';
  v_end time := '18:00';
  v_minutes integer := 30;
  v_local timestamp;
  v_remaining interval;
  v_day_start timestamp;
  v_day_end timestamp;
  v_available interval;
  i integer := 0;
begin
  select b.timezone, b.work_days, b.work_start, b.work_end, b.first_response_minutes
    into v_tz, v_days, v_start, v_end, v_minutes
  from public.business_settings b
  where b.id = 1;
  if not found then
    v_tz := 'Europe/Moscow'; v_days := '{1,2,3,4,5}'; v_start := '09:00'; v_end := '18:00'; v_minutes := 30;
  end if;

  v_local := p_received at time zone v_tz;
  v_remaining := make_interval(mins => v_minutes);

  while i < 60 loop
    if extract(isodow from v_local)::smallint = any (v_days) then
      v_day_start := date_trunc('day', v_local) + v_start;
      v_day_end := date_trunc('day', v_local) + v_end;
      if v_local < v_day_start then
        v_local := v_day_start;
      end if;
      if v_local < v_day_end then
        v_available := v_day_end - v_local;
        if v_remaining <= v_available then
          return (v_local + v_remaining) at time zone v_tz;
        end if;
        v_remaining := v_remaining - v_available;
      end if;
    end if;
    v_local := date_trunc('day', v_local) + interval '1 day';
    i := i + 1;
  end loop;

  return p_received + make_interval(mins => v_minutes);
end;
$$;

-- Serializes identical request keys of one user, then returns the stored result of a finished command
CREATE OR REPLACE FUNCTION "private"."command_replay"("p_user" "uuid", "p_key" "text", "p_command" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_row private.deal_commands%rowtype;
begin
  if p_key is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_key, 0));
  select * into v_row from private.deal_commands c where c.user_id = p_user and c.request_key = p_key;
  if not found then
    return null;
  end if;
  if v_row.command <> p_command then
    raise exception 'request_key_reused' using errcode = 'PT409';
  end if;
  return v_row.result || jsonb_build_object('replayed', true);
end;
$$;

CREATE OR REPLACE FUNCTION "private"."command_store"("p_user" "uuid", "p_key" "text", "p_command" "text", "p_deal_id" bigint, "p_result" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if p_key is not null then
    insert into private.deal_commands (user_id, request_key, command, deal_id, result)
    values (p_user, p_key, p_command, p_deal_id, p_result)
    on conflict do nothing;
  end if;
  return p_result;
end;
$$;

CREATE OR REPLACE FUNCTION "private"."log_deal_event"("p_deal_id" bigint, "p_event" "text", "p_from_stage" "text", "p_to_stage" "text", "p_from_sales_id" bigint, "p_to_sales_id" bigint, "p_actor" bigint, "p_reason" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into public.deal_stage_history (deal_id, event, from_stage, to_stage, from_sales_id, to_sales_id, changed_by, reason)
  values (p_deal_id, p_event, p_from_stage, p_to_stage, p_from_sales_id, p_to_sales_id, p_actor, p_reason)
$$;

-- Gives an unassigned deal to p_owner, moves it to "to-contact" and creates the first-contact task
CREATE OR REPLACE FUNCTION "private"."apply_claim"("p_deal_id" bigint, "p_owner" bigint, "p_actor" bigint, "p_event" "text") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_deal public.deals%rowtype;
  v_contact_id bigint;
  v_task_id bigint;
begin
  select * into v_deal from public.deals where id = p_deal_id;

  update public.deals
    set sales_id = p_owner,
        stage = 'to-contact',
        updated_at = now(),
        index = (select coalesce(max(d.index), -1) + 1 from public.deals d where d.stage = 'to-contact' and d.archived_at is null)
    where id = p_deal_id;

  perform private.log_deal_event(p_deal_id, p_event, v_deal.stage, 'to-contact', v_deal.sales_id, p_owner, p_actor, null);

  v_contact_id := v_deal.contact_ids[1];
  if v_contact_id is null then
    return null;
  end if;

  insert into public.tasks (contact_id, deal_id, type, text, due_date, sales_id)
  values (
    v_contact_id,
    p_deal_id,
    'first-contact',
    'Первый контакт по заявке «' || v_deal.name || '»',
    coalesce(v_deal.first_response_due_at, now()),
    p_owner
  )
  on conflict (deal_id) where type = 'first-contact' and deal_id is not null
  do update set sales_id = excluded.sales_id where public.tasks.done_date is null
  returning id into v_task_id;

  return v_task_id;
end;
$$;

-- Guards the system columns of deals against direct writes through the Data API.
-- The commands run as the function owner, service_role is used by the server side intake.
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
     or new.lost_reason is distinct from old.lost_reason
     or new.is_historical is distinct from old.is_historical then
    raise exception 'deal_system_fields_are_read_only' using errcode = 'PT403',
      hint = 'Use claim_deal, transition_deal or assign_deal';
  end if;

  return new;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."claim_deal"("p_deal_id" bigint, "p_expected_version" integer DEFAULT NULL::integer, "p_request_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_me bigint := private.current_sales_id();
  v_deal public.deals%rowtype;
  v_res jsonb;
  v_task_id bigint;
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  v_res := private.command_replay(v_uid, p_request_key, 'claim_deal');
  if v_res is not null then
    return v_res;
  end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found or v_deal.archived_at is not null then
    raise exception 'deal_not_found' using errcode = 'PT404';
  end if;

  if v_deal.sales_id = v_me then
    -- the same person pressed the button twice: the answer is the same
    select t.id into v_task_id from public.tasks t where t.deal_id = p_deal_id and t.type = 'first-contact';
    return private.command_store(v_uid, p_request_key, 'claim_deal', p_deal_id, jsonb_build_object(
      'deal_id', v_deal.id, 'version', v_deal.version, 'stage', v_deal.stage, 'sales_id', v_deal.sales_id,
      'task_id', v_task_id, 'replayed', true));
  end if;
  if v_deal.sales_id is not null then
    raise exception 'deal_already_assigned' using errcode = 'PT409', hint = 'Another manager took this deal first';
  end if;
  if p_expected_version is not null and v_deal.version <> p_expected_version then
    raise exception 'deal_version_conflict' using errcode = 'PT409';
  end if;
  if v_deal.stage <> 'opportunity' then
    raise exception 'deal_not_claimable' using errcode = 'PT422';
  end if;

  v_task_id := private.apply_claim(p_deal_id, v_me, v_me, 'claimed');

  select * into v_deal from public.deals where id = p_deal_id;
  return private.command_store(v_uid, p_request_key, 'claim_deal', p_deal_id, jsonb_build_object(
    'deal_id', v_deal.id, 'version', v_deal.version, 'stage', v_deal.stage, 'sales_id', v_deal.sales_id,
    'task_id', v_task_id, 'replayed', false));
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
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  v_head := private.is_sales_head();

  if p_to_stage is null or p_to_stage not in ('opportunity', 'to-contact', 'contacted', 'in-work', 'proposal-sent', 'in-negociation', 'won', 'lost', 'delayed') then
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
  if not v_head and v_deal.sales_id is not null and v_deal.sales_id <> v_me then
    raise exception 'not_your_deal' using errcode = 'PT403';
  end if;
  if p_expected_version is null or v_deal.version <> p_expected_version then
    raise exception 'deal_version_conflict' using errcode = 'PT409';
  end if;

  if p_to_stage = 'won' and v_deal.stage <> 'won' then
    raise exception 'won_requires_handoff' using errcode = 'PT422',
      hint = 'A deal becomes won only through handoff_deal_to_production';
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
          else lost_reason end,
        first_responded_at = case
          when p_to_stage = 'contacted' and first_responded_at is null then now()
          else first_responded_at end
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
    if v_deal.stage not in ('opportunity', 'to-contact') then
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
      where s.id = p_to_sales_id and not s.disabled and r.role in ('manager', 'sales_head')
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

CREATE OR REPLACE FUNCTION "public"."create_manual_deal"("p_name" "text", "p_contact_id" bigint DEFAULT NULL::bigint, "p_new_contact" "jsonb" DEFAULT NULL::"jsonb", "p_company_id" bigint DEFAULT NULL::bigint, "p_description" "text" DEFAULT NULL::"text", "p_source" "text" DEFAULT 'manual'::"text", "p_received_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_categories" "text"[] DEFAULT NULL::"text"[], "p_amount" bigint DEFAULT NULL::bigint, "p_assign_to_me" boolean DEFAULT true, "p_request_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_uid uuid := (select auth.uid());
  v_me bigint := private.current_sales_id();
  v_res jsonb;
  v_contact_id bigint := p_contact_id;
  v_received timestamptz := coalesce(p_received_at, now());
  v_deal_id bigint;
  v_task_id bigint;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_version integer;
  v_stage text;
  v_owner bigint;
begin
  if v_uid is null or v_me is null then
    raise exception 'not_authenticated' using errcode = 'PT401';
  end if;
  if not private.is_sales_staff() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  v_res := private.command_replay(v_uid, p_request_key, 'create_manual_deal');
  if v_res is not null then
    return v_res;
  end if;

  if p_source is null or p_source not in ('website', 'avito', 'telegram', 'whatsapp', 'phone', 'manual', 'other') then
    raise exception 'invalid_source' using errcode = 'PT422';
  end if;
  if v_received > now() + interval '5 minutes' then
    raise exception 'received_at_in_future' using errcode = 'PT422';
  end if;
  if v_name is null then
    raise exception 'name_required' using errcode = 'PT422';
  end if;

  if v_contact_id is not null then
    if not exists (select 1 from public.contacts c where c.id = v_contact_id) then
      raise exception 'contact_not_found' using errcode = 'PT404';
    end if;
  elsif p_new_contact is not null then
    v_first := nullif(btrim(coalesce(p_new_contact ->> 'first_name', '')), '');
    v_last := nullif(btrim(coalesce(p_new_contact ->> 'last_name', '')), '');
    v_email := nullif(btrim(coalesce(p_new_contact ->> 'email', '')), '');
    v_phone := nullif(btrim(coalesce(p_new_contact ->> 'phone', '')), '');
    if v_first is null and v_last is null and v_email is null and v_phone is null then
      raise exception 'contact_required' using errcode = 'PT422';
    end if;
    -- A customer without a name gets a technical label instead of an invented one
    insert into public.contacts (first_name, last_name, email_jsonb, phone_jsonb, company_id, sales_id, first_seen, last_seen, status)
    values (
      coalesce(v_first, case when v_last is null then 'Клиент' end),
      v_last,
      case when v_email is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('email', v_email, 'type', 'Work')) end,
      case when v_phone is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('number', v_phone, 'type', 'Work')) end,
      p_company_id,
      v_me,
      now(),
      now(),
      'cold'
    )
    returning id into v_contact_id;
  else
    raise exception 'contact_required' using errcode = 'PT422';
  end if;

  perform set_config('crm.keep_unassigned', 'on', true);
  insert into public.deals (name, company_id, contact_ids, categories, stage, description, amount, source, received_at, first_response_due_at, sales_id, index)
  values (
    v_name,
    p_company_id,
    array[v_contact_id],
    p_categories,
    'opportunity',
    nullif(btrim(coalesce(p_description, '')), ''),
    p_amount,
    p_source,
    v_received,
    private.compute_first_response_due(v_received),
    null,
    (select coalesce(max(d.index), -1) + 1 from public.deals d where d.stage = 'opportunity' and d.archived_at is null)
  )
  returning id into v_deal_id;
  perform set_config('crm.keep_unassigned', 'off', true);

  perform private.log_deal_event(v_deal_id, 'created', null, 'opportunity', null, null, v_me, null);

  if coalesce(p_assign_to_me, true) then
    v_task_id := private.apply_claim(v_deal_id, v_me, v_me, 'claimed');
  end if;

  select d.version, d.stage, d.sales_id into v_version, v_stage, v_owner from public.deals d where d.id = v_deal_id;
  return private.command_store(v_uid, p_request_key, 'create_manual_deal', v_deal_id, jsonb_build_object(
    'deal_id', v_deal_id, 'contact_id', v_contact_id, 'version', v_version, 'stage', v_stage,
    'sales_id', v_owner, 'task_id', v_task_id, 'replayed', false));
end;
$$;

CREATE OR REPLACE FUNCTION "public"."set_staff_roles"("p_sales_id" bigint, "p_roles" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.sales s where s.id = p_sales_id) then
    raise exception 'sales_not_found' using errcode = 'PT404';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) r
    where r not in ('manager', 'sales_head', 'production_head', 'workshop', 'fulfillment')
  ) then
    raise exception 'invalid_role' using errcode = 'PT422';
  end if;

  delete from public.staff_roles where sales_id = p_sales_id and role <> all (coalesce(p_roles, '{}'::text[]));
  insert into public.staff_roles (sales_id, role)
  select p_sales_id, r from unnest(coalesce(p_roles, '{}'::text[])) r
  on conflict do nothing;
end;
$$;
