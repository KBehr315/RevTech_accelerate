-- Demo client: Meridian Aerostructures (fictional)
--
-- A made-up mid-size aerospace manufacturer and DoD prime, on SAP S/4HANA, for
-- demonstrating the Finance (FI/CO) MVP. Every name, person and figure here is
-- invented; emails use the reserved .example domain, so nobody can sign in as
-- these people. Applied by server/migrate.js only when DEMO_DATA=true
-- (preview), and only once: it does nothing if the client already exists.
--
-- Kelly Behringer is its Client Training Administrator, so the workspace is
-- visible after sign-in; add others through Members.

do $$
declare
  v_client uuid;
  v_fi uuid;
  v_co uuid;
  v_kelly uuid := (select id from public.profiles where email = 'kbehringer@revtech.consulting');
begin
  if exists (select 1 from public.clients where slug = 'meridian-aerostructures') then
    return;
  end if;

  insert into public.clients (name, slug, status, setup_step, industry, govcon_status, sap_landscape,
                              dassian_products, max_classification, branding, support_contact,
                              accessibility_requirements, created_by)
  values (
    'Meridian Aerostructures', 'meridian-aerostructures', 'active', 'review',
    'Aerospace and defense manufacturing', 'prime',
    jsonb_build_object(
      'version', 'SAP S/4HANA 2023',
      'deployment', 'RISE with SAP, private cloud',
      'fiori', 'Fiori launchpad for approvals and reporting; SAP GUI for finance month-end',
      'other_tools', 'Concur for travel, a homegrown timekeeping system, Excel-based indirect rate model'
    ),
    '{}', 'client_confidential',
    jsonb_build_object('primary_color', '#1f3a5f', 'accent_color', '#c2410c'),
    'Finance Systems help desk, finance-systems@meridian-aero.example',
    'Section 508; captions on all video',
    v_kelly
  )
  returning id into v_client;

  insert into public.client_workstreams (client_id, code, name, description) values
    (v_client, 'FI', 'Financial Accounting',
     'General ledger, accounts payable and receivable, asset accounting and the period-end close.')
  returning id into v_fi;
  insert into public.client_workstreams (client_id, code, name, description) values
    (v_client, 'CO', 'Controlling',
     'Cost centers, internal orders, project costs, indirect rates and allocations to government contracts.')
  returning id into v_co;

  insert into public.client_business_roles (client_id, name, description, workstream_ids) values
    (v_client, 'Accounts Payable Specialist', 'Enters and pays vendor invoices; three-way match against purchase orders.', array[v_fi]),
    (v_client, 'General Ledger Accountant', 'Posts journal entries, reconciles accounts and runs month-end close tasks.', array[v_fi]),
    (v_client, 'Cost Accountant', 'Maintains cost centers and internal orders; runs allocations and settlements.', array[v_co]),
    (v_client, 'Government Contracts Accountant', 'Tracks contract costs, unallowable costs and billing on cost-type contracts.', array[v_fi, v_co]),
    (v_client, 'Finance Controller', 'Owns the close, indirect rates and financial reporting; approves exceptions.', array[v_fi, v_co]);

  -- Meridian's own words for things, mapped to the standard SAP or GovCon term.
  insert into public.client_terms (client_id, client_term, standard_term, definition) values
    (v_client, 'Charge number', 'WBS element',
     'What employees book time and expenses to. Each one maps to a WBS element on a contract project.'),
    (v_client, 'Pool', 'Indirect cost pool',
     'A group of indirect costs (fringe, overhead, G&A) collected on cost centers and allocated to contracts.'),
    (v_client, 'Burden run', 'Overhead calculation (costing sheet)',
     'The month-end step that applies indirect rates to direct costs on projects.'),
    (v_client, 'Unallowables', 'Unallowable costs (FAR 31.205)',
     'Costs that may not be charged to the government, kept on separate cost elements so they are excluded from billing.'),
    (v_client, 'Provisional rates', 'Provisional billing rates',
     'Indirect rates used for billing during the year, before final rates are settled with the government.'),
    (v_client, 'Cost element', 'Cost element (G/L account, type 1 or 41-43)',
     'In S/4HANA a cost element is a G/L account with a cost element category.'),
    (v_client, 'Close calendar', 'Financial closing cockpit task list',
     'The ordered list of month-end tasks and their owners.');

  if v_kelly is not null then
    insert into public.client_memberships (client_id, profile_id, roles, added_by)
    values (v_client, v_kelly, array['client_training_admin', 'lms_admin'], v_kelly);
  end if;

  -- Fictional people, so member lists and rosters aren't empty.
  insert into auth.users (email) values
    ('dana.whitfield@meridian-aero.example'),
    ('marcus.oyelaran@meridian-aero.example'),
    ('priya.raman@meridian-aero.example'),
    ('tom.kessler@meridian-aero.example'),
    ('lena.morales@meridian-aero.example')
  on conflict (email) do nothing;

  insert into public.profiles (id, email, full_name, is_guest)
  select u.id, u.email, p.full_name, true
  from auth.users u
  join (values
    ('dana.whitfield@meridian-aero.example', 'Dana Whitfield'),
    ('marcus.oyelaran@meridian-aero.example', 'Marcus Oyelaran'),
    ('priya.raman@meridian-aero.example', 'Priya Raman'),
    ('tom.kessler@meridian-aero.example', 'Tom Kessler'),
    ('lena.morales@meridian-aero.example', 'Lena Morales')
  ) as p(email, full_name) on p.email = u.email
  on conflict (id) do nothing;

  insert into public.client_memberships (client_id, profile_id, roles, added_by)
  select v_client, pr.id, m.roles, v_kelly
  from (values
    ('dana.whitfield@meridian-aero.example', array['reviewer', 'learner']),     -- Finance Controller, SME reviewer
    ('marcus.oyelaran@meridian-aero.example', array['contributor', 'learner']), -- Cost Accountant
    ('priya.raman@meridian-aero.example', array['learner']),                    -- General Ledger Accountant
    ('tom.kessler@meridian-aero.example', array['learner']),                    -- Accounts Payable Specialist
    ('lena.morales@meridian-aero.example', array['learner'])                    -- Government Contracts Accountant
  ) as m(email, roles)
  join public.profiles pr on pr.email = m.email;
end
$$;
