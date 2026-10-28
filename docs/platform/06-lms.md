# 06 · Component 3: Learning Management and Training Delivery System

Covers master-prompt §25–§28 and §30, and §36 item 13 (LMS standards and integration). Built on the retired compliance LMS's patterns: server-side scoring, hidden answer keys, derived status, and the player.

## What changes from the compliance LMS

| Compliance LMS (retired) | Platform LMS |
|---|---|
| One organization; `admin` / `employee` | Per-client; LMS Administrator and Learner roles in each client workspace |
| Modules authored directly in the LMS | Only **published, approved output versions** are deliverable. The LMS never edits content. |
| Assign a module to a person | Assign a **module, course, or learning journey** to a **person, group, or business role**; groups and roles stay linked, so new members get enrolled |
| One ongoing assignment, renewal by retaking | Enrollments with due dates, required/optional, prerequisites, sequence, recertification interval, **max attempts set by the admin on each assignment** |
| Attempts tied to the module (content could change underneath) | Attempts pinned to the exact **publication** (output version) taken; history survives content changes |
| Embedded external content + "mark as viewed" | Platform course player with real progress and interaction tracking; SCORM 1.2 export for clients' own LMSs |
| No email, no import/export | Email reminders, CSV learner import, XLSX/CSV/PDF report export |

## Assignment model

- An **assignment** is a rule: *who* (learner, learner group, or business role) × *what* (module, course, or journey) × *terms* (required, due date or "N days after enrollment", recertify every N months, **max attempts**: blank means unlimited).
- The worker materializes **enrollments** (one per learner per item) whenever assignments, group membership, role mapping, or client membership change. Removing someone from a group ends their *future* obligations but never deletes records.
- Journeys expand into enrollments for each item, with prerequisites and sequence enforced at launch ("Complete *Navigating Fiori* first").
- Superseded content: if a Client Training Administrator turns off "allow new assignments" on an old publication, new enrollments get the new version. Existing in-progress learners finish on the version they started. "Retraining required" re-enrolls people who completed the old version.

### Enrollment status (§26)

Derived on read, like today's `assignment_status` view, with one stored exception (Requires Retake, which needs a reset):

| Status | Rule |
|---|---|
| Not Started | No attempt |
| In Progress | Open attempt, not past due |
| Overdue | Not passed/completed and past due, or recertification date passed |
| Passed | Latest completed attempt passed (items with an assessment) |
| Failed | Latest completed attempt failed, attempts remain |
| Requires Retake | Failed and `max_attempts` reached; an LMS Administrator **reset** clears it (audited) |
| Completed | Item with no assessment, all required content viewed |

## Learner experience

Responsive dashboard (desktop, tablet, phone):

- Welcome and the active journey(s) with objectives and a completion percentage, calculated as completed required items ÷ required items, with that formula shown on hover.
- Cards grouped by status: overdue first, then due soon, in progress, not started, completed.
- Each card shows due date, required/optional, last score (learners always see their own), attempts remaining, and a **Launch** button.
- Recommended next module: the first unmet required item in journey sequence whose prerequisites are met.
- Certificates (PDF) for completed enrollments; recent training; downloads of job aids where the publication allows it.
- The Help Assistant is available from the dashboard and inside the player.

Client learners are B2B guests. Their first sign-in shows "Your training will appear here once your administrator assigns it" until they are enrolled.

## Course and assessment player

