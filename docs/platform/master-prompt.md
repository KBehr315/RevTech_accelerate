# Master Prompt: SAP Government Contractor Training Platform

Enterprise Knowledge Management + AI Training Content Generation + Learning Management & Delivery.
Completed consolidated specification, October 2026. RevTech training platform concept.

> This is a transcription of `SAP_GovCon_Training_Platform_Master_Prompt.pdf`, the controlling
> product prompt for everything in `docs/platform/`. Numbered lists that restarted mid-document in the
> PDF are renumbered from 1 here; nothing else is changed. If the PDF is revised, update this file
> in the same pull request.

## 1. Product Vision and Objectives

Act as a senior software architect, product manager, UX designer, SAP learning strategist, instructional designer, AI engineer, and government contracting compliance specialist. Design and build a secure, enterprise-grade platform that manages source knowledge, generates editable SAP and Dassian training, supports governed review and approval, publishes interactive learning, and tracks learner completion and assessment results.

The platform is designed primarily for consulting organizations supporting aerospace and defense companies and other government contractors implementing or upgrading to SAP S/4HANA, SAP Fiori, Dassian products, and related enterprise applications. Many clients are implementing S/4HANA and Fiori for the first time or migrating from legacy systems.

The solution must use a secure multi-client architecture, maintain strict client-data isolation, support reusable Global and Shared/Restricted knowledge, preserve Client-Specific configurations and source material, provide explainable AI grounding, require human approval before publication, and produce editable and portable training outputs.

## 2. Platform Components

1. **Enterprise Knowledge Management System** - governs Global, Shared/Restricted, and Client-Specific sources used to create and maintain training.
2. **AI Training Content Generator** - creates editable job aids, PowerPoint presentations, assessments, interactive HTML courses, guides, simulations, and LMS packages from authorized sources.
3. **Learning Management and Training Delivery System** - publishes, assigns, delivers, tracks, and reports on training and learning journeys.

### Canonical Terminology

| Term | Definition |
|---|---|
| Platform | The complete software application. |
| Enterprise Knowledge Management System | The system used to govern Global, Shared/Restricted, and Client-Specific knowledge. |
| AI Training Content Generator | The system used to generate editable training outputs. |
| Learning Management and Training Delivery System | The system used to assign, deliver, track, and report on training. |
| Knowledge Asset | A governed source used to create, validate, or maintain training. |
| Source File | A physical file associated with a Knowledge Asset. |
| Training Output | A generated job aid, presentation, assessment, HTML course, guide, simulation, or LMS package. |
| Client Workspace | The secure environment containing a client's sources, training, users, and records. |
| Learning Journey | An ordered collection of training assigned to a learner population. |
| Course | A structured collection of modules addressing a broader subject. |
| Module | A defined unit of training within a course or learning journey. |
| Lesson | A smaller instructional unit within a module. |
| Content Scope | Global, Shared/Restricted, or Client-Specific. |
| Training Assignment | A requirement or recommendation for a learner to complete training. |
| Generation Manifest | The traceable record of sources, settings, versions, validations, human edits, and AI services used to create an output. |

## 3. Primary Users and Roles

| Role | Primary responsibility |
|---|---|
| Platform Administrator | Technical platform configuration, identity, integrations, system settings, and platform-wide security. |
| Global Knowledge Administrator | Global and Shared/Restricted knowledge governance. |
| Client Training Administrator | Client setup, content generation, review, approval, and publication. |
| LMS Administrator | Learners, assignments, completion rules, delivery, and training reports. |
| Contributor | Development and editing of assigned content. |
| Reviewer | Comments, recommendations, and review decisions. |
| Learner | Completion of assigned training. |

A user may hold multiple roles, but permissions remain logically separate. Use the specific role name rather than the generic term Administrator whenever a permission could affect client isolation, publication, security, or Global content.

### Platform Administrator
- Configure authentication, SSO, MFA, integrations, APIs, storage, security policies, audit settings, environments, retention, system-wide settings, and technical administration.
- Manage platform roles and delegated administration without automatically granting access to client content.

### Global Knowledge Administrator
- Manage the Global Knowledge Library and Shared/Restricted Knowledge Library.
- Approve Global classifications and Shared/Restricted access.
- Review requests to promote Client-Specific content.
- Approve anonymized reusable content and enterprise templates.
- Manage metadata standards, review schedules, source authority rules, duplicates, superseded sources, and enterprise Knowledge Coverage.

