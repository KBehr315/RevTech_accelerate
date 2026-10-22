import { db } from '@/lib/db'
import type { Attempt, QuizAnswer } from '@/types/domain'

export async function listMyAttempts(assignmentId?: string): Promise<Attempt[]> {
  let query = db.from('attempts').select('*').order('started_at', { ascending: false })
  if (assignmentId) query = query.eq('assignment_id', assignmentId)
  const { data, error } = await query
  if (error) throw error
  return data as Attempt[]
}

export async function startAttempt(assignmentId: string): Promise<Attempt> {
  const { data, error } = await db.rpc('start_attempt', { p_assignment_id: assignmentId })
  if (error) throw error
  return data as Attempt
}

export async function markContentViewed(attemptId: string): Promise<Attempt> {
  const { data, error } = await db.rpc('mark_content_viewed', { p_attempt_id: attemptId })
  if (error) throw error
  return data as Attempt
}

export async function submitAttempt(attemptId: string, answers: QuizAnswer[]): Promise<Attempt> {
  const { data, error } = await db.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_answers: answers,
  })
  if (error) throw error
  return data as Attempt
}
