import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as modulesService from '@/services/modulesService'
import type { Database } from '@/types/database.types'

type ModuleInsert = Database['public']['Tables']['modules']['Insert']
type ModuleUpdate = Database['public']['Tables']['modules']['Update']
type QuizQuestionInsert = Database['public']['Tables']['quiz_questions']['Insert']
type QuizQuestionUpdate = Database['public']['Tables']['quiz_questions']['Update']

export function useModules() {
  return useQuery({ queryKey: ['modules'], queryFn: modulesService.listModules })
}

export function useModule(id: string | undefined) {
  return useQuery({
    queryKey: ['modules', id],
    queryFn: () => modulesService.getModule(id as string),
    enabled: !!id,
  })
}

export function useQuestions(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['quiz_questions', moduleId],
    queryFn: () => modulesService.listQuestions(moduleId as string),
    enabled: !!moduleId,
  })
}

export function useQuestionsPublic(moduleId: string | undefined) {
  return useQuery({
    queryKey: ['quiz_questions_public', moduleId],
    queryFn: () => modulesService.listQuestionsPublic(moduleId as string),
    enabled: !!moduleId,
  })
}

export function useCreateModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ModuleInsert) => modulesService.createModule(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modules'] }),
  })
}

export function useUpdateModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ModuleUpdate }) => modulesService.updateModule(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['modules'] })
      queryClient.invalidateQueries({ queryKey: ['modules', variables.id] })
    },
  })
}

export function useDeleteModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => modulesService.deleteModule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['modules'] }),
  })
}

export function useCreateQuestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: QuizQuestionInsert) => modulesService.createQuestion(input),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ['quiz_questions', variables.module_id] }),
  })
}

export function useUpdateQuestion(moduleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: QuizQuestionUpdate }) =>
      modulesService.updateQuestion(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz_questions', moduleId] }),
  })
}

export function useDeleteQuestion(moduleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => modulesService.deleteQuestion(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz_questions', moduleId] }),
  })
}
