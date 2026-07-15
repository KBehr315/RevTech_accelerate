import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as groupsService from '@/services/groupsService'

export function useGroups() {
  return useQuery({ queryKey: ['employee_groups'], queryFn: groupsService.listGroups })
}

export function useAllMemberships() {
  return useQuery({ queryKey: ['employee_group_members'], queryFn: groupsService.listAllMemberships })
}

function useInvalidateGroups() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['employee_groups'] })
    queryClient.invalidateQueries({ queryKey: ['employee_group_members'] })
  }
}

export function useCreateGroup() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: groupsService.createGroup,
    onSuccess: invalidate,
  })
}

export function useUpdateGroup() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string | null } }) =>
      groupsService.updateGroup(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteGroup() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: groupsService.deleteGroup,
    onSuccess: invalidate,
  })
}

export function useSetGroupMembers() {
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: ({ groupId, employeeIds }: { groupId: string; employeeIds: string[] }) =>
      groupsService.setGroupMembers(groupId, employeeIds),
    onSuccess: invalidate,
  })
}
