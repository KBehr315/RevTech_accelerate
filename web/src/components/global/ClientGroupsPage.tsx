import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { db, unwrap } from '@/lib/db'

export function ClientGroupsPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const groups = useQuery({
    queryKey: ['client-groups'],
    queryFn: async () => unwrap(await db.from('client_groups').select('*').order('name')),
  })
  const members = useQuery({
    queryKey: ['client-group-members'],
    queryFn: async () => unwrap(await db.from('client_group_members').select('*')),
  })
  const clients = useQuery({
    queryKey: ['client-groups', 'clients'],
    queryFn: async () => unwrap(await db.from('clients').select('id, name').order('name')),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['client-groups'] })
    void queryClient.invalidateQueries({ queryKey: ['client-group-members'] })
  }

  const addGroup = useMutation({
    mutationFn: async () =>
      unwrap(await db.from('client_groups').insert({ name: name.trim(), description: description.trim() || null }).select().single()),
    onSuccess: () => {
      setName('')
      setDescription('')
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const removeGroup = useMutation({
    mutationFn: async (id: string) => unwrap(await db.from('client_groups').delete().eq('id', id)),
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  })

  const toggleMember = useMutation({
    mutationFn: async ({ groupId, clientId, on }: { groupId: string; clientId: string; on: boolean }) =>
      on
        ? unwrap(await db.from('client_group_members').insert({ group_id: groupId, client_id: clientId }))
        : unwrap(await db.from('client_group_members').delete().eq('group_id', groupId).eq('client_id', clientId)),
    onSuccess: refresh,
    onError: (err) => toast.error(err.message),
  })

  const isMember = (groupId: string, clientId: string) =>
    !!members.data?.some((m) => m.group_id === groupId && m.client_id === clientId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Client groups" helpKey="client-groups" />

      <Card>
        <CardHeader>
          <CardTitle>New group</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) addGroup.mutate()
            }}
          >
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <Label htmlFor="group-name">Name</Label>
              <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aerospace & Defense" />
            </div>
            <div className="flex min-w-48 flex-[2] flex-col gap-1">
              <Label htmlFor="group-description">Description</Label>
              <Input id="group-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <Button type="submit" disabled={!name.trim() || addGroup.isPending}>Add group</Button>
          </form>
        </CardContent>
      </Card>

      {groups.isLoading && <Skeleton className="h-32 w-full" />}
      {groups.data?.length === 0 && <p className="text-sm text-slate-500">No groups yet.</p>}

      {groups.data?.map((group) => (
        <Card key={group.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{group.name}</CardTitle>
              {group.description && <p className="mt-1 text-sm text-slate-500">{group.description}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete group ${group.name}`}
              onClick={() => {
                if (window.confirm(`Delete the group "${group.name}"?`)) removeGroup.mutate(group.id)
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Clients in this group</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {clients.data?.map((client) => {
                  const id = `${group.id}-${client.id}`
                  return (
                    <label key={client.id} htmlFor={id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={id}
                        checked={isMember(group.id, client.id)}
                        onCheckedChange={(on) => toggleMember.mutate({ groupId: group.id, clientId: client.id, on: on === true })}
                      />
                      {client.name}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
