import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as attemptsService from '@/services/attemptsService'
import type { QuizAnswer } from '@/types/domain'

export function useMyAttempts(assignmentId?: string) {
  return useQuery({
    queryKey: ['attempts', 'mine', assignmentId ?? 'all'],
    queryFn: () => attemptsService.listMyAttempts(assignmentId),
  })
}

export function useStartAttempt() {
  return useMutation({ mutationFn: attemptsService.startAttempt })
}

export function useMarkContentViewed() {
  return useMutation({ mutationFn: attemptsService.markContentViewed })
}

export function useSubmitAttempt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ attemptId, answers }: { attemptId: string; answers: QuizAnswer[] }) =>
      attemptsService.submitAttempt(attemptId, answers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attempts'] })
      queryClient.invalidateQueries({ queryKey: ['assignment_status'] })
    },
  })
}