### Client Training Administrator
- Create and manage permitted clients and client branding.
- Configure terminology, roles, learning journeys, curricula, workstreams, modules, and templates.
- Upload and classify Client-Specific sources.
- Connect approved client systems.
- Generate, edit, review, approve, download, share, and publish training.
- Assign Contributors and Reviewers, resolve comments, manage versions, and access client audit history.
- Nominate content for Global reuse but not directly expose restricted client content to other clients unless separately authorized.

### Contributor
- Work only within assigned clients, modules, outputs, or knowledge areas.
- Upload authorized sources, create modules, generate and edit assigned content, replace screenshots, respond to comments, and submit work for review.

### Reviewer
- View assigned outputs; annotate content; enter required or optional comments; categorize issues; approve, conditionally approve, or reject; verify resolutions.
- Do not edit approved content unless separately granted Contributor permission.

### LMS Administrator
- Manage learners, groups, assignments, learning journeys, due dates, prerequisites, completion requirements, assessment thresholds, reminders, enrollments, attempts, certificates, and reporting.
- Be assigned independently from Client Training Administrator permissions.

### Learner
- View assigned learning journeys and learning objectives.
- Launch authorized HTML training, complete interactions and assessments, view permitted scores and completion status, download authorized job aids, and access the Help Assistant.

## 4. Multi-Client Architecture

Create a secure multi-tenant architecture with strict separation of client data, configurations, connected systems, training content, users, learner records, reporting, and search results.

- Users performing client-specific work must select a client before uploading sources, generating training, editing client content, initiating review, publishing training, or viewing client analytics.
- Global Knowledge Administrators may access Global context without selecting a client.
- Prominently display the active operating context: Global Context, Shared/Restricted Context, or Client Context: [Client Name].
- Each client workspace contains client profile, branding, terminology, roles, learning journeys, modules, Client-Specific Knowledge Assets, draft/approved outputs, review comments, assignments, integrations, publication history, completion data, and client-specific assistant index.

## 5. Client Setup

Provide a guided Client Setup Wizard that captures the information needed to configure knowledge, generation, review, publishing, delivery, and reporting.

- Client name, industry, government contracting status, SAP environment/version/deployment model, Fiori configuration, Dassian products, and other integrated tools.
- Client terminology, organization structure, business processes, workstreams, business roles, system roles, training audiences, and learning journeys.
- Branding, accessibility requirements, security restrictions, export-control restrictions, data classification, desired outputs, LMS publishing requirements, and approved external references.

Allow upload of role matrices, personas, curriculum structures, process inventories, learning journeys, security roles, training needs, and ownership documents. AI may propose a structured role-to-training matrix, but a Client Training Administrator must approve it.

## 6. Enterprise Knowledge Management

Create an enterprise-level Knowledge Library above individual Client Workspaces so reusable SAP, Dassian, government contracting, instructional design, templates, and general reference materials are maintained once and referenced without duplication.

### Knowledge Hierarchy
- Enterprise Knowledge Library
- Global Knowledge Library
- Shared/Restricted Knowledge Library
- Client-Specific Knowledge Library
- Knowledge Asset
- Knowledge Asset Version
- Knowledge Asset Reference
- Source Relationship
- Generated Output Relationship

### Training Hierarchy
- Client
- Program or Curriculum
- Learning Journey
- Course
- Module
- Lesson
- Activity
- Assessment
- Training Output

Knowledge Assets may be linked to any applicable training level without physically copying the source.

## 7. Knowledge Classification and Security

Keep Content Scope, Security Classification, Lifecycle Status, Approval Status, and AI-Use Permission as separate metadata dimensions.

| Metadata dimension | Values / examples |
|---|---|
| Content Scope | Global; Shared/Restricted; Client-Specific |
| Security Classification | Public; Internal; Confidential; Client Confidential; Controlled; Export Controlled; client-defined |
| Lifecycle Status | Active; Superseded; Expired; Archived |
| Approval Status | Draft; In Review; Changes Requested; Approved; Rejected |
| AI-Use Permission | Approved for AI Generation; Approved for AI Reference; Human Approval Required Before AI Use; Not Approved for AI Use |

