--
-- Grants
-- This file declares all grants and default privileges for the public schema.
--

-- Schema usage
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Function grants
grant all on function public.cleanup_note_attachments() to anon;
grant all on function public.cleanup_note_attachments() to authenticated;
grant all on function public.cleanup_note_attachments() to service_role;

grant all on function public.get_avatar_for_email(text) to anon;
grant all on function public.get_avatar_for_email(text) to authenticated;
grant all on function public.get_avatar_for_email(text) to service_role;

grant all on function public.get_domain_favicon(text) to anon;
grant all on function public.get_domain_favicon(text) to authenticated;
grant all on function public.get_domain_favicon(text) to service_role;

grant all on function public.get_note_attachments_function_url() to anon;
grant all on function public.get_note_attachments_function_url() to authenticated;
grant all on function public.get_note_attachments_function_url() to service_role;

revoke all on function public.get_user_id_by_email(text) from public;
grant all on function public.get_user_id_by_email(text) to service_role;

grant all on function public.handle_company_saved() to anon;
grant all on function public.handle_company_saved() to authenticated;
grant all on function public.handle_company_saved() to service_role;

grant all on function public.handle_contact_note_created_or_updated() to anon;
grant all on function public.handle_contact_note_created_or_updated() to authenticated;
grant all on function public.handle_contact_note_created_or_updated() to service_role;

grant all on function public.handle_contact_saved() to anon;
grant all on function public.handle_contact_saved() to authenticated;
grant all on function public.handle_contact_saved() to service_role;

grant all on function public.handle_new_user() to anon;
grant all on function public.handle_new_user() to authenticated;
grant all on function public.handle_new_user() to service_role;

grant all on function public.handle_update_user() to anon;
grant all on function public.handle_update_user() to authenticated;
grant all on function public.handle_update_user() to service_role;

grant all on function public.is_admin() to anon;
grant all on function public.is_admin() to authenticated;
grant all on function public.is_admin() to service_role;

grant all on function public.lowercase_email_jsonb() to anon;
grant all on function public.lowercase_email_jsonb() to authenticated;
grant all on function public.lowercase_email_jsonb() to service_role;

grant all on function public.merge_contacts(bigint, bigint) to anon;
grant all on function public.merge_contacts(bigint, bigint) to authenticated;
grant all on function public.merge_contacts(bigint, bigint) to service_role;

grant all on function public.set_sales_id_default() to anon;
grant all on function public.set_sales_id_default() to authenticated;
grant all on function public.set_sales_id_default() to service_role;

-- Table grants
grant all on table public.companies to anon;
grant all on table public.companies to authenticated;
grant all on table public.companies to service_role;

grant all on table public.contacts to anon;
grant all on table public.contacts to authenticated;
grant all on table public.contacts to service_role;

grant all on table public.contact_notes to anon;
grant all on table public.contact_notes to authenticated;
grant all on table public.contact_notes to service_role;

grant all on table public.deals to anon;
grant all on table public.deals to authenticated;
grant all on table public.deals to service_role;

grant all on table public.deal_notes to anon;
grant all on table public.deal_notes to authenticated;
grant all on table public.deal_notes to service_role;

grant all on table public.sales to anon;
grant all on table public.sales to authenticated;
grant all on table public.sales to service_role;

grant all on table public.tags to anon;
grant all on table public.tags to authenticated;
grant all on table public.tags to service_role;

grant all on table public.tasks to anon;
grant all on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

grant all on table public.configuration to anon;
grant all on table public.configuration to authenticated;
grant all on table public.configuration to service_role;

grant all on table public.favicons_excluded_domains to anon;
grant all on table public.favicons_excluded_domains to authenticated;
grant all on table public.favicons_excluded_domains to service_role;

revoke all on table public.user_invitations from anon, authenticated;
grant all on table public.user_invitations to service_role;

