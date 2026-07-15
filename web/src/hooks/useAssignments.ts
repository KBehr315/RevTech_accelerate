import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as assignmentsService from '@/services/assignmentsService'

export function useMyAssignmentStatus() {
  return useQuery({ queryKey: ['assignment_status', 'mine'], queryFn: assignmentsService.listMyAssignmentStatus })
}

export function useAllAssignmentStatus() {
  return useQuery({ queryKey: ['assignment_status', 'all'], queryFn: assignmentsService.listAllAssignmentStatus })
}

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: ['assignments', id],
    queryFn: () => assignmentsService.getAssignment(id as string),
    enabled: !!id,
  })
}

export function useBulkAssign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: assignmentsService.bulkAssign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment_status'] })
    },
  })
}

export function useDeactivateAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: assignmentsService.deactivateAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assignment_status'] }),
  })
}
