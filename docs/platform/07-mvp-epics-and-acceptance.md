# 07 · MVP Scope, Deferred Features, Epics, Stories and Acceptance Criteria

Covers master-prompt §34 and §36 items 8, 9, 15 and 16.

## MVP scope

| # | MVP capability (§34) | Included as | Phase |
|---|---|---|---|
| 1 | Multi-client workspaces, roles, permissions | Clients, memberships, work grants, platform roles, RLS everywhere, client switcher | 0 |
| 2 | Client setup + Knowledge Library with three scopes | Setup wizard; Global, Shared/Restricted, Client-Specific, Pending Classification | 0–1 |
| 3 | Word, PowerPoint, Excel, PDF, image ingestion | DOCX, PPTX, XLSX, PDF (incl. OCR), PNG/JPG, TXT, CSV | 1 |
| 4 | Searchable library, duplicates, provenance, citations | Hybrid search, 4-stage duplicate check, locator-precise citations | 1 |
| 5 | Knowledge Coverage and Training Readiness | Explainable snapshots, gap actions, readiness gate | 2, 5 |
| 6 | AI Job Aid, PowerPoint, 10-question Assessment, Interactive HTML | Pipeline + shared content model + four renderers | 2 |
| 7 | Review, comments, approval, version control | Review workspace, approval rules, manifests, diffs | 3 |
| 8 | Downloadable outputs | DOCX, PDF, PPTX, HTML zip, **SCORM 1.2 zip** | 3 |
| 9 | Basic LMS | Assignments (incl. max attempts), enrollments, learner dashboard, player, scoring, **email reminders**, CSV import, reports and exports, certificates | 4 |
| 10 | Client-specific learner Help Assistant | Learner mode + labeled internal mode | 4 |
| + | Needed for the above | Model gateway, audit log, malware scan, classification ceiling, accessibility gate, manual screenshot annotation workspace, change-impact detection, promotion workflow | 0–5 |

**Demo content:** a fictional client, **Meridian Aerostructures** (an A&D government contractor moving to S/4HANA with Fiori), FI/CO only: post a general journal entry, manage cost centers, display G/L balances, and run period-end accruals. All documents, screenshots, and people are invented. There is no real client data and no copyrighted SAP text: Global SAP "reference" items in the demo are original summaries written for the demo and labeled as such.

## Deferred to later releases

| Feature | Why later |
|---|---|
| Automated SAP navigation and screenshot capture | Needs client network access, identities, and approvals (§34 explicitly allows deferral) |
| Evidence from the client's live system (authority tier 2) | Same dependency |
| SCORM 2004, xAPI, cmi5 | SCORM 1.2 covers most LMSs; the others add value once a client asks |
| Instructor Guide, Participant Guide, Simulation, standalone Knowledge Check outputs | Derived from the same content model; next output types after the MVP four |
| Client-uploaded PowerPoint masters and client-authored templates | RevTech template for MVP (your decision) |
| Multilingual generation | English only (your decision); `language` field is in place |
| Azure Government deployment, CUI and export-controlled content | Requires dedicated deployment, SSP, assessment, and AI provider authorization |
| Dassian validation agent and Dassian content | MVP workstream is FI/CO; Dassian products to be chosen |
| SAP Enable Now, Cloud ALM, Solution Manager imports; TIFF/SVG/HTML/XML/JSON/video transcript ingestion | Import adapters after core formats are solid |
| Live Power BI connector, Entra group sync, HR/client API connectors, Viva Learning | Exports and CSV cover the MVP |
| Instructor-led and virtual instructor-led training | Open product decision |
| Manager role and manager visibility | You chose no manager score visibility |
| Lesson-level tables and lesson-level assignment | Lessons live inside the content model for now |
| Re-parsing edited DOCX/PPTX back into the structured model | MVP keeps re-uploaded files as versions with a text diff |

## Epics, stories and acceptance criteria

Format: **Story** – *acceptance criteria*. "CTA" = Client Training Administrator, "GKA" = Global Knowledge Administrator, "LMSA" = LMS Administrator.

