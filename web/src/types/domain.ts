export type Role = 'admin' | 'employee'

export type ModuleContentType = 'in_app' | 'external'
export type ExternalContentType = 'video' | 'pdf' | 'url'
export type QuestionType = 'multiple_choice' | 'true_false'

export type ContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt?: string }
  | { type: 'video_embed'; url: string }
  | { type: 'callout'; text: string; tone?: 'info' | 'warning' }

export type ModuleContent = ContentBlock[]

export interface QuizOption {
  id: string
  text: string
}

/** Question shape returned to employees — never includes the answer key. */
export interface QuizQuestionPublic {
  id: string
  module_id: string
  position: number
  question_type: QuestionType
  prompt: string
  options: QuizOption[]
  points: number
}

/** Full question shape, admin-only (includes correct_option_ids). */
export interface QuizQuestion extends QuizQuestionPublic {
  correct_option_ids: string[]
}

export interface QuizAnswer {
  question_id: string
  selected_option_ids: string[]
}

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Module {
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

export interface Assignment {
  id: string
  module_id: string
  employee_id: string
  assigned_by: string
  due_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Attempt {
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

export interface EmployeeGroup {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface EmployeeGroupMember {
  group_id: string
  employee_id: string
  added_at: string
}

export interface AssignmentStatus {
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
