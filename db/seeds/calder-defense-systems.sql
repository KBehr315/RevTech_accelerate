-- Demo client: Calder Defense Systems (fictional)
--
-- A made-up small defense electronics subcontractor on SAP S/4HANA Cloud,
-- public edition: the second demo client, so preview can show switching
-- between clients and that neither sees the other's content. Every name and
-- person here is invented; emails use the reserved .example domain. Applied by
-- server/migrate.js only when DEMO_DATA=true (preview), and only once.
--
-- Kelly Behringer is its Client Training Administrator too, so both
-- workspaces appear in the context switcher.

do $$
declare
  v_client uuid;
  v_fi uuid;
  v_kelly uuid := (select id from public.profiles where email = 'kbehringer@revtech.consulting');
begin
  if exists (select 1 from public.clients where slug = 'calder-defense-systems') then
    return;
  end if;

  insert into public.clients (name, slug, status, setup_step, industry, govcon_status, sap_landscape,
                              dassian_products, max_classification, branding, support_contact, created_by)
  values (
    'Calder Defense Systems', 'calder-defense-systems', 'active', 'review',
    'Defense electronics', 'subcontractor',
    jsonb_build_object(
      'version', 'SAP S/4HANA Cloud, public edition',
      'deployment', 'Public cloud (multi-tenant)',
      'fiori', 'Fiori only; no SAP GUI',
      'other_tools', 'Spreadsheet-based contract tracking'
    ),
    '{}', 'confidential',
    jsonb_build_object('primary_color', '#14532d', 'accent_color', '#0e7490'),
    'IT service desk, it-help@calder-defense.example',
    v_kelly
  )
  returning id into v_client;

  insert into public.client_workstreams (client_id, code, name, description) values
    (v_client, 'FI', 'Finance', 'Accounts payable, receivable and the general ledger, run by a small finance team.')
  returning id into v_fi;

  insert into public.client_business_roles (client_id, name, description, workstream_ids) values
    (v_client, 'Staff Accountant', 'Handles payables, receivables and journal entries.', array[v_fi]),
    (v_client, 'Finance Manager', 'Runs the close and approves payments.', array[v_fi]);

  insert into public.client_terms (client_id, client_term, standard_term, definition) values
    (v_client, 'Job number', 'Project (WBS element)',
     'What Calder calls the project a prime contractor''s subcontract is tracked on.'),
    (v_client, 'Flow-downs', 'Flow-down clauses',
     'Contract clauses the prime contractor passes down to Calder, including cost and accounting requirements.');

  if v_kelly is not null then
    insert into public.client_memberships (client_id, profile_id, roles, added_by)
    values (v_client, v_kelly, array['client_training_admin', 'lms_admin'], v_kelly);
  end if;

  insert into auth.users (email) values
    ('sam.okafor@calder-defense.example'),
    ('jordan.bell@calder-defense.example')
  on conflict (email) do nothing;

  insert into public.profiles (id, email, full_name, is_guest)
  select u.id, u.email, p.full_name, true
  from auth.users u
  join (values
    ('sam.okafor@calder-defense.example', 'Sam Okafor'),
    ('jordan.bell@calder-defense.example', 'Jordan Bell')
  ) as p(email, full_name) on p.email = u.email
  on conflict (id) do nothing;

  insert into public.client_memberships (client_id, profile_id, roles, added_by)
  select v_client, pr.id, m.roles, v_kelly
  from (values
    ('sam.okafor@calder-defense.example', array['reviewer', 'learner']),  -- Finance Manager
    ('jordan.bell@calder-defense.example', array['learner'])              -- Staff Accountant
  ) as m(email, roles)
  join public.profiles pr on pr.email = m.email;
end
$$;
