import type {
  AiProviderKind,
  AiUse,
  AssetApproval,
  AssetLifecycle,
  ExtractionStatus,
  KnowledgeScope,
  Locator,
  ScanStatus,
  ApprovalStage,
  Classification,
  ClientRole,
  ClientStatus,
  GovconStatus,
  PlatformRole,
  SetupStep,
} from '@/types/domain'

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_admin: 'Platform Administrator',
  global_knowledge_admin: 'Global Knowledge Administrator',
  client_creator: 'May create clients',
}

export const CLIENT_ROLES: ClientRole[] = ['client_training_admin', 'lms_admin', 'contributor', 'reviewer', 'learner']

export const CLIENT_ROLE_LABELS: Record<ClientRole, string> = {
  client_training_admin: 'Client Training Administrator',
  lms_admin: 'LMS Administrator',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  learner: 'Learner',
}

export const CLIENT_ROLE_DESCRIPTIONS: Record<ClientRole, string> = {
  client_training_admin: 'Sets up the client, manages members, and generates, approves and publishes training.',
  lms_admin: 'Manages learners, assignments, due dates and training reports.',
  contributor: 'Develops and edits the content they are assigned.',
  reviewer: 'Comments on and approves or rejects assigned content.',
  learner: 'Takes assigned training.',
}

export const CLASSIFICATIONS: Classification[] = [
  'public',
  'internal',
  'confidential',
  'client_confidential',
  'controlled',
  'export_controlled',
]

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  public: 'Public',
  internal: 'Internal',
  confidential: 'Confidential',
  client_confidential: 'Client Confidential',
  controlled: 'Controlled (CUI)',
  export_controlled: 'Export Controlled',
}

export function classificationRank(level: Classification): number {
  return CLASSIFICATIONS.indexOf(level) + 1
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  setup: 'In setup',
  active: 'Active',
  archived: 'Archived',
}

export const SETUP_STEPS: { key: SetupStep; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'sap_landscape', label: 'SAP landscape' },
  { key: 'organization', label: 'Organization' },
  { key: 'branding', label: 'Branding' },
  { key: 'governance', label: 'Governance' },
  { key: 'review', label: 'Review' },
]

export const GOVCON_STATUS_LABELS: Record<GovconStatus, string> = {
  prime: 'Prime contractor',
  subcontractor: 'Subcontractor',
  both: 'Prime and subcontractor',
  commercial: 'Commercial only',
}

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  contributor: 'Contributor review',
  sme: 'Subject-matter expert review',
  client: 'Client review',
}

export const AI_PROVIDER_KIND_LABELS: Record<AiProviderKind, string> = {
  anthropic: 'Claude (Anthropic API)',
  bedrock: 'Claude on AWS Bedrock',
  azure_openai: 'Azure OpenAI',
}

/** A URL slug from a client name, in the shape clients.slug accepts. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export const SCOPE_LABELS: Record<KnowledgeScope, string> = {
  global: 'Global',
  shared: 'Shared',
  client: 'Client-Specific',
  pending_classification: 'Pending Classification',
}

export const ASSET_APPROVAL_LABELS: Record<AssetApproval, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const ASSET_LIFECYCLE_LABELS: Record<AssetLifecycle, string> = {
  active: 'Active',
  superseded: 'Superseded',
  expired: 'Expired',
  archived: 'Archived',
}

export const AI_USE_LABELS: Record<AiUse, string> = {
  generation: 'Approved for AI generation',
  reference: 'AI reference only',
  human_approval_required: 'Human approval required for AI',
  not_approved: 'Not approved for AI',
}

export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  pending: 'Virus check running',
  clean: 'Virus check passed',
  infected: 'Blocked: virus found',
  failed: 'Virus check failed',
  not_scanned: 'Not scanned (preview)',
}

/** File types the library accepts (start_upload in db/migrations/00103 enforces the same list). */
export const UPLOAD_EXTENSIONS = ['docx', 'pptx', 'xlsx', 'pdf', 'png', 'jpg', 'jpeg', 'txt', 'csv']

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const EXTRACTION_STATUS_LABELS: Record<ExtractionStatus, string> = {
  pending: 'Waiting to be read',
  running: 'Reading…',
  done: 'Read',
  failed: "Couldn't be read",
  skipped: 'Not read',
  needs_ocr: 'Needs reading (scan or image)',
}

/**
 * "Page 3", "Slide 7: Allocations", "Sheet Steps, A2:H40", "Purpose › Scope, table 1 rows 2-9",
 * "Lines 10-42", plus "(read by AI)" for transcribed text.
 */
export function locatorLabel(locator: Locator): string {
  if (locator.ocr === 'image') return 'Text in the image (read by AI)'
  if (locator.page) return `Page ${locator.page}${locator.ocr ? ' (read by AI)' : ''}`
  if (locator.slide) return `Slide ${locator.slide}${locator.title ? `: ${locator.title}` : ''}`
  if (locator.sheet) return `Sheet ${locator.sheet}${locator.range ? `, ${locator.range}` : ''}`
  const parts: string[] = []
  if (locator.heading?.length) parts.push(locator.heading.join(' › '))
  if (locator.table) parts.push(`table ${locator.table}${locator.rows ? ` rows ${locator.rows}` : ''}`)
  else if (locator.rows) parts.push(`Rows ${locator.rows}`)
  if (locator.lines) parts.push(`Lines ${locator.lines}`)
  return parts.join(', ') || 'Start of file'
}
