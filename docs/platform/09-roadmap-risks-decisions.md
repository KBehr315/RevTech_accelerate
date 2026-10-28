# 09 · Roadmap, Effort, Build-vs-Buy, Testing, Risks and Product-Owner Decisions

Covers master-prompt §36 items 17–19 and the §35 deliverables for implementation roadmap, future releases, effort, technical and compliance risks, build-versus-buy, testing strategy, and deployment strategy.

## Phased implementation roadmap

Team assumption: **one person directing Claude Code**, no fixed demo date. Estimates are focused working weeks. They are rough (±30%) and assume the product-owner questions below get answered as their phase starts. Each phase ends with something demoable on the preview environment using the fictional FI/CO client.

| Phase | Scope | Exit demo | Est. weeks |
|---|---|---|---|
| **0 · Foundations** | Export and archive compliance data; new identity/tenancy/role schema with RLS and the isolation test harness; server → TypeScript; audit log; Blob storage; worker + job queue; model gateway skeleton; Bicep for preview; context switcher and new shell; client setup wizard; fictional Meridian Aerostructures seed | Two demo clients; switching context; proof that one can't see the other | 4–5 |
| **1 · Knowledge** | Upload center, malware scan, classification ceiling, extraction (all MVP formats), chunks + embeddings, duplicate detection, metadata and versions, Global/Shared/Pending libraries, hybrid search, asset drawer | Upload the FI test scripts, see duplicates caught, search with citations | 4–5 |
| **2 · Generation** | Readiness; pipeline steps; conflict and gap handling with Awaiting User Input; content model; Job Aid, Assessment, HTML course player, PPTX renderers; manifests; progress screen; editing workspace with versions and diffs | Generate all four outputs for "Post a General Journal Entry," resolve a conflict, edit | 7–9 |
| **3 · Review & publish** | Review workspace, comments, approval rules and gate, accessibility gate, publications, downloads with watermark, Standalone HTML + SCORM 1.2 packages | Approve and publish; SCORM zip runs in SCORM Cloud | 3–4 |
| **4 · LMS** | Learners (CSV import, guest invites), groups, assignments with max attempts, enrollments, learner dashboard, player and assessment integration, resets, email reminders, certificates, reports and exports, Help Assistant (both modes) | Guest learner completes a journey; LMSA runs reports | 5–6 |
| **5 · MVP completion** | Knowledge Coverage dashboard, change-impact analysis, Propose-for-Global, screenshot annotation workspace, staging + production environments on a dedicated Postgres server, security hardening, accessibility audit, runbooks | Full journey 1–8 in [08](08-screens-and-journeys.md#end-to-end-user-journeys) | 4–5 |
| | | **MVP total** | **~27–34 weeks** |

A walking skeleton is possible earlier: a thin cut of phases 0–4 (one client, upload → job aid + assessment → approve → assign → learner completes) in about 10–12 weeks, if an early client demo becomes useful. That would mean postponing PPTX, duplicate stages 3–4, coverage, and reminders.

### Future releases

| Release | Contents |
|---|---|
| R2 | Instructor and Participant Guides, Knowledge Check output; client PowerPoint masters; SCORM 2004 and cmi5/xAPI (with an LRS); Entra group sync; live Power BI connector; Dassian content and Dassian Validation agent |
| R3 | SAP screenshot automation (Playwright on Fiori, non-production, dry-run first); test-tool and Enable Now import adapters; client-system evidence (tier 2) |
| R4 | Government deployment (Azure Government, CMK, SSP, assessment, CUI-authorized AI provider); per-client dedicated deployment tooling |
| Later | Multilingual generation; ILT/VILT; simulations; HR/identity and client API connectors; Viva Learning |

## Build versus buy

| Capability | Decision | Reasoning |
|---|---|---|
| LMS core | **Build** (extend existing) | The spec needs tight coupling with content versions, manifests, client isolation, and the assistant. A commercial LMS would hold learner data outside our isolation model. Clients that have an LMS get SCORM. |
| SCORM runtime/packaging | **Build** (1.2); consider buying for 2004/cmi5 | 1.2 is small; Rustici components or SCORM Cloud are worth evaluating when 2004/cmi5 are needed. Use SCORM Cloud for conformance testing now. |
| LRS (xAPI) | **Buy/host** when needed | Not MVP. |
| Search | **Postgres** now | Keeps search inside RLS. Azure AI Search later if needed. |
| Document parsing | **Open source**; OCR via a service behind the gateway | Keeps files inside our boundary. |
| Office output generation | **Open source** (`docx`, `pptxgenjs`) | Mature and produces native editable files. |
| Rich-text editor | **TipTap** (open source core) | Collaboration add-ons are not needed for the MVP. |
| Malware scanning | **Buy**: Defender for Storage | Managed, integrates with Blob. |
| Email | **Buy**: Azure Communication Services | Already in Azure. |
| Identity | **Buy**: Entra ID | Existing. |
| AI models | **Buy** (providers via gateway) | Swappable by design. |
| Accessibility checking | **Open source** axe-core + manual review | Industry standard. |
| Screenshot automation | **Build on Playwright** (R3), evaluate clients' existing tools | Fiori is a web app; existing tools vary by client. |

## Testing strategy

| Layer | What | Tooling |
|---|---|---|
| Isolation | Every table × every role × every operation, including cross-client and no-membership cases; storage path and download authorization tests | SQL tests run against a disposable Postgres in CI |
| Security functions | Approve, publish, promote, score, authorize, and reset functions, positive and negative | SQL tests |
| API | Command endpoints: validation, permission, audit written, idempotency | Vitest + supertest against docker-compose stack |
| AI pipeline | Each step with **recorded fixtures** (stored model responses) so tests are deterministic and free; grounding rules (labels, citations, conflicts, no unsupported questions) asserted on outputs | Vitest |
| AI quality | Small evaluation set of FI/CO modules scored on citation accuracy, label correctness, and coverage; run on demand and before switching providers or prompt versions | Script + report |
| Renderers | Generated DOCX/PPTX open and validate; speaker notes present; job aid ≤ 2 pages; SCORM zip validated in SCORM Cloud | Vitest + manual check per release |
| UI | Components and pages | Vitest + React Testing Library |
| End to end | Journeys 1–8 on seeded fictional data, with axe assertions on every page | Playwright |
| Manual | Screen-reader pass, exploratory security review before real client data | Checklist per release |

CI gates the deploy: unit + SQL + API tests must pass before the image is built; e2e runs against preview after deploy and blocks promotion to staging and production.

## Deployment strategy

- Environments and isolation as in [01-architecture.md](01-architecture.md#environments-and-deployment).
- Bicep templates per environment; GitHub Actions with OIDC deploy to preview from `master`, then to staging and production on a release tag with a manual approval.
- Migrations run as a job before the app update (as today). Every migration must be backward-compatible with the previous app version, so a rollback is "redeploy the previous image."
- The worker deploys with the same image; it finishes its current job before shutdown, and a job abandoned mid-run is reclaimed after its lock times out.
- **Before any real client data:** production on its own Postgres server and storage account, Conditional Access MFA confirmed for guests, backups restore-tested, and a security review completed.

## Risk register

| # | Risk | Type | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| R1 | An RLS gap exposes one client's data to another | Technical/compliance | Medium | Severe | No permissive policies; generated per-table isolation tests in CI; security-definer helpers reviewed; external penetration test before real data |
| R2 | Client data sent to an AI provider not approved for it | Compliance | Medium | Severe | Gateway classification check on every call; per-client provider allowlist defaulting to none; `ai_calls` audit; no CUI flag in commercial |
| R3 | AI invents or genericizes client steps | Product/quality | High | High | Label rules enforced in code; citation verification; conflicts surfaced; SME approval required for client steps; eval set |
| R4 | Controlled or export-controlled content uploaded to commercial environment | Compliance | Medium | Severe | Environment classification ceiling; marking and pattern detection on ingest; user attestation on upload; incident runbook |
| R5 | Shared Postgres server with RevelationHub before production | Technical/compliance | Certain today | High | Dedicated server for staging and production (Phase 5 gate); preview holds fictional data only |
| R6 | Scope is very large for one builder | Delivery | High | High | Phased plan with demoable exits; walking-skeleton option; defer non-MVP output types; reuse existing code |
| R7 | Extraction quality from messy client documents (scanned PDFs, complex tables) | Technical | High | Medium | Locator-precise chunks; OCR fallback; extraction review screen; readiness flags thin sources |
| R8 | PPTX/DOCX fidelity and accessibility (reading order, alt text) | Technical | Medium | Medium | House template designed for generation; QA checks; manual review checklist |
| R9 | SCORM behavior differs across client LMSs | Technical | Medium | Medium | Conformance testing in SCORM Cloud; conservative 1.2 usage; documented status mapping |
| R10 | Guest identity edge cases (missing email claim, external MFA, redemption) | Technical | Medium | Medium | Claim fallbacks; Conditional Access for guests; guest onboarding runbook |
| R11 | Copyright/licensing of SAP, Dassian, and regulatory reference content in Global library | Legal | Medium | High | Store only content RevTech is licensed to use; `citation_allowed` and source org on each asset; demo uses original summaries |
| R12 | Model provider changes, price, or availability (incl. in Government regions) | Technical/commercial | Medium | Medium | Gateway abstraction; eval set to qualify a new provider; record model versions in manifests |
| R13 | Over-trust in coverage/readiness numbers | Product | Medium | Medium | Numbers only with explanations; "not calculable" instead of guesses |
| R14 | Assessment results misused for HR decisions | Compliance/ethics | Low | High | No manager visibility; notice on reports; no automated actions on scores |
| R15 | Service availability gaps in Azure Government (Container Apps features, pgvector, Defender malware scanning, ACS Email, chosen AI) | Technical | Medium | High | Verification spike before R4; keep to portable services; alternatives listed per service |
| R16 | Retention undecided → either over-retention or accidental loss | Compliance | Medium | Medium | Nothing auto-deletes until decided; retention settings built in Phase 5 |

## Product-owner decisions

### Decided (2026-10-26)

| Question (§37 #) | Decision |
|---|---|
| Fate of the existing compliance LMS | Retired; code is the base, data not migrated |
| Tenancy (1) | Not final → row-level isolation now, designed to move a client to a dedicated deployment later |
| CUI / export-controlled (2) | Yes, eventually → commercial Azure now with a classification ceiling; Government-ready design |
| Azure Government (3) | Required eventually (implied by 2) → R4 |
| MVP SAP workstreams (5) | Finance (FI/CO) |
| First LMS (7) | Custom (extend existing) + SCORM 1.2 export in MVP |
| Multilingual (10) | English only for MVP |
| External reviewer/learner sign-in (11) | B2B guests in RevTech's Entra |
| Scale, year one (12) | ≤ 50 clients, ≤ 10,000 learners |
| PowerPoint masters (14) | RevTech template with client branding for MVP |
| Internal assistant scope (15) | May search drafts and sources, clearly labeled |
| Client vs SAP conflict adjudication (16) | An SME reviewer decides and records why |
| Score visibility (17) | Learner, LMS Administrator, Client Training Administrator |
| AI provider | Swappable gateway; provider is configuration |
| Email reminders | In MVP |
| Attempts | Set by the LMS Administrator per assignment |
| Builder | One person + Claude Code; no fixed demo date |
| First AI provider in preview | Claude via the Anthropic API (fictional data only; revisit Bedrock/Azure-hosted Claude before real client data) |
| Demo client | Fictional "Meridian Aerostructures", FI/CO |
| Preview deployment | Phase 0 deploys to accelerate.revtech.consulting, replacing the compliance app; its data is dropped without export |
| Second demo client | Fictional "Calder Defense Systems" (FI, subcontractor), to show switching and isolation |
| Malware scanning | Not used: Kelly treats uploaded files as clean. Scanning stays off in preview (uploads labeled "Not scanned"), and the library accepts only formats without macros or executables (DOCX, PPTX, XLSX, PDF, PNG, JPG, TXT, CSV). Defender for Storage support stays in the code, switched off; turning scanning off outside preview needs a migration, to be revisited before real client files |
| Embeddings (semantic search) | Azure OpenAI in RevTech's own Azure subscription, so text stays inside RevTech's tenant |
| OCR (scans, screenshots) | Claude through the model gateway, with the same classification and client-provider checks as every AI call. New uploads are read straight away: transcription for search is not use in training, so it does not wait for the asset's AI-use approval. Text read this way is labeled "read by AI" |
| Tuning extraction | On what Kelly sees in the Library after uploading; no local sample folder |
| Phase 1 demo files | Kelly provides sample documents; preview holds no real client data, so they are fictionalized first |
| Library buckets | Four: **Global** (every client), **Shared** (a chosen set of clients or client groups), **Client** (one client), and **RevTech Reference** (RevTech administrators only; never shown to any client). Every document sits in exactly one bucket, or in Pending until it is placed |
| Client document into RevTech Reference | **Copied**, never moved: the client keeps its file, and RevTech Reference holds its own copy linked back to the original |
| AI use of RevTech Reference | Searched first when generating training for any client. Content, structure and approach may all be reused; the source client's names and data must not appear. Generation replaces them, and a leak check flags any name, identifier or figure from the source client in another client's draft before review |
| Search results | Grouped by document: each file appears once, with its best matches beneath |

### Still open, needed by phase

| Needed by | Question (§37 #) | Default until decided |
|---|---|---|
| Phase 1 | Which SAP/Dassian reference content is RevTech licensed to load into Global? | Original summaries only |
| Phase 2 | Which Coverage/Readiness factors are mandatory vs configurable (20)? | All configurable, none mandatory, readiness factors default to "warns" except process documentation (blocks) |
| Phase 2 | Can client administrators create their own templates (13)? | No |
| Phase 3 | Which RevTech Hub interaction patterns are required, and does RevTech own reusable components (9)? | Original components only |
| Phase 5 | Exact rules and control owners for promotion to Global (19) | GKA + client approval always required |
| Phase 5 | Retention periods (18) | Nothing auto-deletes |
| R2 | Which Dassian products first (4)? | — |
| R3 | Screenshot automation method (6) | Manual only |
| Later | ILT/VILT (8) | Not included |