Approved for AI Generation means the source may be used to create or modify generated training, subject to citation, security, and access rules. Approved for AI Reference means the source may validate, compare, or identify conflicts but its content must not be directly incorporated without human approval. Human Approval Required Before AI Use requires authorization for each generation request or project. Not Approved for AI Use excludes the source from AI retrieval, prompting, model processing, and generated outputs.

New uploads from a Client Workspace default to Content Scope: Client-Specific; Approval Status: Draft; Lifecycle Status: Active; AI-Use Permission: Human Approval Required Before AI Use. Uploads must never default to Global. Uploads outside a Client Workspace enter Pending Classification and remain unavailable for AI generation until classified and approved.

## 8. Global Knowledge Library

Contains information approved for use across authorized client workspaces. Upload once and reference broadly rather than duplicating files.

- Standard SAP S/4HANA and Fiori documentation
- Approved Dassian documentation
- General government contracting and regulatory references such as FAR/DFARS content where authorized
- Generic business-process and SAP process content
- Reusable organizational training, terminology, templates, instructional design standards, accessibility standards, diagrams, approved media, reusable demonstration screenshots, and standard learning objectives

## 9. Shared/Restricted Knowledge Library

Support reusable knowledge that is authorized only for selected audiences rather than all clients.

- Selected clients or client groups
- Aerospace and defense clients
- Government contractors
- SAP S/4HANA or Fiori clients
- Dassian clients
- Specific products, industries, workstreams, or other defined scopes

## 10. Client-Specific Knowledge Library

Each client maintains an isolated secure knowledge space containing content that applies only to that client.

- Business processes, test scripts, screenshots, configurations, functional specifications, custom applications/transactions, terminology, organizational structures, role mappings, security roles, business rules, process flows, policies, assessments, existing training, branding, and Client-Specific Dassian configurations.

Client-Specific information must never become available to another client unless an authorized promotion workflow is completed and required approvals are obtained.

## 11. Knowledge Metadata and Versioning

Maintain metadata for every Knowledge Asset and independently version Knowledge Asset metadata, Source Files, screenshots, templates, question banks, Learning Journeys, Training Outputs, and LMS packages.

- Name and description
- Content Scope and authorized client groups
- Document/content type
- SAP product/module/process/Fiori application/transaction
- Dassian product
- Workstream, business role, training role, and learning journey
- Source organization, source URL, owner, uploaded by, upload date
- Effective, expiration, last-review, and next-review dates
- Version and approval/lifecycle/security statuses
- Export-control classification
- AI-Use, citation, and screenshot-use permissions
- Associated training outputs

Each Training Output version must retain an immutable Generation Manifest containing sources and source versions, generation configuration, AI services/models used, date and initiating user, prompt/workflow version, validation results, unresolved conflicts, human edits, reviews/approvals, and publication destinations.

## 12. Knowledge Search and Duplicate Detection

Provide one search experience across all knowledge the current user is authorized to access. In Client Context, combine Global + authorized Shared/Restricted + current Client-Specific sources while preserving security boundaries.

Search and filter by client, scope, product, process, module, role, learning journey, Fiori app, transaction, Dassian product, output type, contributor, reviewer, approval/lifecycle status, keyword, version, and dates.

Before accepting a new source, detect potential duplicates using file hash, filename, version metadata, content comparison, metadata, and semantic similarity. Offer: Use Existing Source, View Existing Source, Upload as New Version, Upload as Separate Document, or Cancel.

## 13. Knowledge Coverage and Gap Analysis

Create a Knowledge Coverage Dashboard for Training Directors and authorized Administrators. Knowledge Coverage measures the completeness and quality of validated knowledge for a domain, workstream, process, product, or role. Never manufacture percentages.

- Required processes documented
- Approved source documentation available
- Test scripts available
- Roles mapped
- Transaction/Fiori navigation documented
- Screenshots available
- Business rules and exceptions documented
- Training modules and assessments created
- Validation and SME approval status
- Source currency

Allow configurable weighting and display the calculation, component scores, missing elements, weighting, and calculation date. Selecting a score opens a detailed gap analysis with actions such as Upload Missing Document, Assign SME, Request Client Documentation, Generate Draft, Review Potential Global Source, Propose Client Source for Global Library, Create Test Script, Capture Screenshots, and Create Training Module.

## 14. AI Source Authority and Grounding

