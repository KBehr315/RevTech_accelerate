# 03 · Roles, Permissions, Security and Compliance Design

Covers master-prompt §36 items 6 and 10, and the §35 "role-permission matrix" and "security model" deliverables.

## Principles

1. **Postgres decides.** Every permission below is enforced by an RLS policy or a security-definer function. The UI hides what you can't do; it doesn't decide it.
2. **Membership, not context.** Selecting a client in the UI never grants anything. Access comes from `client_memberships`, `work_grants`, and `platform_role_grants`.
3. **Platform roles don't reach into clients.** A Platform Administrator or Global Knowledge Administrator has no access to Client-Specific content unless they also hold a membership in that client (§3).
4. **Restrictive by default.** New uploads, new memberships, new providers, and new clients all start at the most restrictive setting. Any ambiguity affecting isolation, AI use, compliance, or publication goes to the restrictive side and is logged as a product-owner question.
5. **Every state change is audited.** Commands write `audit_events` in the same transaction as the change.

## Role-permission matrix

Legend: ✅ allowed · 🔸 only within their `work_grants` · 👁 read only · — no access.
"Client X" columns assume membership in Client X. Nobody has any access to a client they are not a member of.

### Platform and knowledge governance

| Capability | Platform Admin | Global Knowledge Admin | Client Training Admin | LMS Admin | Contributor | Reviewer | Learner |
|---|---|---|---|---|---|---|---|
| Configure SSO/MFA policy, integrations, AI providers, storage, retention | ✅ | — | — | — | — | — | — |
| Grant platform roles | ✅ | — | — | — | — | — | — |
| Create a client workspace | ✅ | — | ✅¹ | — | — | — | — |
| View platform audit log (admin activity) | ✅ | — | — | — | — | — | — |
| Read Global library | 👁 | ✅ | 👁 | — | 👁 | 👁 | — |
| Create/edit/approve Global assets | — | ✅ | — | — | — | — | — |
| Manage Shared/Restricted assets and audiences | — | ✅ | — | — | — | — | — |
| Read Shared/Restricted assets | — | ✅ | 👁² | — | 👁² | 👁² | — |
| Classify Pending Classification uploads | — | ✅ | — | — | — | — | — |
| Decide promotion to Global | — | ✅³ | — | — | — | — | — |
| Configure Knowledge Coverage factors and default weights | — | ✅ | — | — | — | — | — |
| View enterprise Knowledge Coverage (aggregate, no client content) | — | ✅ | — | — | — | — | — |

¹ Client Training Administrators may create clients only if a Platform Administrator granted them `can_create_clients`; they become the first Client Training Administrator of the new client.
² Only assets whose audience includes the client they are working in.
³ Plus any extra security/legal/client approvals the request's findings require (§24).

### Within Client X

| Capability | Client Training Admin | LMS Admin | Contributor | Reviewer | Learner |
|---|---|---|---|---|---|
| Edit client profile, branding, terminology, workstreams, business roles | ✅ | — | — | — | — |
| Manage memberships and work grants | ✅ | learners only | — | — | — |
| Approve role-to-training matrix | ✅ | — | — | — | — |
| Upload Client-Specific sources | ✅ | — | 🔸 | — | — |
| Set classification, AI-use, approval on Client-Specific assets | ✅ | — | — | — | — |
| Authorize "Human Approval Required" assets for a job | ✅ | — | — | — | — |
| Search knowledge (Global + allowed Shared + this client) | ✅ | — | 🔸⁴ | 🔸⁴ | — |
| Create programs, journeys, courses, modules | ✅ | — | 🔸 modules | — | — |
| Start generation jobs | ✅ | — | 🔸 | — | — |
| Edit draft outputs | ✅ | — | 🔸 | — | — |
| Comment on outputs | ✅ | — | 🔸 | 🔸 | — |
| Make review decisions | ✅ | — | — | 🔸 | — |
| Approve outputs (per approval rules) | ✅ | — | — | if named in rule | — |
| Publish / withdraw | ✅ | — | — | — | — |
| Download outputs | ✅ | 👁 published | 🔸 | 🔸 | published job aids if allowed |
| Propose for Global | ✅ | — | — | — | — |
| View client audit history | ✅ | 👁 LMS events | — | — | — |
| Manage learners, groups, assignments, due dates, recertification | — | ✅ | — | — | — |
| View learner scores and reports | ✅ | ✅ | — | — | own only |
| Take assigned training, see own status and scores | — | — | — | — | ✅ |
| Learner Help Assistant | — | — | — | — | ✅ |
| Internal assistant (drafts + sources, labeled) | ✅ | — | 🔸 | — | — |

⁴ Contributors and Reviewers see Client-Specific knowledge only for the workstreams/modules in their grants. Global and allowed Shared content is visible to them for reference.

**Score visibility** (your decision): the learner, LMS Administrators, and Client Training Administrators. No manager visibility in the MVP, so no manager data is collected. Reports never feed employment decisions (§28); the reporting screens say so.

## How the matrix is enforced

