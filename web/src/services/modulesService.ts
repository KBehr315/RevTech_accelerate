import { db } from '@/lib/db'
import type { Module, QuizQuestion, QuizQuestionPublic } from '@/types/domain'
import type { Database } from '@/types/database.types'

type ModuleInsert = Database['public']['Tables']['modules']['Insert']
type ModuleUpdate = Database['public']['Tables']['modules']['Update']
type QuizQuestionInsert = Database['public']['Tables']['quiz_questions']['Insert']
type QuizQuestionUpdate = Database['public']['Tables']['quiz_questions']['Update']

export async function listModules(): Promise<Module[]> {
  const { data, error } = await db.from('modules').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Module[]
}

export async function getModule(id: string): Promise<Module> {
  const { data, error } = await db.from('modules').select('*').eq('id', id).single()
  if (error) throw error
  return data as Module
}

export async function createModule(input: ModuleInsert): Promise<Module> {
  const { data, error } = await db.from('modules').insert(input).select('*').single()
  if (error) throw error
  return data as Module
}

export async function updateModule(id: string, input: ModuleUpdate): Promise<Module> {
  const { data, error } = await db.from('modules').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as Module
}

export async function deleteModule(id: string): Promise<void> {
  const { error } = await db.from('modules').delete().eq('id', id)
  if (error) throw error
}

/** Admin-only: includes the answer key. */
export async function listQuestions(moduleId: string): Promise<QuizQuestion[]> {
  const { data, error } = await db
    .from('quiz_questions')
    .select('*')
    .eq('module_id', moduleId)
    .order('position', { ascending: true })
  if (error) throw error
  return data as QuizQuestion[]
}

/** Employee-safe: no answer key, filtered to modules assigned to the caller. */
export async function listQuestionsPublic(moduleId: string): Promise<QuizQuestionPublic[]> {
  const { data, error } = await db
    .from('quiz_questions_public')
    .select('*')
    .eq('module_id', moduleId)
    .order('position', { ascending: true })
  if (error) throw error
  return data as QuizQuestionPublic[]
}

export async function createQuestion(input: QuizQuestionInsert): Promise<QuizQuestion> {
  const { data, error } = await db.from('quiz_questions').insert(input).select('*').single()
  if (error) throw error
  return data as QuizQuestion
}

export async function updateQuestion(id: string, input: QuizQuestionUpdate): Promise<QuizQuestion> {
  const { data, error } = await db.from('quiz_questions').update(input).eq('id', id).select('*').single()
  if (error) throw error
  return data as QuizQuestion
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await db.from('quiz_questions').delete().eq('id', id)
  if (error) throw error
}