Use one authoritative source hierarchy by default:

1. Approved Client-Specific sources
2. Authorized evidence from the client's configured system
3. Approved Client-Specific test scripts
4. Authorized Shared/Restricted sources
5. Approved Dassian documentation
6. Approved SAP documentation
7. Approved government contracting and regulatory references
8. Approved reusable organizational training content
9. Administrator-approved external references
10. AI-generated supplemental recommendations

Source priority does not eliminate the need to consider source currency, approval status, legal authority, system version, or subject-matter applicability. An expired or superseded Client-Specific source must not automatically override a current approved source. Regulatory and contractual requirements may take precedence when applicable. The AI must expose unresolved conflicts and require human validation rather than silently choosing.

Clearly label Client-provided, system-extracted, SAP/Dassian reference, AI-generated, human-validation-required, conflict, and missing-information content. The AI must never silently replace Client-Specific steps with generic steps.

When information is incomplete: identify the gap; search authorized Client-Specific sources; search authorized Shared/Restricted sources; search approved SAP/Dassian sources; propose supplemental content; label it as requiring validation; cite the source; and route it to an appropriate human reviewer.

The AI inherits the initiating user's permissions. If the user cannot access a source, the AI cannot access or use it on the user's behalf.

## 15. Training Readiness

Training Readiness is separate from Knowledge Coverage and measures whether sufficient approved material exists to generate a specific training module. A domain may have strong general coverage while a specific client module is not ready.

- Possible statuses: Ready; Ready with Review Required; Source Gaps Identified; SME Validation Required; Insufficient Information; Generation Blocked.
- Readiness may consider process documentation, roles, test scripts, client terminology, SAP references, screenshots, business rules, learning objectives, approval status, source currency, and unresolved conflicts.
- Every displayed percentage must provide an explainable calculation, weights, missing elements, and date calculated. Administrators can configure which gaps block generation versus create warnings.

## 16. AI Training Content Generator

Allow users to create one or multiple editable Training Outputs from an approved/authorized source set. Each output remains independently version controlled.

Use specialized agents for source ingestion, extraction, role/process analysis, gap detection, SAP/Dassian validation, screenshot handling, instructional design, generation, assessment, accessibility, quality assurance, and publishing.

## 17. Source Inputs and Supported Files

- Secure API connections to authorized SAP environments
- SAP test scripts, SAP Enable Now exports when applicable, SAP Solution Manager documentation, SAP Cloud ALM content
- Dassian documentation
- Process flows, SOPs, business process procedures, configuration documents, functional designs, work instructions
- DOCX, PPTX, XLSX, PDF, PNG, JPG/JPEG, TIFF, SVG, TXT, CSV, HTML, XML, JSON
- Screenshots, images, screen recordings, video transcripts, requirements, role matrices, test results, client branding templates, and existing training

Support drag-and-drop and batch uploads. Extract process steps, navigation paths, transaction codes, Fiori app names, fields, required inputs, outputs, business rules, warnings, prerequisites, roles/responsibilities, exceptions, screenshots, objectives, questions, and source references.

## 18. SAP Integration and Screenshot Capture

When an approved connection exists, allow controlled automation to interpret an approved test script, open required Fiori applications, navigate the process, enter authorized test data, capture screenshots at designated steps, record messages/navigation, mask sensitive data, insert screenshots in outputs, and log automated actions.

Automated navigation and screenshot capture must use an approved automation mechanism and authorized nonproduction identity. Before execution identify target environment, identity, authorization, test data, applications/transactions, data-changing steps, cleanup/rollback needs, screenshot points, and sensitive fields. Support dry-run validation. By default block unattended production execution and activities that create financial, contractual, procurement, workforce, inventory, security, or regulatory consequences.

### Manual Screenshot Override
- Authorized Trainers/Contributors can open an approved client screen, navigate manually, capture selected area/window/full screen, crop, annotate, number steps, redact sensitive data, replace an existing screenshot, insert it into one or more outputs, and record why the automated image was replaced.
- Screenshot library metadata includes client, environment, module/process, Fiori app/transaction, role, capture date, source/version, sensitivity, and usage locations.

Screenshots captured from a client environment default to Client-Specific and Client Confidential. Promotion to Global requires no client data/branding unless authorized, no unique configuration or controlled/personal/export-controlled/proprietary content, appropriate reuse rights, and completion of the promotion workflow. Generic standard demonstration images must be labeled as generic and not represented as the client's configured environment.