-- View grants
grant all on table public.activity_log to anon;
grant all on table public.activity_log to authenticated;
grant all on table public.activity_log to service_role;

grant all on table public.companies_summary to anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

grant all on table public.contacts_summary to anon;
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;

grant all on table public.init_state to anon;
grant all on table public.init_state to authenticated;
grant all on table public.init_state to service_role;

-- Sequence grants
grant all on sequence public.companies_id_seq to anon;
grant all on sequence public.companies_id_seq to authenticated;
grant all on sequence public.companies_id_seq to service_role;

grant all on sequence public."contactNotes_id_seq" to anon;
grant all on sequence public."contactNotes_id_seq" to authenticated;
grant all on sequence public."contactNotes_id_seq" to service_role;

grant all on sequence public.contacts_id_seq to anon;
grant all on sequence public.contacts_id_seq to authenticated;
grant all on sequence public.contacts_id_seq to service_role;

grant all on sequence public."dealNotes_id_seq" to anon;
grant all on sequence public."dealNotes_id_seq" to authenticated;
grant all on sequence public."dealNotes_id_seq" to service_role;

grant all on sequence public.deals_id_seq to anon;
grant all on sequence public.deals_id_seq to authenticated;
grant all on sequence public.deals_id_seq to service_role;

grant all on sequence public.favicons_excluded_domains_id_seq to anon;
grant all on sequence public.favicons_excluded_domains_id_seq to authenticated;
grant all on sequence public.favicons_excluded_domains_id_seq to service_role;

grant all on sequence public.sales_id_seq to anon;
grant all on sequence public.sales_id_seq to authenticated;
grant all on sequence public.sales_id_seq to service_role;

grant all on sequence public.tags_id_seq to anon;
grant all on sequence public.tags_id_seq to authenticated;
grant all on sequence public.tags_id_seq to service_role;

grant all on sequence public.tasks_id_seq to anon;
grant all on sequence public.tasks_id_seq to authenticated;
grant all on sequence public.tasks_id_seq to service_role;

-- No default privileges: every new table, view, sequence or function must
-- declare its grants explicitly in the migration that creates it.

--
-- Roles and deal commands
--

-- The private schema is not exposed by the Data API; policies need to call the role helpers
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

revoke all on function private.current_sales_id() from public, anon;
revoke all on function private.has_role(text) from public, anon;
revoke all on function private.is_sales_head() from public, anon;
revoke all on function private.is_sales_staff() from public, anon;
grant execute on function private.current_sales_id() to authenticated, service_role;
grant execute on function private.has_role(text) to authenticated, service_role;
grant execute on function private.is_sales_head() to authenticated, service_role;
grant execute on function private.is_sales_staff() to authenticated, service_role;

