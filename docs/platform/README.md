# SAP GovCon Training Platform: Design Package

This folder is the design for turning Accelerate into the **SAP Government Contractor Training Platform** described in the [master prompt](master-prompt.md). The master prompt says not to start coding until the architecture, assumptions, security model, MVP scope, source-governance model, and open product decisions are written down (§36). These documents are that write-up. Code starts with Phase 0 of the [roadmap](09-roadmap-risks-decisions.md#phased-implementation-roadmap).

## Executive summary

Accelerate becomes one platform with three components, sharing one database, one identity model, and one permission system:

1. **Enterprise Knowledge Management System.** Holds Global, Shared/Restricted, and Client-Specific knowledge with five independent governance dimensions (scope, classification, lifecycle, approval, AI use). It ingests and indexes client documents, catches duplicates, and measures Knowledge Coverage only where the number can be explained.
2. **AI Training Content Generator.** A fixed pipeline of narrow AI steps, run as the requesting user, so the AI can never use a source that person couldn't open. Every block of generated content carries a provenance label and verified citations. Conflicts between sources go to an SME instead of being silently resolved. Job aids, PowerPoints, assessments, and interactive HTML courses are rendered from one shared content model, reviewed, and approved by people before anything is published.
3. **Learning Management and Training Delivery System.** Built from the retired compliance LMS. It assigns modules, courses, and journeys to client learners (Entra B2B guests), tracks every attempt against the exact published version, sends reminders, reports, exports SCORM 1.2, and offers a Help Assistant that answers only from published training.

Isolation is enforced by Postgres row-level security on every table and tested for every role. AI calls go through a provider-agnostic gateway that refuses to send content above a provider's approved classification. The design runs on the current commercial Azure setup now and is built to move to Azure Government before any CUI or export-controlled data is handled.

The MVP is about **27–34 focused weeks for one person with Claude Code**, in six demoable phases. A thinner walking skeleton is possible in about 10–12 weeks if an early demo becomes useful.

## Assumptions

- The compliance LMS is retired. Its code is reused where it fits; its data is exported once and not migrated.
- All demo data is fictional (client "Meridian Aerostructures", FI/CO). No real client data enters the preview environment.
- RevTech staff are tenant members; client users are B2B guests in the RevTech tenant. MFA is enforced through Entra Conditional Access by RevTech IT.
- The current commercial Azure subscription is used until the Government deployment (R4). Until then, Controlled and Export Controlled content is refused at upload.
- No AI provider is approved for CUI. Which providers may process Client Confidential data is configured per client, and defaults to none.
- English only. RevTech PowerPoint template with client branding.
- One builder plus Claude Code; estimates are ±30%.
- Licensing of SAP, Dassian, and regulatory reference content for the Global library is RevTech's to confirm. Until then, Global reference content is original summaries.
- "Compliance" means the design *supports* client obligations. It is not a certification or legal determination.

## How the documents map to the master prompt

| File | §36 "before coding" items | §35 deliverables |
|---|---|---|
| [README.md](README.md) (this file) | 1 Executive summary · 2 Assumptions | Product requirements document (with 04–07) |
| [01-architecture.md](01-architecture.md) | 3 Architecture · 4 Technology stack | System architecture diagram · Integration architecture · Deployment strategy (with 09) |
| [02-data-model.md](02-data-model.md) | 5 Core entities and relationships | Data model |
| [03-security-and-permissions.md](03-security-and-permissions.md) | 6 Roles and permissions · 10 Security and compliance | Role-permission matrix · Security model · Compliance risks (with 09) |
| [04-knowledge-management.md](04-knowledge-management.md) | Source-governance model · part of 7 Journeys | – |
| [05-content-generator.md](05-content-generator.md) | 11 AI grounding and validation · 12 SAP integration and screenshots | AI agent architecture · Source-grounding strategy |
| [06-lms.md](06-lms.md) | 13 LMS standards and integration | Accessibility strategy |
| [07-mvp-epics-and-acceptance.md](07-mvp-epics-and-acceptance.md) | 8 MVP scope · 9 Deferred · 15 Epics and stories · 16 Acceptance criteria | MVP definition · User stories · Acceptance criteria |
| [08-screens-and-journeys.md](08-screens-and-journeys.md) | 7 End-to-end journeys · 14 Wireframe descriptions | Information architecture · Wireframes (descriptions) · User personas (as journeys) |
| [09-roadmap-risks-decisions.md](09-roadmap-risks-decisions.md) | 17 Roadmap · 18 Risk register · 19 Product-owner decisions | Roadmap · Future releases · Effort · Technical/compliance risks · Build vs buy · Testing strategy |

**Not yet produced:** the clickable prototype and visual wireframes (next, built from 08 against fictional data), and the API specification (generated from code as OpenAPI, see E15.4).

## Changing these documents

Treat the design as code: change it in a pull request, and update the decision log in [09](09-roadmap-risks-decisions.md#product-owner-decisions) when a product-owner decision is made. If a later requirement supersedes the master prompt, record it there with the date and who approved it.
