import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/common/PageHeader'
import { useClient, useMembers, useSetupRows } from '@/hooks/useClient'
import { CLASSIFICATION_LABELS, CLIENT_ROLES, CLIENT_ROLE_LABELS, CLIENT_STATUS_LABELS, SETUP_STEPS } from '@/lib/labels'
import { useWorkspace } from './workspace'

const NEXT_PHASES = [
  { name: 'Knowledge library', detail: 'Upload, classify and search this client’s sources alongside Global knowledge.' },
  { name: 'Training generation', detail: 'Generate job aids, decks, assessments and HTML courses from approved sources.' },
  { name: 'Review and approval', detail: 'Comment, approve and publish through this client’s approval stages.' },
  { name: 'Learning', detail: 'Assign training to learners, track completion and report.' },
]

export function ClientHomePage() {
  const { client: summary, roles } = useWorkspace()
  const { data: client } = useClient(summary.id)
  const isCta = roles.includes('client_training_admin')
  const isAdmin = isCta || roles.includes('lms_admin')
  const members = useMembers(summary.id)
  const workstreams = useSetupRows('client_workstreams', summary.id)

  const activeMembers = members.data?.filter((m) => m.is_active) ?? []
  const stepIndex = SETUP_STEPS.findIndex((s) => s.key === client?.setup_step)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={summary.name}
        description={<>Your roles here: {roles.map((r) => CLIENT_ROLE_LABELS[r]).join(', ')}</>}
        helpKey="client-home"
      />

      {client?.status === 'setup' && (
        <Card className="border-status-yellow">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="font-medium text-slate-900">This client is still in setup.</p>
              <p className="text-slate-600">
                {isCta
                  ? `Next step: ${SETUP_STEPS[Math.max(stepIndex, 0)].label}. Learners can't be enrolled until setup is complete.`
                  : 'A Client Training Administrator is finishing setup.'}
              </p>
            </div>
            {isCta && (
              <Button asChild>
                <Link to={`/c/${summary.slug}/setup`}>
                  Continue setup <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-slate-600">
            <p>
              Status: <Badge variant={client?.status === 'active' ? 'success' : 'warning'}>{client ? CLIENT_STATUS_LABELS[client.status] : '—'}</Badge>
            </p>
            <p>Highest classification: {client ? CLASSIFICATION_LABELS[client.max_classification] : '—'}</p>
            <p>AI services allowed: {client ? client.allowed_ai_providers.length || 'none yet' : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workstreams</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {workstreams.rows.data?.length ? (
              <ul className="flex flex-wrap gap-1">
                {workstreams.rows.data.map((w) => <Badge key={w.id} variant="neutral">{w.code} · {w.name}</Badge>)}
              </ul>
            ) : (
              <p>None defined yet.</p>
            )}
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              <ul className="flex flex-col gap-0.5">
                {CLIENT_ROLES.map((role) => (
                  <li key={role} className="flex justify-between">
                    <span>{CLIENT_ROLE_LABELS[role]}</span>
                    <span className="font-medium text-slate-900">{activeMembers.filter((m) => m.roles.includes(role)).length}</span>
                  </li>
                ))}
              </ul>
              <Link to={`/c/${summary.slug}/members`} className="mt-2 inline-block text-brand-600 hover:underline">Manage members</Link>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming next in this workspace</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {NEXT_PHASES.map((p) => (
              <li key={p.name}>
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="text-slate-500">{p.detail}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