## 19. Training Generation Workflow

1. Select Client or operating context.
2. Select training structure: Learning Journey, curriculum, role, workstream, Course, Module, Lesson, process, or transaction.
3. Add sources by upload, authorized Knowledge Assets, or approved system connections.
4. Select one or multiple outputs: Job Aid, PowerPoint, Assessment, Interactive HTML, Instructor Guide, Participant Guide, Simulation, Knowledge Check, or LMS Package.
5. Configure audience, experience level, delivery method, duration, detail, transactional/conceptual emphasis, branding, screenshot source, accessibility, assessment difficulty/passing score, language, and reporting needs.
6. Generate using orchestrated AI agents.
7. Review generated outputs in an editable workspace.
8. Approve through configured workflow.
9. Publish approved content to download, controlled sharing, or LMS delivery.

### Generation Job Status
Queued; Ingesting Sources; Extracting Content; Validating Sources; Analyzing Gaps; Capturing Screens; Generating Content; Performing Quality Review; Awaiting User Input; Completed; Completed with Warnings; Failed; Canceled.

Generation Job Status is separate from Training Output Approval Status.

## 20. Training Outputs

### A. Job Aid
Generate a concise, editable one-to-two-page job aid focused primarily on transactional execution with minimal illustrations. Include title, purpose, intended role, prerequisites, application/transaction, inputs, numbered steps, key fields, decisions, warnings, expected result, troubleshooting, help information, version, approval status, and necessary screenshots. Export DOCX, PDF, and HTML.

### B. PowerPoint Training Presentation
Generate a fully editable presentation with title, audience, objectives, business context, process background, terminology, roles/responsibilities, end-to-end overview, process flow, detailed steps, SAP/Dassian navigation, transactional examples, Client-Specific screenshots, field explanations, business rules, risks/controls, common errors, troubleshooting, knowledge checks, summary, next steps, references, and speaker notes on every slide. Do not flatten editable text, screenshots, callouts, tables, or diagrams into one image.

### C. Assessment
Default to ten questions aligned with approved instructional content and learning objectives. An authorized Client Training Administrator may change the number, types, difficulty, passing score, attempts, randomization, feedback, and remediation rules. Support multiple choice, multiple response, true/false, matching, sequencing, scenario-based, and application-simulation items. For each question retain correct answer, explanation, source reference, objective, difficulty, topic, and remediation. Do not generate unsupported questions.

### D. Interactive HTML Training
Generate an editable/downloadable responsive HTML course with instructional coverage equivalent to the approved PowerPoint, adapted appropriately for digital delivery. Support module menu, progress, objectives, expandable content, tabs, accordions, tooltips, click-to-reveal, diagrams, zoom, interactive screenshots, knowledge checks, scenarios, final assessment, completion page, references, job-aid download, and accessibility controls.

Use RevTech Hub as a functional/interaction-design reference only. Create original components and code unless the organization owns and explicitly authorizes reuse. Document desired patterns such as tabs, progress indicators, knowledge checks, scenarios, accordions, clickable diagrams, and interactive screenshots.

Publish as Standalone HTML, SCORM 1.2, SCORM 2004, xAPI, cmi5, or LMS-compatible ZIP as applicable. Identify the functions supported by each standard because completion, assessment tracking, bookmarking, offline behavior, interaction tracking, and data exchange differ by destination and format.

PowerPoint and HTML outputs should be generated from a shared approved instructional content model. Updating one must not automatically overwrite another approved output. Identify differences and offer controlled synchronization.

## 21. Content Editing

- Browser-based editing for text, sections, images, screenshots, callouts, process steps, slides, templates, interactions, assessments, terminology, speaker notes, and citations.
- Track changes, compare versions, restore prior versions, and preserve output relationships.
- Where technically appropriate, support round-trip editing so downloaded/updated files can be re-uploaded as a new version without losing relationships.

## 22. Review and Approval

Use configurable Training Output Approval Statuses: Draft; In Development; Contributor Review; Subject Matter Expert Review; Client Review; Changes Requested; Ready for Approval; Approved; Published; Superseded; Archived.

