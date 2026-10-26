# 08 · Information Architecture, User Journeys and Screens

Covers master-prompt §36 items 7 (end-to-end journeys) and 14 (wireframe descriptions for every required screen), and the §35 "information architecture" deliverable.

## Information architecture

```
┌ Header: logo · CONTEXT SWITCHER [Client Context: Meridian Aerostructures ▾] · search · notifications · help · user menu
├ Left nav (changes with context and role)
│  Client context                       Global context (GKA)          Platform (Platform Admin)
│  ├ Home                               ├ Home                        ├ Home
│  ├ Knowledge                          ├ Global Library              ├ Clients
│  │  ├ Library                         ├ Shared/Restricted Library   ├ Users & platform roles
│  │  ├ Upload center                   ├ Pending Classification      ├ AI providers
│  │  ├ Screenshots                     ├ Promotion requests          ├ Integrations
│  │  └ Coverage & gaps                 ├ Coverage (enterprise)       ├ Security policies
│  ├ Training                           ├ Scoring factors             ├ Audit log
│  │  ├ Structure (journeys/courses/modules)                          └ Settings
│  │  ├ Generate
│  │  ├ Jobs
│  │  └ Content library
│  ├ Review & approval
│  ├ Learning (LMS)
│  │  ├ Learners & groups
│  │  ├ Assignments
│  │  └ Reports
│  └ Settings (client setup, approval rules, reminders, members)
└ Learner view: My training · Certificates · Help Assistant
```

A person who is only a Learner never sees the left nav. They land on **My training**. People with both learner and staff roles get a "My training" link in the user menu.

The context switcher lists only clients the user is a member of, plus Global/Shared contexts if they're a GKA. The context label is always visible and color-coded: neutral for Global, amber for Shared/Restricted, and the client's accent color for Client.

## End-to-end user journeys

