import { Link } from 'react-router-dom'
import { Building2, Globe, GraduationCap, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { NewClientButton } from '@/components/platform/NewClientDialog'
import { destinations, hasPlatformRole, useSession, type Destination } from '@/hooks/useSession'
import { CLIENT_ROLE_LABELS, CLIENT_STATUS_LABELS } from '@/lib/labels'

const ICONS = { client: Building2, global: Globe, platform: Settings2, learn: GraduationCap }

const DESCRIPTIONS: Record<Exclude<Destination['kind'], 'client'>, string> = {
  learn: 'The training assigned to you.',
  global: 'Knowledge shared across clients, and the client groups that receive restricted content.',
  platform: 'Clients, people, AI providers, security settings and the platform audit log.',
}

export function ContextPickerPage() {
  const { data: session, isLoading } = useSession()
  const options = session ? destinations(session) : []
  const canCreate = hasPlatformRole(session, 'platform_admin') || hasPlatformRole(session, 'client_creator')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Where would you like to work?"
        description="You can switch at any time from the label at the top of the page."
        helpKey="contexts"
        actions={canCreate ? <NewClientButton /> : undefined}
      />

      {isLoading && <Skeleton className="h-32 w-full" />}

      {!isLoading && options.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Your access hasn't been set up yet.</p>
            <p className="mt-1">
              An administrator needs to add you to a client before anything appears here. If you were expecting access,
              contact the person who invited you.
            </p>
          </CardContent>
        </Card>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((dest) => {
          const Icon = ICONS[dest.kind]
          const accent = dest.workspace?.client.branding.accent_color
          return (
            <li key={dest.key}>
              <Link
                to={dest.to}
                className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
                    style={accent ? { backgroundColor: accent, color: 'white' } : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="font-heading text-base font-semibold text-slate-900">{dest.label}</span>
                </div>
                {dest.workspace ? (
                  <div className="flex flex-wrap gap-1">
                    {dest.workspace.client.status !== 'active' && (
                      <Badge variant="warning">{CLIENT_STATUS_LABELS[dest.workspace.client.status]}</Badge>
                    )}
                    {dest.workspace.roles.map((r) => (
                      <Badge key={r} variant="neutral">{CLIENT_ROLE_LABELS[r]}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{DESCRIPTIONS[dest.kind as Exclude<Destination['kind'], 'client'>]}</p>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
