import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as adminUsersService from '@/services/adminUsersService'
import type { Role } from '@/types/domain'

export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: adminUsersService.listProfiles })
}

export function useSetProfileActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminUsersService.setProfileActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}

export function useSetProfileRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => adminUsersService.setProfileRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiles'] }),
  })
}
