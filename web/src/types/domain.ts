// Shapes of the platform's records, matching db/migrations/00100_platform_identity_and_tenancy.sql.

export type PlatformRole = 'platform_admin' | 'global_knowledge_admin' | 'client_creator'

export type ClientRole = 'client_training_admin' | 'lms_admin' | 'contributor' | 'reviewer' | 'learner'

/** Ascending sensitivity; the database ranks them in this order. */
export type Classification =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'client_confidential'
  | 'controlled'
  | 'export_controlled'

export type ClientStatus = 'setup' | 'active' | 'archived'

export type SetupStep = 'profile' | 'sap_landscape' | 'organization' | 'branding' | 'governance' | 'review'

export type GovconStatus = 'prime' | 'subcontractor' | 'both' | 'commercial'

export type ApprovalStage = 'contributor' | 'sme' | 'client'

export type AiProviderKind = 'anthropic' | 'bedrock' | 'azure_openai'

export type SapLandscape = {
  version?: string
  deployment?: string
  fiori?: string
  other_tools?: string
}

export type Branding = {
  primary_color?: string
  accent_color?: string
}

export type Profile = {
  id: string
  email: string
  full_name: string
  is_active: boolean
  is_guest: boolean
  created_at: string
  updated_at: string
}

export type PlatformSettings = {
  id: boolean
  environment_name: string
  max_classification: Classification
  session_idle_minutes: number
  malware_scanning: 'defender' | 'off'
  max_upload_mb: number
  updated_at: string
}

export type PlatformRoleGrant = {
  profile_id: string
  role: PlatformRole
  granted_by: string | null
  granted_at: string
}

export type AiProvider = {
  id: string
  name: string
  kind: AiProviderKind
  config: Record<string, unknown>
  max_classification: Classification
  cui_approved: boolean
  is_enabled: boolean
  retention_terms: string | null
  created_at: string
  updated_at: string
}

export type Client = {
  id: string
  name: string
  slug: string
  status: ClientStatus
  setup_step: SetupStep
  industry: string | null
  govcon_status: GovconStatus | null
  sap_landscape: SapLandscape
  dassian_products: string[]
  max_classification: Classification
  allowed_ai_providers: string[]
  branding: Branding
  accessibility_requirements: string | null
  export_control_notes: string | null
  support_contact: string | null
  approval_stages: ApprovalStage[]
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClientMembership = {
  client_id: string
  profile_id: string
  roles: ClientRole[]
  is_active: boolean
  added_by: string | null
  created_at: string
  updated_at: string
}

export type ClientWorkstream = {
  id: string
  client_id: string
  code: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type ClientBusinessRole = {
  id: string
  client_id: string
  name: string
  description: string | null
  workstream_ids: string[]
  created_at: string
  updated_at: string
}

export type ClientTerm = {
  id: string
  client_id: string
  client_term: string
  standard_term: string | null
  definition: string | null
  created_at: string
  updated_at: string
}

export type ClientGroup = {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export type ClientGroupMember = {
  group_id: string
  client_id: string
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled'

export type Job = {
  id: string
  kind: string
  client_id: string | null
  requested_by: string | null
  payload: Record<string, unknown>
  status: JobStatus
  attempts: number
  max_attempts: number
  run_after: string
  last_error: string | null
  result: Record<string, unknown> | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export type AuditEvent = {
  id: number
  at: string
  actor_id: string | null
  client_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
}

// Knowledge library (db/migrations/00103)
export type KnowledgeScope = 'global' | 'shared' | 'client' | 'revtech_reference' | 'pending_classification'
export type AssetLifecycle = 'active' | 'superseded' | 'expired' | 'archived'
export type AssetApproval = 'draft' | 'in_review' | 'approved' | 'rejected'
export type AiUse = 'generation' | 'reference' | 'human_approval_required' | 'not_approved'
export type ScanStatus = 'pending' | 'clean' | 'infected' | 'failed' | 'not_scanned'
export type ExtractionStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'needs_ocr'

/** Where a passage is in its file (worker/extract/): page, slide, sheet range, heading path or lines. */
export type Locator = {
  page?: number
  slide?: number
  title?: string
  sheet?: string
  range?: string
  heading?: string[]
  table?: number
  rows?: string
  lines?: string
  /** Set when the text was transcribed by AI from an image or a scanned page. */
  ocr?: 'image' | 'page'
}

/** A row from search_library() (db/migrations/00104). */
export type SearchResult = {
  chunk_id: string
  asset_id: string
  title: string
  scope: KnowledgeScope
  security_classification: Classification
  approval_status: AssetApproval
  lifecycle_status: AssetLifecycle
  ai_use: AiUse
  version_no: number
  file_id: string
  filename: string
  locator: Locator
  snippet: string
  rank: number
}

export type SourceFile = {
  id: string
  client_id: string | null
  blob_path: string
  filename: string
  mime_type: string | null
  bytes: number | null
  sha256: string | null
  upload_status: 'uploading' | 'stored' | 'failed'
  scan_status: ScanStatus
  scanned_at: string | null
  uploaded_by: string
  created_at: string
  updated_at: string
}

export type KnowledgeAsset = {
  id: string
  client_id: string | null
  scope: KnowledgeScope
  title: string
  document_type: string | null
  security_classification: Classification
  lifecycle_status: AssetLifecycle
  approval_status: AssetApproval
  ai_use: AiUse
  workstream_ids: string[]
  owner_id: string | null
  current_version_id: string | null
  /** Set on a copy made from a client's document (copy_asset, 00106). */
  copied_from_asset_id: string | null
  /** On a copy: when its original was deleted (00109). */
  original_deleted_at: string | null
  /** Set while the document is in the Deleted list (00109). */
  deleted_at: string | null
  deleted_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** Who a Shared asset is shared with: one client or one client group per row (00106). */
export type AssetAudience = {
  id: string
  asset_id: string
  client_id: string | null
  client_group_id: string | null
  created_at: string
}

/** A new upload that resembles a document already in the library (00108). */
export type DuplicateCandidate = {
  id: string
  asset_id: string
  existing_asset_id: string
  same_name: boolean
  text_similarity: number
  status: 'open' | 'separate' | 'removed'
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export type KnowledgeAssetVersion = {
  id: string
  asset_id: string
  version_no: number
  source_file_id: string | null
  metadata: Record<string, unknown>
  change_note: string | null
  extraction_status: ExtractionStatus
  extraction_detail: string | null
  created_by: string | null
  created_at: string
}