-- Internals of the commands: only the function owner calls them
revoke all on function private.compute_first_response_due(timestamp with time zone) from public, anon, authenticated;
revoke all on function private.command_replay(uuid, text, text) from public, anon, authenticated;
revoke all on function private.command_store(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function private.log_deal_event(bigint, text, text, text, bigint, bigint, bigint, text) from public, anon, authenticated;
revoke all on function private.apply_claim(bigint, bigint, bigint, text) from public, anon, authenticated;
grant execute on function private.compute_first_response_due(timestamp with time zone) to service_role;

revoke all on function public.deals_guard() from public, anon, authenticated;

-- Commands callable by a signed-in person: every one of them checks auth.uid() and the working role
revoke all on function public.claim_deal(bigint, integer, text) from public, anon;
revoke all on function public.transition_deal(bigint, integer, text, bigint, text, text, date, text) from public, anon;
revoke all on function public.assign_deal(bigint, integer, bigint, text, text) from public, anon;
revoke all on function public.create_manual_deal(text, bigint, jsonb, bigint, text, text, timestamp with time zone, text[], bigint, boolean, text) from public, anon;
revoke all on function public.set_staff_roles(bigint, text[]) from public, anon;
grant execute on function public.claim_deal(bigint, integer, text) to authenticated, service_role;
grant execute on function public.transition_deal(bigint, integer, text, bigint, text, text, date, text) to authenticated, service_role;
grant execute on function public.assign_deal(bigint, integer, bigint, text, text) to authenticated, service_role;
grant execute on function public.create_manual_deal(text, bigint, jsonb, bigint, text, text, timestamp with time zone, text[], bigint, boolean, text) to authenticated, service_role;
grant execute on function public.set_staff_roles(bigint, text[]) to authenticated, service_role;

-- Tables
revoke all on table public.staff_roles from anon, authenticated;
grant select on table public.staff_roles to authenticated;
grant all on table public.staff_roles to service_role;
grant all on sequence public.staff_roles_id_seq to service_role;

revoke all on table public.business_settings from anon, authenticated;
grant select, insert, update on table public.business_settings to authenticated;
grant all on table public.business_settings to service_role;

revoke all on table public.deal_stage_history from anon, authenticated;
grant select on table public.deal_stage_history to authenticated;
grant all on table public.deal_stage_history to service_role;
grant all on sequence public.deal_stage_history_id_seq to service_role;

revoke all on table private.deal_commands from public, anon, authenticated;
grant all on table private.deal_commands to service_role;

--
-- Production handoff, workshop board and notifications
--

revoke all on function private.is_production_staff() from public, anon;
grant execute on function private.is_production_staff() to authenticated, service_role;
revoke all on function private.order_file_deal_id(text) from public, anon;
grant execute on function private.order_file_deal_id(text) to authenticated, service_role;

revoke all on function public.handoff_deal_to_production(bigint, integer, text, text, date, jsonb, jsonb, text) from public, anon;
revoke all on function public.transition_production_order(bigint, integer, text, text) from public, anon;
revoke all on function public.open_notification(bigint) from public, anon;
revoke all on function public.acknowledge_notification(bigint) from public, anon;
grant execute on function public.handoff_deal_to_production(bigint, integer, text, text, date, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.transition_production_order(bigint, integer, text, text) to authenticated, service_role;
grant execute on function public.open_notification(bigint) to authenticated, service_role;
grant execute on function public.acknowledge_notification(bigint) to authenticated, service_role;

revoke all on table public.production_orders from anon, authenticated;
grant select on table public.production_orders to authenticated;
grant all on table public.production_orders to service_role;
revoke all on table public.production_order_materials from anon, authenticated;
grant select on table public.production_order_materials to authenticated;
grant all on table public.production_order_materials to service_role;
revoke all on table public.order_stage_history from anon, authenticated;
grant select on table public.order_stage_history to authenticated;
grant all on table public.order_stage_history to service_role;
revoke all on table public.notification_events from anon, authenticated;
grant select on table public.notification_events to authenticated;
grant all on table public.notification_events to service_role;
grant all on sequence public.production_orders_id_seq to service_role;
grant all on sequence public.production_order_materials_id_seq to service_role;
grant all on sequence public.order_stage_history_id_seq to service_role;
grant all on sequence public.notification_events_id_seq to service_role;

--
-- Payments and analytics
--

revoke all on function public.register_payment(bigint, text, bigint, date, text, text) from public, anon;
grant execute on function public.register_payment(bigint, text, bigint, date, text, text) to authenticated, service_role;
revoke all on function public.deals_finance_summary(text[], bigint, date, date) from public, anon;
grant execute on function public.deals_finance_summary(text[], bigint, date, date) to authenticated, service_role;

revoke all on table public.deal_payments from anon, authenticated;
grant select on table public.deal_payments to authenticated;
grant all on table public.deal_payments to service_role;
grant all on sequence public.deal_payments_id_seq to service_role;

revoke all on table public.deals_finance from anon, authenticated;
grant select on table public.deals_finance to authenticated;
grant all on table public.deals_finance to service_role;