- Reviewers can highlight, comment, tag, categorize, prioritize, request corrections, approve sections, and make an overall review decision.
- Comment categories: Technical Accuracy; Process Accuracy; Client Terminology; Screenshot Issue; Security Concern; Accessibility Issue; Branding Issue; Grammar/Clarity; Assessment Issue; Required Correction; Optional Recommendation.
- Comment statuses: Open; Assigned; In Progress; Resolved; Verified; Reopened; Closed.
- Notify assigned Contributors and Client Training Administrators and preserve complete audit history.

## 23. Content and Training Library

Store every Training Output as a version-controlled content object linked to its client, training hierarchy, source Knowledge Assets and versions, Generation Manifest, review history, publication history, and downloadable files.

- Search by Client, Learning Journey, role, Module, Course, Lesson, workstream, process, SAP module, Fiori app, transaction, Dassian product, type, Contributor, Reviewer, status, keyword, version, creation/modified/publication date, source, and objective.
- Provide tags, filters, saved searches, favorites, recent items, assigned reviews, content requiring validation, content due for review, and archive views.

## 24. Change-Impact Analysis

When a Global, Shared/Restricted, Client-Specific source, system screen, role, business process, or configuration changes, determine which Training Outputs may be affected without automatically overwriting approved training.

1. Identify affected clients, Learning Journeys, Courses, Modules, Job Aids, presentations, HTML courses, assessments, and LMS packages.
2. Compare source versions and identify potentially affected sections.
3. Explain the detected change and recommend review.
4. Notify responsible users and route impacted outputs for review.
5. Preserve the prior approved version and historical learner records.
6. Allow authorized administrators to prevent superseded content from new assignments and determine whether retraining is required.

### Promote Client Content to Global
Provide Propose for Global Library. The system creates a separate candidate version; preserves the original; detects client names, proprietary terminology, screenshots, client data, personal data, sensitive data, and possible export-controlled content; proposes generic replacements; and routes the candidate to a Global Knowledge Administrator.

AI-assisted anonymization may prepare a candidate but may not certify that the content is free of Client Confidential, Controlled Unclassified, proprietary, personal, or export-controlled information. Require Global Knowledge Administrator approval and any required security, legal, compliance, or client approval before Global publication. Never automatically promote Client-Specific content.

## 25. Learning Management System

The LMS receives approved training and metadata from the Content Generator and supports assignment, delivery, tracking, reporting, and learner administration.

- Create/import learners; groups; assignments by person, role, group, Module, Course, or Learning Journey; due dates; prerequisites; sequence; required/optional designation; recertification; reminders; resets; exports; certificates.
- Support import/integration through CSV, Microsoft Entra ID, approved HR/identity integrations, and Client-defined APIs.
- Preserve historical completion records when content changes.

## 26. Learner Experience

Create a clean responsive dashboard for desktop, tablet, and mobile.

- Welcome, assigned Learning Journey, objectives, required/optional Modules, due dates, completion percentage, completed/in-progress/not-started/overdue items, assessment scores when permitted, remaining attempts, certificates, recent training, and recommended next Module.
- Statuses: Not Started; In Progress; Completed; Overdue; Failed; Passed; Requires Retake.
- Learners can launch authorized HTML modules directly from the dashboard.

## 27. Training Help Assistant

Provide a Help Assistant from the Learner Dashboard and within training. The learner-facing assistant may search only current, approved, published training the learner is authorized to access. It must cite the relevant module/job aid, link to the source, state when an answer is unavailable, avoid inventing Client-Specific steps, and route unanswered questions to designated support.

Draft sources, superseded materials, preliminary AI content, review comments, answer keys, and unpublished documents must not be available to learners. Authorized Contributors/Administrators may use an internal assistant with additional sources, but the interface must clearly identify source status and operating mode.

## 28. Reporting and Analytics

- Filter by Client, learner, group, role, Learning Journey, Module, Course, process, workstream, status, due date, assessment result, and date range.
- Report assignment counts, completion percentages, on-time/overdue completion, average score, pass/fail, attempts, question-level analysis, frequently missed items, abandonment, time to completion, Learning Journey progress, targets, usage, and Help Assistant questions.
- Export XLSX, CSV, PDF, and Power BI-compatible data.
- Do not use assessment scores to automate employment, promotion, discipline, or performance decisions.

## 29. Security, Privacy, and Compliance

