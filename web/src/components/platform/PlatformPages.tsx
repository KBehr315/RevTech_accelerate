import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AuditTable } from '@/components/common/AuditTable'
import { ErrorText, PageHeader } from '@/components/common/PageHeader'
import { useSession } from '@/hooks/useSession'
import {
  useAllClients,
  useHealthCheck,
  usePeople,
  usePlatformAudit,
  usePlatformSettings,
  useSetPlatformRole,
  useSetProfileActive,
  useUpdatePlatformSettings,
  type PersonRow,
} from '@/hooks/usePlatform'
import { CLASSIFICATION_LABELS, CLIENT_ROLE_LABELS, CLIENT_STATUS_LABELS, PLATFORM_ROLE_LABELS } from '@/lib/labels'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import type { ClientRole, PlatformRole } from '@/types/domain'
import { NewClientButton } from './NewClientDialog'

export function PlatformHomePage() {
  const clients = useAllClients()
  const people = usePeople()
  const settings = usePlatformSettings()

  const tiles = [
    { label: 'Clients', value: clients.data?.length, to: '/platform/clients' },
    { label: 'Clients in setup', value: clients.data?.filter((c) => c.status === 'setup').length, to: '/platform/clients' },
    { label: 'People', value: people.data?.length, to: '/platform/people' },
    { label: 'Guests', value: people.data?.filter((p) => p.is_guest).length, to: '/platform/people' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform administration"
        description={
          settings.data &&
          `Environment: ${settings.data.environment_name}. Highest classification allowed here: ${CLASSIFICATION_LABELS[settings.data.max_classification]}.`
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="rounded-xl border border-border bg-white p-4 shadow-card hover:shadow-card-hover">
            <p className="text-sm text-slate-500">{t.label}</p>
            <p className="mt-1 font-heading text-2xl font-semibold text-slate-900">{t.value ?? '—'}</p>
          </Link>
        ))}
      </div>
      <HealthCheckCard />
    </div>
  )
}

function HealthCheckCard() {
  const { start, job } = useHealthCheck()
  const status = job.data?.status
  const waiting = start.isPending || (!!job.data && !['succeeded', 'failed'].includes(status ?? ''))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Background worker</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-slate-600">
        <p>Sends a job through the queue and waits for the worker to pick it up, acting as you.</p>
        <div>
          <Button variant="outline" disabled={waiting} onClick={() => start.mutate()}>
            {waiting ? 'Waiting for the worker…' : 'Run health check'}
          </Button>
        </div>
        {status === 'succeeded' && (
          <p className="text-status-green">
            Worker {String(job.data?.result?.worker ?? '')} answered at {formatDateTime(String(job.data?.result?.database_time ?? ''))}.
          </p>
        )}
        {status === 'failed' && <p className="text-status-red">Failed: {job.data?.last_error}</p>}
        {status === 'queued' && (job.data?.attempts ?? 0) === 0 && (
          <p className="text-xs text-slate-500">Queued. If this doesn't change within a minute, the worker isn't running.</p>
        )}
        <ErrorText error={start.error} />
      </CardContent>
    </Card>
  )
}