- One React bundle renders a course JSON ([05-content-generator.md](05-content-generator.md#outputs-mvp)). Inside the platform it reports progress to our API. Inside a SCORM package it reports through a SCORM 1.2 adapter. Standalone HTML runs with local-only progress.
- Bookmarking: resume at the last section; stored in the attempt (`bookmark`) or `cmi.suspend_data` in SCORM.
- Assessment: questions are served without answer keys; scoring runs in a security-definer function (as today) supporting all MVP item types, with partial-credit rules per type configured on the assessment. Remediation and explanations are shown after submission according to the assessment's feedback setting.
- Randomization (item order, option order, drawing N from a bank) is per assessment, recorded on the attempt so results can be reproduced.

## LMS standards and integration approach

| Format | Completion | Score | Bookmark | Interaction detail | Offline | Where the data lives | MVP? |
|---|---|---|---|---|---|---|---|
| **Platform LMS** | ✅ | ✅ | ✅ | ✅ full | No | Our database | ✅ |
| **Standalone HTML** | Learner-visible only | Learner-visible only | Browser-local | None reported | ✅ | Nowhere (no tracking) | ✅ |
| **SCORM 1.2** | `cmi.core.lesson_status` | `cmi.core.score.raw` (0–100) | `cmi.suspend_data` (4,096 chars) | `cmi.interactions` (write-only, limited) | No | The client's LMS | ✅ |
| SCORM 2004 (4th ed.) | Completion and success reported separately | Scaled score | `suspend_data` (64k) | Richer interactions | No | The client's LMS | Later |
| xAPI | Statements | Statements | Via state API | Anything, as statements | Possible (queue and send) | An LRS (theirs or ours) | Later |
| cmi5 | xAPI with defined launch and "moveOn" rules | ✅ | State API | ✅ | Limited | LMS + LRS | Later |

Because SCORM 1.2 has one status field, our package reports `passed`/`failed` when the course has an assessment and `completed` otherwise, and that choice is recorded in the package manifest. Results from a client's own LMS don't come back to our platform. Reports state that SCORM-delivered training is tracked in the client's LMS.

**Integrations:**
- Learner import: CSV (MVP), Entra ID group sync for guests (later), HR/identity and client APIs (later, configurable connectors, not hard-coded).
- Commercial LMS or Microsoft Viva Learning integration: delivered through SCORM/cmi5 packages now, with an API connector later if a client needs completions to flow back.

## Email reminders

- Sent by the worker on a daily schedule through **Azure Communication Services Email** from a RevTech sending domain. Before a Government deployment, confirm that ACS Email is available there or pick an alternative.
- Learners get: assigned, due in 7 days, due in 1 day, overdue (weekly, max 4), and retake available after reset. LMS Administrators get a weekly overdue summary per client.
- Templates are per client (branding and wording), and each client can turn each reminder type on or off. Emails contain no scores and no content, only the item title and a sign-in link.

## Training Help Assistant

| | Learner mode | Internal mode (your decision: drafts and sources allowed) |
|---|---|---|
| Who | Learners | Client Training Administrators; Contributors within grants |
| Searches | Chunks of **currently published** outputs the learner is enrolled in or allowed to browse. Answer keys, review comments, drafts, and superseded versions are not indexed for learners at all. | Everything the user can read, including drafts and source documents |
| Answers | Cites the module or job aid and section with a deep link. States clearly when the answer isn't in their training. | Every citation is labeled **Published**, **Approved source**, **Draft**, **Superseded**, or **AI-generated**, and the header shows "Internal mode" |
| Unanswered | "Send to support" routes the question to the client's designated support contact (configured in client setup) and logs it | Logged for coverage gaps |
| Client steps | Never invents steps. If no published content covers the question, it doesn't answer from general SAP knowledge. | May show SAP reference content, labeled as reference |

The assistant's questions feed reporting (most-asked, unanswered) and Knowledge Coverage gap lists.

## Reporting and analytics

- Filters (§28): client, learner, group, business role, journey, module, course, process, workstream, status, due date, assessment result, date range.
- MVP reports: assignment counts and completion %; on-time vs overdue; average score, pass/fail, attempts; **question-level analysis** (difficulty and most-missed items, which also tell content owners which items or content to fix); journey progress; time to completion; abandonment (started, no activity for N days); Help Assistant usage and unanswered questions.
- Exports: CSV and XLSX (MVP), PDF summary (MVP), and a documented, stable column schema that Power BI can load directly. A live Power BI connector comes later.
- Visible to: Client Training Administrators and LMS Administrators for their clients; learners see only their own results.
- Every reporting screen carries the §28 notice: assessment results must not be used to automate employment, promotion, discipline, or performance decisions. No automated actions are triggered from scores.

## Accessibility

Target: **WCAG 2.1 AA**, as the basis for Section 508 conformance claims that a qualified reviewer would make. The design doesn't claim conformance by itself.

| Area | Approach |
|---|---|
| Platform UI | Radix primitives; visible focus; full keyboard paths; forms with labels and error text tied to inputs; color tokens checked for 4.5:1 contrast; respects `prefers-reduced-motion`; text scales to 200% without loss |
| Course player | Every interactive pattern has a keyboard and screen-reader path. Hotspot screenshots have a list alternative; tabs and accordions follow ARIA patterns; drag-and-drop item types (matching, sequencing) have a non-drag alternative. |
| Generated content | Alt text is generated for every image and **must be reviewed** (the QA step flags any image whose alt text hasn't been human-confirmed). Descriptive link text; captions and transcripts required for any video. |
| PPTX | Reading order set explicitly per slide, titles on every slide, alt text on images, no text in images |
| DOCX/PDF | Real headings and lists; tagged PDF from Chromium; document language set |
| Pre-publication gate | Automated check (axe-core on HTML/player; structure checks on DOCX/PPTX). Failures block approval unless a Client Training Administrator records a waiver with a reason. Issues needing human judgment are listed for the reviewer. |
| Testing | axe assertions in Playwright e2e for every screen; manual screen-reader pass (NVDA + VoiceOver) before each release |