Because customers may be aerospace and defense government contractors, design strong technical and governance controls.

- Role-based access control and least privilege
- MFA and SSO with Microsoft Entra ID integration where appropriate
- Encryption in transit and at rest
- Tenant isolation
- Comprehensive audit logs
- Session controls
- Retention, backup, recovery, and version history
- Data loss prevention, malware scanning, and sensitive-data detection
- Screenshot redaction and controlled downloads
- Export-control controls
- Secure credential/secrets storage
- Environment separation and administrator activity reporting

Architect to support applicable client obligations and assessments related to CMMC, NIST SP 800-171, FAR/DFARS requirements, ITAR/export controls, Section 508, WCAG, and client record-retention policies. Do not claim compliance/certification merely because controls are designed. Certifications, assessments, authorizations, and legal determinations require qualified review.

Do not transmit Controlled Unclassified Information, export-controlled data, personal information, or client-confidential information to a public AI model unless expressly authorized for that processing.

## 30. Accessibility

- Keyboard navigation, screen-reader support, alt text, sufficient color contrast, captions/transcripts, descriptive links, focus indicators, accessible forms/assessments, scalable text, reduced motion, accessible PowerPoint reading order, and accessible PDF tagging where supported.
- Run an automated accessibility check before publication and surface issues requiring human review.

## 31. AI Agent Architecture

Use specialized AI agents with client/permission boundaries rather than one unrestricted generator.

| Agent | Purpose |
|---|---|
| Source Intake Agent | Classifies, extracts, and indexes authorized materials. |
| Process Analysis Agent | Identifies steps, roles, decisions, inputs, outputs, and exceptions. |
| SAP Validation Agent | Compares content with approved SAP references and client configuration. |
| Dassian Validation Agent | Compares content with approved Dassian references. |
| Gap Analysis Agent | Identifies missing information and unresolved questions. |
| Screenshot Agent | Captures/selects/redacts/labels/inserts screenshots. |
| Instructional Design Agent | Develops objectives, sequencing, explanations, practice, and reinforcement. |
| Job Aid Agent | Creates concise transactional instructions. |
| Presentation Agent | Creates editable PowerPoint and speaker notes. |
| Assessment Agent | Creates assessments mapped to objectives and approved content. |
| HTML Course Agent | Creates interactive HTML training. |
| Accessibility Agent | Checks accessibility. |
| Quality Assurance Agent | Checks consistency, completeness, citations, terminology, and formatting. |
| Publishing Agent | Packages approved content for download or LMS publication. |

## 32. Human Approval Controls

Use a human-in-the-loop model. AI-generated content must not automatically become approved or published.

- Require human approval for Client-Specific process steps, financial transactions, contract guidance, compliance statements, security instructions, production screenshots, sensitive data, assessment answer keys, published training, and content pushed to an LMS.
- Allow required approvers to be configured by Client, workstream, content type, process, risk class, and publication destination.

## 33. Technical Architecture Expectations

Recommend a modular, API-first architecture and document rationale and trade-offs.

- Front-end and back-end framework recommendations
- Relational database architecture plus object/document storage
- Enterprise search and retrieval plus RAG/vector strategy
- AI orchestration layer and model gateway
- Authentication/authorization and tenant isolation
- API gateway and background processing
- Document conversion and editable-output generation
- SAP integration and approved automation/screenshot approach
- SCORM/xAPI/cmi5 packaging
- Audit logging, observability, monitoring/alerting
- Backup/disaster recovery
- Development, test, staging, and production environments
- Deployment options for commercial cloud, government cloud, private cloud, or client-managed environments
- Configurable integrations rather than hard-coded connections

## 34. Minimum Viable Product

- Multi-client workspaces and user roles/permissions
- Client setup and Knowledge Library with Global, Shared/Restricted, and Client-Specific scope
- Word, PowerPoint, Excel, PDF, and image ingestion
- Searchable source library, duplicate detection, provenance, and citations
- Knowledge Coverage and Training Readiness
- AI-generated editable Job Aid, PowerPoint, ten-question default Assessment, and Interactive HTML
- Human review/comments/approval and version control
- Downloadable outputs
- Basic LMS assignments, learner dashboard, completion tracking, assessment scoring, and reporting
- Client-specific learner Help Assistant