export function ClientsPage() {
  const { data: clients, isLoading } = useAllClients()
  const { data: session } = useSession()
  const memberOf = new Set(session?.workspaces.map((w) => w.client.id))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Clients" helpKey="platform-clients" actions={<NewClientButton />} />
      <Card>
        <CardContent className="p-0">
          {isLoading && <Skeleton className="m-4 h-24" />}
          {clients?.length === 0 && <p className="p-4 text-sm text-slate-500">No clients yet.</p>}
          <ul className="divide-y divide-border">
            {clients?.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">/c/{c.slug} · created {formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === 'active' ? 'success' : c.status === 'setup' ? 'warning' : 'neutral'}>
                    {CLIENT_STATUS_LABELS[c.status]}
                  </Badge>
                  {memberOf.has(c.id) ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/c/${c.slug}`}>Open</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">Not a member</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

const PLATFORM_ROLES: PlatformRole[] = ['platform_admin', 'global_knowledge_admin', 'client_creator']

export function PeoplePage() {
  const { data: people, isLoading } = usePeople()
  const me = useAuthStore((s) => s.profile)
  const setRole = useSetPlatformRole()
  const setActive = useSetProfileActive()
  const [filter, setFilter] = useState('')
  const [company, setCompany] = useState(ALL_COMPANIES)

  const matching = people?.filter((p) =>
    `${p.full_name} ${p.email}`.toLowerCase().includes(filter.trim().toLowerCase()),
  )
  const companies = byCompany(people ?? [])
  const shown = byCompany(matching ?? []).filter((c) => company === ALL_COMPANIES || c.id === company)

  function run(promise: Promise<unknown>) {
    promise.catch((err: Error) => toast.error(err.message))
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="People & roles" helpKey="platform-people" />
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-72">
          <Label htmlFor="people-filter" className="sr-only">Filter people</Label>
          <Input id="people-filter" placeholder="Filter by name or email" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="sm:w-72">
          <Label htmlFor="people-company" className="sr-only">Company</Label>
          <Select value={company} onValueChange={setCompany}>
            <SelectTrigger id="people-company">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.people.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading && <Skeleton className="h-24" />}
      {people && shown.length === 0 && <p className="text-sm text-slate-500">Nobody matches.</p>}
      {shown.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle>
              {c.name} <span className="text-sm font-normal text-slate-500">· {c.people.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border border-t border-border">
              {c.people.map(({ person: p, clientRoles }) => {
                const roles = new Set(p.platform_role_grants.map((g) => g.role))
                const isMe = p.id === me?.id
                return (
                  <li key={p.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{p.full_name}</p>
                        {p.is_guest && <Badge variant="neutral">Guest</Badge>}
                        {!p.is_active && <Badge variant="danger">Deactivated</Badge>}
                      </div>
                      <p className="truncate text-xs text-slate-500">{p.email}</p>
                      {clientRoles.length > 0 && (
                        <p className="text-xs text-slate-500">{clientRoles.map((r) => CLIENT_ROLE_LABELS[r]).join(', ')}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      {PLATFORM_ROLES.map((role) => {
                        const id = `${c.id}-${p.id}-${role}`
                        const locked = isMe && role === 'platform_admin'
                        return (
                          <label key={role} htmlFor={id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              id={id}
                              checked={roles.has(role)}
                              disabled={locked || setRole.isPending}
                              onCheckedChange={(on) => run(setRole.mutateAsync({ profileId: p.id, role, granted: on === true }))}
                            />
                            {PLATFORM_ROLE_LABELS[role]}
                          </label>
                        )
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isMe || setActive.isPending}
                        onClick={() => run(setActive.mutateAsync({ profileId: p.id, active: !p.is_active }))}
                      >
                        {p.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const ALL_COMPANIES = 'all'
const REVTECH = 'revtech'

type CompanyGroup = { id: string; name: string; people: { person: PersonRow; clientRoles: ClientRole[] }[] }

/**
 * People under each client they belong to (active memberships), sorted by client
 * name. RevTech comes first: everyone with a platform role, and anyone in no client.
 */
function byCompany(people: PersonRow[]): CompanyGroup[] {
  const revtech: CompanyGroup = { id: REVTECH, name: 'RevTech', people: [] }
  const clients = new Map<string, CompanyGroup>()
  for (const person of people) {
    const memberships = person.memberships.filter((m) => m.is_active && m.client)
    if (person.platform_role_grants.length > 0 || memberships.length === 0) revtech.people.push({ person, clientRoles: [] })
    for (const m of memberships) {
      const group = clients.get(m.client!.id) ?? { id: m.client!.id, name: m.client!.name, people: [] }
      group.people.push({ person, clientRoles: m.roles })
      clients.set(group.id, group)
    }
  }
  const sorted = [...clients.values()].sort((a, b) => a.name.localeCompare(b.name))
  return revtech.people.length > 0 ? [revtech, ...sorted] : sorted
}

export function PlatformAuditPage() {
  const { data: events, isLoading } = usePlatformAudit()
  const { data: people } = usePeople()
  const names = new Map(people?.map((p) => [p.id, p.full_name]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform audit log" helpKey="platform-audit" />
      <Card>
        <CardContent className="p-4">
          <AuditTable events={events} isLoading={isLoading} nameOf={(id) => (id ? names.get(id) ?? 'Unknown person' : 'System')} />
        </CardContent>
      </Card>
    </div>
  )
}

export function PlatformSettingsPage() {
  const { data: settings } = usePlatformSettings()
  const update = useUpdatePlatformSettings()
  const [minutes, setMinutes] = useState<string | null>(null)
  const value = minutes ?? String(settings?.session_idle_minutes ?? '')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-slate-600">
          <p>
            Name: <strong>{settings?.environment_name}</strong>
          </p>
          <p>
            Highest classification any client may hold:{' '}
            <strong>{settings && CLASSIFICATION_LABELS[settings.max_classification]}</strong>. Controlled (CUI) and
            export-controlled content are refused in this environment. Raising this is part of the Government-cloud
            deployment, not a setting.
          </p>
          <p>Retention: not yet decided, so nothing is deleted automatically.</p>
        </CardContent>
      </Card>
      {settings && <MalwareScanningCard scanning={settings.malware_scanning} preview={settings.environment_name === 'preview'} />}
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              update
                .mutateAsync({ session_idle_minutes: Number(value) })
                .then(() => {
                  setMinutes(null)
                  toast.success('Saved')
                })
                .catch((err: Error) => toast.error(err.message))
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="idle-minutes">Sign out after this many idle minutes</Label>
              <Input id="idle-minutes" type="number" min={5} max={480} value={value} onChange={(e) => setMinutes(e.target.value)} className="w-32" />
            </div>
            <Button type="submit" disabled={update.isPending || minutes === null}>Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function MalwareScanningCard({ scanning, preview }: { scanning: 'defender' | 'off'; preview: boolean }) {
  const update = useUpdatePlatformSettings()
  const next = scanning === 'defender' ? 'off' : 'defender'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virus scanning</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-slate-600">
        {scanning === 'defender' ? (
          <p>
            <strong>On.</strong> Each upload waits for Microsoft Defender for Storage to check it. Files can't be
            downloaded or read until the check passes. Defender has to be enabled on the storage account for checks
            to finish.
          </p>
        ) : (
          <p>
            <strong>Off (preview only).</strong> Uploads are not checked, and are labeled "Not scanned" wherever they
            appear. Only use fictional files while scanning is off.
          </p>
        )}
        {preview ? (
          <div>
            <Button
              variant="outline"
              disabled={update.isPending}
              onClick={() =>
                update
                  .mutateAsync({ malware_scanning: next })
                  .then(() => toast.success(next === 'off' ? 'Virus scanning turned off' : 'Virus scanning turned on'))
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              {next === 'off' ? 'Turn off for preview' : 'Turn on'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Scanning can only be turned off in the preview environment.</p>
        )}
      </CardContent>
    </Card>
  )
}