1. **Stand up a client** (Platform Admin → CTA). Platform Admin creates "Meridian Aerostructures" and invites the lead consultant as CTA. The CTA completes the setup wizard: SAP S/4HANA 2023 private cloud, Fiori Launchpad, FI/CO workstreams, business roles (GL Accountant, Cost Center Manager, Controller), glossary, logo, max classification "Client Confidential", allowed AI provider, approval stages Contributor → SME → Client. The CTA invites two consultants (Contributor with an FI grant, Reviewer/SME) and the client's training lead (Reviewer, client stage).
2. **Build knowledge** (CTA, Contributor). Upload BPDs, test scripts, and a role matrix ([04](04-knowledge-management.md#knowledge-journeys)). The AI proposes a role-to-training matrix and the CTA approves it. Coverage shows FI-GL at 62% with gaps: screenshots for 9 steps, no approved test script for accruals.
3. **Generate and refine** (CTA, Contributor, SME). See [05 generation journey](05-content-generator.md#generation-journey-fico-demo).
4. **Review and approve** (Reviewers, CTA). SME raises 3 comments (1 required: wrong posting-period rule). The Contributor fixes it, the SME verifies, the client reviewer approves with an optional note, and the CTA approves (all rules met, accessibility passed).
5. **Publish and assign** (CTA, LMSA). The CTA publishes to the platform LMS and downloads a SCORM 1.2 zip for the client's corporate LMS. The LMSA imports 40 learners from CSV, assigns the "S/4HANA Finance for GL Accountants" journey to the GL Accountant role (due in 30 days, 3 attempts), and reminders are scheduled.
6. **Learn** (Learner). The guest signs in, sees the journey at 0%, launches Module 1, uses tabs and hotspot screenshots, asks the Help Assistant "where do I enter the reference document?" (answered with a citation to the job aid, step 4), passes the assessment at 90%, and downloads the job aid.
7. **Monitor and maintain** (LMSA, CTA). Reports show 72% on time, with question 6 most missed. A revised test script arrives, change impact flags 3 outputs, the CTA updates the job aid and marks "retraining required" for the 1 changed step, and affected learners are re-enrolled.
8. **Reuse** (CTA → GKA). The CTA proposes a generic "Journal Entry basics" asset for Global. The detector flags the client name and 2 screenshots. The CTA replaces them, the client approves, and the GKA publishes to Global.

## Screen descriptions

Each screen follows the same frame: header with context, left nav, page title + one-line help (the existing `PageHelp` pattern), main area. Every list has empty, loading, and error states. Every destructive or publishing action asks for confirmation that names the object and context.

### 1. Login and client/context selection
- Centered card: product name, "Sign in with Microsoft". Guests get a note: "Use the account your organization was invited with."
- After sign-in: if the user has exactly one client and no platform roles, go straight there. Otherwise show a **context picker**: cards for each client (name, logo, role badges, last visited), plus "Global Context" and "Shared/Restricted Context" cards for GKAs. Learner-only users skip this and land on My training.
- Empty state for guests with no memberships: "Your access hasn't been set up yet," with the support contact.

### 2. Administrator home dashboard
- In Client Context: tiles for **Readiness** (modules by status), **In review** (my assigned reviews, overdue reviews), **Jobs** (running, awaiting input), **Change impacts** (open), **LMS** (overdue learners, completion this month), and **Coverage** (lowest three areas with the calculation date).
- In Global Context: Pending Classification count, promotion requests, assets due for review, enterprise coverage.
- Platform Admin home: system health, failed jobs, AI provider status, recent privileged actions.
- Every number links to the filtered list behind it.

### 3. Client setup wizard
- Left: step list with completion ticks (Profile, SAP landscape, Organization, Branding, Governance, Review). Right: the form for the current step. Bottom: Back / Save & continue.
- Organization step: editable tables for workstreams, business roles, and glossary, with "Import from file" (CSV/XLSX) for each.
- Governance step: max classification (dropdown, capped at the environment ceiling), AI providers (checkboxes with each provider's ceiling shown), approval stages, accessibility notes, support contact.
- Review step: summary with edit links; "Activate client" is disabled until required fields are complete.

### 4. Role and Learning Journey setup
- Two tabs. **Roles to training:** a matrix grid (business roles × modules) with cells set to required/optional/blank. The AI proposal appears as a highlighted draft layer with Accept / Edit / Discard per cell and an overall Approve button.
- **Structure:** a tree on the left (Program → Journey → Course → Module) with drag-to-reorder. The right pane shows details for the selected node: title, audience, objectives, prerequisites, linked Knowledge Assets ("Link asset" opens library search), and module readiness badge.

### 5. Enterprise Knowledge Library
- Top: search box + filter bar (scope, product, process, workstream, role, Fiori app, transaction, type, statuses, dates) + saved searches.
- Results table: name, scope badge, classification, approval, lifecycle, AI-use, version, owner, next review. Row click opens the **asset drawer** with tabs: Overview (metadata, edit), Versions (history, compare), Content (extracted text with locators, extracted items), Usage (linked training, outputs citing it), Relationships (supersedes, duplicates).
- Actions by permission: Upload new version, Edit metadata, Change AI use, Approve, Supersede, Propose for Global.

### 6. Knowledge Coverage and Gap Analysis dashboard
- Selector: subject type (workstream, process, product, role, domain) + subject.
- Header card: the score with "how this is calculated" expanded by default the first time. It shows the formula, a weights table, factors excluded as not calculable, and the calculation date. A "Recalculate" button (rate-limited).
- Factor rows: name, weight, score bar, evidence count ("3 of 5 processes"), Missing (n) link.
- Gap panel: list of missing items, each with its action button (Upload Missing Document, Assign SME, Request Client Documentation, Generate Draft, …). Assigned actions show owner and due date.

### 7. Source upload center
- Large drop zone ("Drop files or browse", accepted types listed) and the active context shown prominently: "These files will be **Client-Specific to Meridian Aerostructures** and **Client Confidential**."
- Upload queue: per file, a progress pipeline (Uploading → Scanning → Extracting → Checking duplicates → Ready) with status icons.
- Duplicate resolution card inline when found: reason + side-by-side preview + five buttons.
- Ready files: a metadata form prefilled from extraction (type, product, process, apps, transactions, workstream, roles, dates) with "Apply to all selected" for batches. Defaults are locked unless the user's role allows changing them, with a tooltip explaining why.

### 8. Training Generation wizard
- Steps: Context (pre-filled) → Structure (pick journey/course/module/process) → Sources (eligible list with authority tier, status, and AI-use; excluded list with reasons; authorization prompt for human-approval-required assets) → Outputs (checkbox cards for Job Aid, PowerPoint, Assessment, HTML; later types greyed with "coming later") → Configure (audience, level, duration, detail, transactional/conceptual slider, branding preview, screenshot source, accessibility options, assessment count/types/difficulty/passing score/attempts default, language fixed to English) → Review (readiness status + summary) → Generate.
- If readiness is Generation Blocked, the Generate button is replaced by the blocking reasons and links to fix them.

### 9. Generation progress screen
- Vertical stepper of the §19 statuses with timestamps; the current step is animated (static when reduced motion is on).
- Right panel: live warnings, conflicts found, and gaps found.
- **Awaiting User Input** panel: each question with the cited sources side by side and answer options ("Use Source A", "Use Source B", "Write the correct rule"), assigned to the SME with a "Notify" button.
- On completion: output cards (type, warnings count) with "Open in editor".

### 10. Content editing workspace
- Three columns. Left: outline (lessons/sections/blocks or slides). Center: the editor for the selected output type (document blocks, slide editor with a notes pane, or assessment item editor). Right: **Sources and labels** panel for the selected block (provenance label, citations that open the source at its locator, and "Change citation").
- Top bar: output switcher (Job Aid / Deck / Assessment / HTML for this module), version selector, Compare, "Propose change to shared model", Preview, Submit for review.
- Label chips appear inline on blocks (Conflict and Missing are prominent). Track-changes view toggle.
- A banner when the shared model has changed since this version was rendered.

### 11. Screenshot capture and annotation workspace
- Library grid filtered by process/app/step with sensitivity and "generic" badges.
- Editor: canvas with tools (crop, rectangle, arrow, text, step number, redact) and an undo history. The right panel holds metadata (environment, app/transaction, role, capture date, sensitivity) and "Used in" list.
- Actions: Save as new version, Replace in outputs (choose outputs; asks for the reason), Mark as generic (GKA only, Global).

### 12. Review and commenting workspace
- Read-only render of the output with comment highlights. Selecting text or a block opens a comment composer: category, priority, required/optional, and an assignee suggestion.
- Right panel: comment threads, filterable by status and category, with status controls by role (Resolve, Verify, Reopen).
- Section approvals: tick per section. Bottom bar: overall decision (Approve / Conditionally approve with conditions / Reject with reason).

### 13. Approval dashboard
- Queue table: output, module, type, stage, waiting on (people/rules), open required comments, conflicts, accessibility status, age.
- Row expands to an approval checklist: each rule with ✅/❌, plus blockers with links. "Approve" is enabled only when the checklist is all green or waived.
- Tabs: Awaiting me, Awaiting others, Recently approved, Rejected.

### 14. Client content library
- Search + filters (§23 list) + views: All, Favorites, Recent, Assigned reviews, Needs validation, Due for review, Archived.
- Cards or table rows per output: type icon, title, module, status, version, published version, last changed. The detail page has tabs: Versions, Manifest (the full Generation Manifest and events), Reviews, Publications, Change impacts, Downloads.

### 15. LMS administration dashboard
- KPI row: active learners, enrollments, completion % (formula on hover), overdue, average score, all for the selected period.
- Overdue table with bulk "Send reminder", and a resets queue (Requires Retake). Recent publications available for assignment.

### 16. Learner assignment screen
- Step 1, *What*: search published modules, courses, and journeys (only versions allowing new assignments).
- Step 2, *Who*: learners, groups, or business roles, with a live count of people who'll be enrolled.
- Step 3, *Terms*: required/optional, due date or "days after enrollment", recertify every N months, **max attempts** (blank = unlimited).
- Step 4: review with any prerequisite warnings, then Assign. Existing assignments list below, with edit/deactivate.

### 17. Learner dashboard
- Welcome line; journey cards with progress ring and percentage; a "Next up" card (recommended module) with a big Launch button.
- Sections: Overdue, Due soon, In progress, Not started, Completed. Each item shows due date, required badge, last score, and attempts left.
- Side area: certificates, recent training, job-aid downloads, and the Help Assistant entry. One column on phones.

### 18. Interactive HTML training player
- Top bar: course title, progress bar, menu button, accessibility controls (text size, contrast, reduced motion, captions), Help Assistant, Exit (bookmarks automatically).
- Left drawer: module/lesson menu with completion ticks. Main: the lesson content with interactive patterns. Bottom: Previous / Next with keyboard shortcuts.
- The completion page lists objectives met, links to the job aid, and references.

### 19. Assessment player
- One question per screen with progress ("Question 4 of 10"), item type instructions, and accessible controls (non-drag alternatives for matching and sequencing).
- Review screen before submit (answered/unanswered). Results show score, pass/fail, per-question feedback per the assessment settings, remediation links back into the course, and attempts remaining.

### 20. Reporting dashboard
- Filter bar (§28). Tabs: Completion, Scores, Question analysis, Journeys, Engagement, Help Assistant.
- Charts with a table toggle for screen-reader users and export buttons (CSV, XLSX, PDF).
- The footer notice on employment decisions is always visible.

### 21. Help Assistant
- Slide-over panel (dashboard and player) with a chat transcript. The mode label is shown at the top (Learner mode / **Internal mode**).
- Answers show numbered citations, each a link opening the module section or job-aid step. Internal mode shows a status chip per citation.
- "Didn't help? Send to support" captures the question and confirms who it went to.

### 22. Security and permission administration
- **Users:** search people; detail shows platform roles and per-client memberships, roles, and work grants (each editable by people allowed to).
- **Roles reference:** the read-only permission matrix from [03](03-security-and-permissions.md#role-permission-matrix).
- **AI providers** (Platform Admin): registry with ceilings and the CUI flag (locked in the commercial environment).
- **Security policies:** session timeout, environment classification ceiling, download watermarking, retention settings (shown as "not set: nothing auto-deletes" until decided).
- **Audit log:** filter by actor, client, action, and date; export.
