// Hand-authored to match db/migrations/00100_platform_identity_and_tenancy.sql
// and the migrations after it (00101 jobs, 00102 AI gateway, 00103 knowledge library).
// Update this alongside every migration that changes a table or function the
// web app uses. Insert/Update list only what callers may actually write: RLS and
// column grants refuse the rest.
import type {
  AiProvider,
  AuditEvent,
  Client,
  ClientBusinessRole,
  ClientGroup,
  ClientGroupMember,
  ClientMembership,
  ClientRole,
  ClientTerm,
  ClientWorkstream,
  Job,
  KnowledgeAsset,
  KnowledgeAssetVersion,
  PlatformRole,
  PlatformRoleGrant,
  PlatformSettings,
  Profile,
  SearchResult,
  SourceFile,
} from './domain'

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type Table<Row, Insert = never, Update = never, Rels extends Relationship[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Rels
}

type ClientOwned<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>

type ClientEditable = Partial<
  Pick<
    Client,
    | 'name'
    | 'setup_step'
    | 'industry'
    | 'govcon_status'
    | 'sap_landscape'
    | 'dassian_products'
    | 'max_classification'
    | 'allowed_ai_providers'
    | 'branding'
    | 'accessibility_requirements'
    | 'export_control_notes'
    | 'support_contact'
    | 'approval_stages'
  >
>

export type Database = {
  public: {
    Tables: {
      platform_settings: Table<PlatformSettings, never, Partial<Pick<PlatformSettings, 'session_idle_minutes' | 'malware_scanning'>>>
      profiles: Table<Profile>
      platform_role_grants: Table<
        PlatformRoleGrant,
        never,
        never,
        [
          {
            foreignKeyName: 'platform_role_grants_profile_id_fkey'
            columns: ['profile_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      >
      ai_providers: Table<
        AiProvider,
        Partial<Omit<AiProvider, 'id' | 'cui_approved' | 'created_at' | 'updated_at'>> & Pick<AiProvider, 'name' | 'kind'>,
        Partial<Omit<AiProvider, 'id' | 'cui_approved' | 'created_at' | 'updated_at'>>
      >
      clients: Table<Client, never, ClientEditable>
      client_memberships: Table<
        ClientMembership,
        never,
        never,
        [
          {
            foreignKeyName: 'client_memberships_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'client_memberships_profile_id_fkey'
            columns: ['profile_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      >
      client_workstreams: Table<
        ClientWorkstream,
        Pick<ClientWorkstream, 'client_id' | 'code' | 'name'> & Partial<Pick<ClientWorkstream, 'description'>>,
        Partial<Pick<ClientWorkstream, 'code' | 'name' | 'description'>>
      >
      client_business_roles: Table<
        ClientBusinessRole,
        Pick<ClientBusinessRole, 'client_id' | 'name'> & Partial<Pick<ClientBusinessRole, 'description' | 'workstream_ids'>>,
        Partial<Pick<ClientBusinessRole, 'name' | 'description' | 'workstream_ids'>>
      >
      client_terms: Table<
        ClientTerm,
        Pick<ClientTerm, 'client_id' | 'client_term'> & Partial<Pick<ClientTerm, 'standard_term' | 'definition'>>,
        Partial<ClientOwned<Omit<ClientTerm, 'client_id'>>>
      >
      client_groups: Table<
        ClientGroup,
        Pick<ClientGroup, 'name'> & Partial<Pick<ClientGroup, 'description'>>,
        Partial<Pick<ClientGroup, 'name' | 'description'>>
      >
      client_group_members: Table<
        ClientGroupMember,
        ClientGroupMember,
        never,
        [
          {
            foreignKeyName: 'client_group_members_client_id_fkey'
            columns: ['client_id']
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      >
      audit_events: Table<AuditEvent>
      jobs: Table<Job>
      source_files: Table<SourceFile>
      knowledge_assets: Table<
        KnowledgeAsset,
        never,
        never,
        [
          {
            foreignKeyName: 'knowledge_assets_current_version_id_fkey'
            columns: ['current_version_id']
            isOneToOne: true
            referencedRelation: 'knowledge_asset_versions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'knowledge_assets_created_by_fkey'
            columns: ['created_by']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      >
      knowledge_asset_versions: Table<
        KnowledgeAssetVersion,
        never,
        never,
        [
          {
            foreignKeyName: 'knowledge_asset_versions_source_file_id_fkey'
            columns: ['source_file_id']
            isOneToOne: true
            referencedRelation: 'source_files'
            referencedColumns: ['id']
          },
        ]
      >
    }
    Views: { [_ in never]: never }
    Functions: {
      is_platform_admin: { Args: Record<string, never>; Returns: boolean }
      is_global_knowledge_admin: { Args: Record<string, never>; Returns: boolean }
      client_roles: { Args: { p_client_id: string }; Returns: ClientRole[] }
      set_platform_role: { Args: { p_profile_id: string; p_role: PlatformRole; p_granted: boolean }; Returns: undefined }
      set_profile_active: { Args: { p_profile_id: string; p_active: boolean }; Returns: undefined }
      create_client: { Args: { p_name: string; p_slug: string }; Returns: Client }
      add_client_member: {
        Args: { p_client_id: string; p_email: string; p_name: string; p_roles: ClientRole[] }
        Returns: ClientMembership
      }
      set_client_roles: { Args: { p_client_id: string; p_profile_id: string; p_roles: ClientRole[] }; Returns: undefined }
      activate_client: { Args: { p_client_id: string }; Returns: Client }
      request_health_check: { Args: Record<string, never>; Returns: Job }
      request_ai_provider_test: { Args: { p_provider_id: string }; Returns: Job }
      search_library: { Args: { p_client_id: string | null; p_query: string; p_limit?: number }; Returns: SearchResult[] }
    }
  }
}