### E1 · Workspaces, identity and roles

- **E1.1 As anyone in the RevTech tenant or an invited guest, I sign in with Microsoft.**
  - A valid token from the RevTech tenant creates a profile on first sign-in; guests' email is read from `email`/`upn` when `preferred_username` is absent.
  - A profile with no memberships and no platform roles sees an empty state and can read no client, global, or learner data (RLS test).
  - Deactivated profiles are refused within 15 seconds of deactivation.
- **E1.2 As a Platform Administrator, I grant platform roles.**
  - Only Platform Administrators can grant or revoke `platform_admin` and `global_knowledge_admin`; every change is audited.
  - Granting a platform role gives no access to any client's content (RLS test per table).
- **E1.3 As a CTA, I add people to my client with specific roles and work grants.**
  - Roles are limited to the five client roles; a CTA can't grant platform roles.
  - A Contributor with a grant on module M can edit M's outputs and not module N's (RLS test).
  - An LMSA can add learners but can't grant CTA, Contributor, or Reviewer roles.
- **E1.4 As a user with several clients, I choose my context.**
  - The header always shows "Global Context", "Shared/Restricted Context", or "Client Context: {name}".
  - Upload, generate, edit, review, publish, and client analytics are disabled until a client is selected.
  - Switching context clears client-specific caches in the browser.
- **E1.5 Isolation test suite.**
  - For every table, automated tests run as: member of A, member of B, platform admin without membership, guest without membership. Any unexpected allow fails CI.

### E2 · Client setup

- **E2.1 As a CTA (or Platform Admin), I create a client through a wizard.**
  - Steps: profile (name, industry, GovCon status) → SAP landscape (version, deployment, Fiori, Dassian products) → organization (workstreams, business roles, glossary) → branding (logo, colors) → governance (max classification, allowed AI providers, approval stages, accessibility needs, support contact) → review.
  - Progress is saved per step; an unfinished client stays in `setup` status and can't receive learners.
  - Allowed AI providers default to none; generation is blocked with an explanation until one is chosen.
- **E2.2 As a CTA, I upload a role matrix or curriculum and get a proposed role-to-training matrix.**
  - The proposal is a draft and drives nothing until a CTA approves it (audited).

### E3 · Knowledge library and ingestion