- Helper functions, all `security definer`, `stable`, reading only membership tables: `is_platform_admin()`, `is_global_knowledge_admin()`, `has_client_role(client_id, role)`, `has_work_grant(client_id, target_type, target_id, capacity)`, `can_read_asset(asset_id)`, `can_use_asset_for_ai(asset_version_id, job_id)`.
- Every table has RLS enabled and **no** policy that allows "any authenticated user".
- Sensitive transitions (approve, publish, promote, classify, authorize AI use, score an attempt) are only possible through security-definer functions that re-check permission and write the audit event. Direct UPDATEs of status columns are blocked by column-level grants.
- **Tests:** for every table, a generated test matrix runs each role (member of A, member of B, platform admin without membership, guest with no membership) against each operation and asserts the expected allow/deny. CI fails on any unexpected allow.

## Identity and sessions

- Microsoft Entra ID for everyone. RevTech staff are tenant members; client users are **B2B guests** invited into the RevTech tenant. A guest's first sign-in creates a profile with no memberships, so they see nothing until a Client Training Administrator or LMS Administrator adds them.
- MFA via Entra Conditional Access for members and guests (configured by RevTech IT, documented in the runbook).
- Short sessions: the API-minted database token lives 2 minutes (as today); the SPA re-acquires the Microsoft token silently; idle timeout configurable by Platform Administrators (default 30 min for admin roles).
- Deactivating a profile or removing a membership takes effect within the profile cache window (60 s today; reduce to 15 s, or invalidate on change).
- Learner course-player launches use a separate, narrow launch token scoped to one enrollment and publication.

## Data protection

| Control | Design |
|---|---|
| Encryption in transit | TLS everywhere; PostgREST and Postgres on private network only. |
| Encryption at rest | Platform-managed keys on Postgres and Blob by default; customer-managed keys (Key Vault) as a per-deployment option, required before CUI. |
| Malware scanning | Defender for Storage on upload; extraction waits for `scan_status = clean`. |
| Sensitive-data detection | On ingest, a detector (pattern rules + optional AI pass within the provider rules) flags PII, credentials, export-control markings, and CUI banners. A flagged file stays `draft` with `not_approved` AI use until a Client Training Administrator reviews it. |
| Classification ceiling | Each environment has a maximum classification. **In the commercial environment, uploads marked or detected as `Controlled` or `Export Controlled` are rejected** with a clear message. This holds until the Government-ready deployment exists (your "yes, eventually" decision). |
| Screenshot redaction | Redaction is applied to the stored image (burned in), not as an overlay; the unredacted original is kept only if the client allows it, with tighter access. |
| Controlled downloads | Downloads go through the API, are logged, and carry a classification footer/watermark on DOCX/PDF/PPTX outputs. Share links expire and can be revoked. |
| Secrets | Key Vault + managed identity; nothing in code or images. |
| Backup / recovery | Postgres PITR (35 days), Blob versioning + soft delete; restore runbook tested quarterly in staging. |
| Retention | Configurable per data class (learner records, audit logs, source files, outputs, superseded training). **Values are a product-owner decision**; until set, nothing is auto-deleted. |
| Environment separation | Separate resource groups, databases, and storage per environment; production on its own Postgres server. |
| Admin activity reporting | Platform audit view and a monthly export of privileged actions. |

## AI-specific controls

- The model gateway refuses any call whose highest-classification input exceeds both the provider's approved ceiling and the client's allowed providers ([01-architecture.md](01-architecture.md#the-model-gateway)).
- No provider is marked CUI/export-control-approved in the commercial environment.
- Retrieval for generation runs as the initiating user, so RLS removes anything they couldn't open themselves.
- Assets with `ai_use = not_approved` are excluded from embeddings entirely: they never leave the database for an embedding call.
- Prompt and completion bodies for client work are stored in the client's rows, so they are covered by its retention and isolation.

## Compliance posture

The design is meant to *support* client obligations under CMMC, NIST SP 800-171, FAR/DFARS, ITAR/EAR, Section 508 and WCAG. It does not make the platform compliant or certified. The table maps design elements to the control areas they help with, to make a future assessment easier. It is not an assessment.

| Area | Design elements that help |
|---|---|
| Access control (800-171 3.1) | RLS, least-privilege roles, work grants, session timeouts, guest isolation |
| Audit (3.3) | Append-only audit events, off-database copy, admin activity reports |
| Identification & authentication (3.5) | Entra ID, MFA via Conditional Access |
| Media protection / data at rest (3.8, 3.13) | Encryption, CMK option, controlled downloads, classification ceiling |
| System & communications protection (3.13) | Private networking, TLS, AI gateway boundary |
| Export control | Classification ceiling, detection on ingest, no unapproved AI transfer, Government-ready deployment path |
| Section 508 / WCAG 2.1 AA | See [06-lms.md](06-lms.md#accessibility) and the accessibility gate in [05-content-generator.md](05-content-generator.md) |

Before handling CUI, the plan needs: a dedicated Government-cloud deployment, a System Security Plan, an assessment by qualified people, and a written authorization for each AI provider that will process CUI. These are tracked in the roadmap as Phase 5 entry criteria.