Treat direct SAP navigation and automated screenshot capture as a separately controlled capability if security, licensing, browser automation, identity, or environment-access complexity makes it unsuitable for the initial MVP.

## 35. Development Deliverables

1. Product requirements document
2. User personas
3. User stories
4. Acceptance criteria
5. Role-permission matrix
6. Information architecture
7. Data model
8. System architecture diagram
9. AI agent architecture
10. Integration architecture
11. Security model
12. Wireframes
13. Clickable prototype
14. API specification
15. Source-grounding strategy
16. Testing strategy
17. Accessibility strategy
18. Deployment strategy
19. Implementation roadmap
20. Minimum viable product definition
21. Future-release roadmap
22. Estimated development effort
23. Key technical risks
24. Key compliance risks
25. Recommended build-versus-buy decisions

## 36. Software Builder Response Requirements

Before coding, produce the following in order:

1. Concise executive summary
2. Assumptions and unresolved questions
3. Recommended product architecture
4. Recommended technology stack with rationale
5. Core data entities and relationships
6. User roles and detailed permissions
7. End-to-end user journeys
8. MVP scope
9. Features deferred to later releases
10. Security and compliance design
11. AI grounding and validation strategy
12. SAP integration and screenshot automation options
13. LMS standards and integration approach
14. Wireframe descriptions for each primary screen
15. Epics, features, and user stories
16. Acceptance criteria for each MVP feature
17. Phased implementation roadmap
18. Risk register and mitigations
19. Product-owner decisions required

Do not begin coding until architecture, assumptions, security model, MVP scope, source-governance model, and unresolved product decisions are documented. When coding begins, use modular maintainable components, realistic but fictional demonstration data, automated tests, accessible interfaces, error handling, audit logging, API documentation, setup/deployment instructions, and no embedded credentials or client data.

### Required Initial Screens

1. Login and client/context selection
2. Administrator home dashboard
3. Client setup wizard
4. Role and Learning Journey setup
5. Enterprise Knowledge Library
6. Knowledge Coverage and Gap Analysis dashboard
7. Source upload center
8. Training Generation wizard
9. Generation progress screen
10. Content editing workspace
11. Screenshot capture/annotation workspace
12. Review/commenting workspace
13. Approval dashboard
14. Client content library
15. LMS administration dashboard
16. Learner assignment screen
17. Learner dashboard
18. Interactive HTML training player
19. Assessment player
20. Reporting dashboard
21. Help Assistant
22. Security and permission administration

## 37. Product Decisions and Unresolved Questions

1. Will each client have logical tenant separation, a dedicated database/schema, or a fully separate deployment?
2. Will the platform process Controlled Unclassified Information or export-controlled information?
3. Must the platform be deployable in Microsoft Azure Government or another government-authorized environment?
4. Which Dassian products should be supported first?
5. Which SAP workstreams should be in the MVP?
6. Which automation method should capture SAP screenshots: browser automation, SAP-native test automation, SAP Build Process Automation, an existing testing tool, or a custom agent?
7. Will the first LMS be custom, integrate with an existing commercial LMS, integrate with Microsoft Viva Learning, or use a hybrid approach?
8. Should instructor-led and virtual instructor-led training be included?
9. Which RevTech Hub interaction patterns are required, and does RevTech own reusable components/code?
10. Is multilingual generation required?
11. How should external client reviewers authenticate: Microsoft Entra External ID, guest accounts, or another identity provider?
12. What scale should be supported in the first three years: clients, trainers, reviewers, learners, Knowledge Assets, and courses?
13. Can client administrators create their own templates?
14. Should PowerPoint output use client-provided master templates?
15. Should internal Help Assistant modes search drafts/source documents in addition to approved content?
16. How should conflicts between client configuration and standard SAP documentation be adjudicated?
17. Who can see assessment scores: learner, manager, training administrator, or defined combinations?
18. What retention periods apply to learner records, audit logs, Source Files, Training Outputs, and superseded training?
19. What exact rules and control owners govern promotion of Client-Specific content to Global?
20. Which Knowledge Coverage and Training Readiness factors and weights should be mandatory versus configurable?

## End of Master Prompt

The software builder should treat this document as the controlling product prompt unless a later approved requirement explicitly supersedes it. Any ambiguity affecting client isolation, data security, AI source use, compliance, or publication must default to the more restrictive behavior and be surfaced as a product-owner decision.