- **E3.1 As a CTA or Contributor, I upload files by drag-and-drop or batch.**
  - Defaults are applied server-side per the table in [04](04-knowledge-management.md#upload-and-ingestion); a request trying to set scope Global from a client workspace is rejected.
  - Files with `scan_status != clean` are never extracted or shown for download.
  - In the commercial environment, files marked or detected as Controlled or Export Controlled are blocked with the reason shown, and the attempt is audited.
- **E3.2 Extraction.**
  - DOCX, PPTX, XLSX, PDF (text and scanned), PNG/JPG, TXT, and CSV produce chunks with locators that open the right page, slide, or sheet range.
  - Transaction codes and numbered steps are extracted from the demo test scripts with ≥ 90% recall against a hand-labeled fixture set.
- **E3.3 Duplicate detection.**
  - An identical file, a same-title newer revision, and a ≥ 85% text-overlap file each produce a candidate with its reason and the five choices.
  - Candidates never include assets the uploader can't read (test with a duplicate in another client).
- **E3.4 Metadata and versions.**
  - Editing metadata creates a metadata-only version; replacing the file creates a file version; history shows both.
  - Expired or superseded assets are excluded from new generation by default and labeled wherever they appear.
- **E3.5 Global and Shared libraries.**
  - GKAs classify Pending Classification items; until then they are unavailable to AI (test).
  - A Shared asset with audience "A&D clients" is visible in an A&D client and not in a non-A&D client (test).
- **E3.6 Search.**
  - In Client Context results include Global + allowed Shared + this client only; every result shows scope, classification, approval, lifecycle, and AI-use badges.
  - All §12 filters work; saved searches persist per user.

### E4 · Model gateway and AI controls

- **E4.1 As a Platform Administrator, I register AI providers.**
  - Each provider has a classification ceiling and a CUI flag (default false, and it can't be set true in the commercial environment).
- **E4.2 Every AI call is checked.**
  - A call whose input includes a chunk above the provider's ceiling, or for a client that hasn't allowed that provider, is refused and logged (test).
  - `not_approved` assets are never sent for embedding (test by inspecting `ai_calls`).
- **E4.3 Provider switching.**
  - Changing the configured provider requires no code change; the demo pipeline passes on at least two providers.

### E5 · Training Readiness and Knowledge Coverage

- **E5.1 As a CTA, I see a module's readiness status and why.**
  - Status follows the ordered rules in [05](05-content-generator.md#training-readiness); each factor shows evidence, weight, and blocks/warns setting; the calculation date is shown.
  - "Generate" is disabled when the status is Generation Blocked, with the blocking factors listed.
- **E5.2 As a CTA or GKA, I see Knowledge Coverage for a workstream, process, role, or product.**
  - A factor without the inputs to compute it shows "Not calculable" with the action to fix it, and is excluded from the total, with that exclusion stated.
  - Each missing item links to its §13 action.
- **E5.3 Weights are configurable.**
  - A GKA sets default weights; a CTA overrides them per client except mandatory factors; snapshots record the weights used.

### E6 · Generation

- **E6.1 As a CTA or Contributor, I generate outputs with the wizard.**
  - Steps follow §19; the source picker shows only eligible versions and explains why others are excluded.
  - `human_approval_required` assets need an authorization step, recorded with the job.
- **E6.2 Generation progress.**
  - The progress screen shows the §19 statuses live, per-step warnings, and any Awaiting User Input questions with a form to answer them.
  - A canceled job leaves no outputs in a non-draft state.
- **E6.3 Grounding rules.**
  - Every client process step in a generated output is labeled `client_provided`, `conflict`, `needs_validation`, or `missing` (QA test on fixtures).
  - Disagreeing sources create a conflict with both citations; the output can't be approved while it is unresolved.
  - Citations to chunks outside the job's eligible set are removed and flagged.
- **E6.4 Outputs.**
  - Job Aid has all §20A sections and fits in two pages, or carries a warning.
  - PPTX opens in PowerPoint with editable text, tables, and images and a speaker note on every slide.
  - Assessment defaults to 10 items, each with answer, explanation, citation, objective, difficulty, topic, and remediation. Fewer are produced (with a warning) when content can't support 10.
  - The HTML course covers every lesson and objective in the content model and includes the final assessment.
- **E6.5 Generation Manifest.**
  - Every output version has an immutable manifest (sources + versions, config, providers/models, prompt versions, user, time, validation results, conflicts); UPDATE and DELETE are refused at the database level (test).

### E7 · Editing and synchronization

- **E7.1 As a Contributor, I edit an output in the browser.**
  - Text, steps, images/screenshots, callouts, slides, notes, assessment items, and citations are editable; each save creates a version with a block diff.
  - Compare any two versions; restoring creates a new version.
- **E7.2 Shared model synchronization.**
  - Editing the PPTX doesn't change the HTML course; "Propose change to shared model" creates a model version; other outputs show a diff and Re-render/Dismiss.
- **E7.3 Upload a revised file.**
  - A re-uploaded DOCX/PPTX becomes a new version with `origin = reuploaded` and a text diff, keeping its links to module, sources, and manifest.

### E8 · Screenshots (manual)

- **E8.1 As a Contributor, I annotate and redact screenshots.**
  - Crop, arrows/boxes/text, step numbers, and redaction; redaction is burned into the stored image.
  - Each screenshot records client, environment, process, app/transaction, role, capture date, sensitivity, and where it's used; replacing one asks for a reason.
  - Generic Global images display "Generic demonstration" wherever used.

### E9 · Review and approval

- **E9.1 As a Reviewer, I comment on an output.**
  - Comments anchor to a block or text range; categories, priorities, required/optional, and statuses follow §22; threads are supported.
- **E9.2 As a CTA, I configure approval rules.**
  - Rules match on workstream, output type, process, risk class, and destination; §32 items always require a named approval.
- **E9.3 Approval gate.**
  - Approval is refused while any required comment isn't Verified/Closed, any conflict is unresolved, any rule is unmet, or the accessibility check fails without a waiver.
  - Nobody can approve their own generated or edited version when a rule requires independent review.
- **E9.4 Audit.**
  - Every status change, decision, and waiver appears in the client audit history with actor, role used, and time.

### E10 · Publishing and downloads

- **E10.1 As a CTA, I publish an approved version.**
  - Destinations: platform LMS, download, share link (expiring), Standalone HTML zip, SCORM 1.2 zip.
  - The SCORM 1.2 package imports and reports status and score in at least one reference LMS (SCORM Cloud test).
  - Publishing a new version marks the previous one Superseded without changing any learner records.
- **E10.2 Downloads are controlled.**
  - Downloads go through the API, are audited, and carry the classification footer.

### E11 · LMS

- **E11.1 As an LMSA, I import learners by CSV.**
  - Validates emails; creates guest invitations or memberships; shows a row-level result report.
- **E11.2 As an LMSA, I assign training.**
  - Assign module, course, or journey to a learner, group, or business role, with due date or relative due, required/optional, recertification, and **max attempts**.
  - New group members are enrolled automatically; removed members keep their history.
- **E11.3 As a learner, I see and launch my training.**
  - Dashboard shows the §26 elements and statuses; prerequisites block launch with a message.
  - The player resumes where I left off; scores are computed server-side; answer keys never reach the browser (test).
  - When max attempts is reached, the status is Requires Retake until an LMSA resets it (audited).
- **E11.4 Email reminders.**
  - Assigned, due in 7 days, due in 1 day, and overdue emails go out per client settings; emails contain no scores or content.
- **E11.5 Certificates.**
  - A completed enrollment produces a downloadable PDF certificate.

### E12 · Help Assistant

- **E12.1 As a learner, I ask a question.**
  - Answers cite a published module or job aid section with a link; when nothing relevant is found, it says so and offers "Send to support".
  - Drafts, superseded versions, answer keys, and review comments are never retrievable in learner mode (test with planted content).
- **E12.2 As a CTA, I use internal mode.**
  - The header shows "Internal mode"; every citation shows its status label.

### E13 · Reporting

- **E13.1 As an LMSA or CTA, I run reports.**
  - §28 filters and the MVP metrics in [06](06-lms.md#reporting-and-analytics); question-level analysis per assessment version.
  - CSV, XLSX, and PDF exports; the CSV/XLSX column schema is documented and stable.
  - The employment-decision notice is shown on every report screen.

### E14 · Change impact and promotion

- **E14.1 Change impact.**
  - Approving a new version of a cited asset creates impact items for every output version citing the old one, with affected blocks highlighted.
  - Approved outputs and learner records are unchanged; "retraining required" re-enrolls completers on the new version.
- **E14.2 Propose for Global.**
  - Creates a separate candidate; the original is unchanged (test).
  - Findings list detected client names/terms, people, identifiers, screenshots, and export-control markers; the UI never states content is "clean".
  - Global publication requires GKA approval plus client approval (default until the product owner decides otherwise).

### E15 · Platform foundations (non-functional)

- **E15.1 Audit:** append-only, copied daily to Log Analytics; no role can UPDATE/DELETE audit rows (test).
- **E15.2 Observability:** traces for API and worker; alerts for failed jobs, error rate, and RLS-denial spikes.
- **E15.3 Accessibility:** axe checks pass on every screen in e2e; keyboard-only walkthrough of the learner path passes.
- **E15.4 API docs:** OpenAPI generated from route schemas and published at `/api/docs` for authenticated admins.
- **E15.5 Setup docs:** README covers local setup, tests, environments, and deployment, with no credentials in the repo.
