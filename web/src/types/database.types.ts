// Hand-authored to match supabase/migrations/00001_initial_schema.sql and
// 00002_rls_policies.sql. If the schema changes, update this alongside the
// migration (or regenerate with `supabase gen types typescript` once the
// project is linked to a live Supabase project).
import type {
  ExternalContentType,
  ModuleContent,
  ModuleContentType,
  QuestionType,
  QuizAnswer,
  QuizOption,
  Role,
} from './domain'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: Role
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role?: Role
          is_active?: boolean
        }
        Update: {
          full_name?: string
          role?: Role
          is_active?: boolean
        }
        Relationships: []
      }
      modules: {
        Row: {
          id: string
          title: string
          description: string | null
          content_type: ModuleContentType
          content_blocks: ModuleContent | null
          external_content_type: ExternalContentType | null
          external_url: string | null
          renewal_period_months: number | null
          passing_score_pct: number
          is_published: boolean
          topics: string[]
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          content_type: ModuleContentType
          content_blocks?: ModuleContent | null
          external_content_type?: ExternalContentType | null
          external_url?: string | null
          renewal_period_months?: number | null
          passing_score_pct?: number
          is_published?: boolean
          topics?: string[]
          created_by: string
        }
        Update: {
          title?: string
          description?: string | null
          content_type?: ModuleContentType
          content_blocks?: ModuleContent | null
          external_content_type?: ExternalContentType | null
          external_url?: string | null
          renewal_period_months?: number | null
          passing_score_pct?: number
          is_published?: boolean
          topics?: string[]
        }
        Relationships: []
      }
      quiz_questions: {
        Row: {
          id: string
          module_id: string
          position: number
          question_type: QuestionType
          prompt: string
          options: QuizOption[]
          correct_option_ids: string[]
          points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          module_id: string
          position?: number
          question_type: QuestionType
          prompt: string
          options: QuizOption[]
          correct_option_ids: string[]
          points?: number
        }
        Update: {
          position?: number
          question_type?: QuestionType
          prompt?: string
          options?: QuizOption[]
          correct_option_ids?: string[]
          points?: number
        }
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          module_id: string
          employee_id: string
          assigned_by: string
          due_at: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          module_id: string
          employee_id: string
          assigned_by: string
          due_at?: string | null
          is_active?: boolean
        }
        Update: {
          due_at?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      attempts: {
        Row: {
          id: string
          assignment_id: string
          employee_id: string
          started_at: string
          completed_at: string | null
          score_pct: number | null
          passed: boolean | null
          answers: QuizAnswer[] | null
          content_viewed_at: string | null
          created_at: string
          updated_at: string
        }
        // attempts are only ever written via the RPCs in Functions below —
        // Record<string, never> (rather than `never`) keeps this a valid
        // GenericTable shape while still rejecting any insert/update payload.
        Insert: Record<string, never>
        Update: Record<string, never>
        Relationships: []
      }
      employee_groups: {
        Row: {
          id: string
          name: string
          description: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_by: string
        }
        Update: {
          name?: string
          description?: string | null
        }
        Relationships: []
      }
      employee_group_members: {
        Row: {
          group_id: string
          employee_id: string
          added_at: string
        }
        Insert: {
          group_id: string
          employee_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: {
      assignment_status: {
        Row: {
          assignment_id: string
          module_id: string
          employee_id: string
          due_at: string | null
          is_active: boolean
          module_title: string
          renewal_period_months: number | null
          passing_score_pct: number
          last_attempt_id: string | null
          last_completed_at: string | null
          last_score_pct: number | null
          last_passed: boolean | null
          attempt_count: number
          renewal_due_at: string | null
          is_overdue: boolean
        }
        Relationships: []
      }
      quiz_questions_public: {
        Row: {
          id: string
          module_id: string
          position: number
          question_type: QuestionType
          prompt: string
          options: QuizOption[]
          points: number
        }
        Relationships: []
      }
    }
    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      start_attempt: {
        Args: { p_assignment_id: string }
        Returns: Database['public']['Tables']['attempts']['Row']
      }
      mark_content_viewed: {
        Args: { p_attempt_id: string }
        Returns: Database['public']['Tables']['attempts']['Row']
      }
      submit_attempt: {
        Args: { p_attempt_id: string; p_answers: QuizAnswer[] }
        Returns: Database['public']['Tables']['attempts']['Row']
      }
    }
  }
}
