import { supabase } from '@/lib/supabase'
import type { Attempt, QuizAnswer } from '@/types/domain'

export async function listMyAttempts(assignmentId?: string): Promise<Attempt[]> {
  let query = supabase.from('attempts').select('*').order('started_at', { ascending: false })
  if (assignmentId) query = query.eq('assignment_id', assignmentId)
  const { data, error } = await query
  if (error) throw error
  return data as Attempt[]
}

export async function startAttempt(assignmentId: string): Promise<Attempt> {
  const { data, error } = await supabase.rpc('start_attempt', { p_assignment_id: assignmentId })
  if (error) throw error
  return data as Attempt
}

export async function markContentViewed(attemptId: string): Promise<Attempt> {
  const { data, error } = await supabase.rpc('mark_content_viewed', { p_attempt_id: attemptId })
  if (error) throw error
  return data as Attempt
}

export async function submitAttempt(attemptId: string, answers: QuizAnswer[]): Promise<Attempt> {
  const { data, error } = await supabase.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_answers: answers,
  })
  if (error) throw error
  return data as Attempt
}
