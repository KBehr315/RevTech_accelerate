import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorText, PageHeader } from '@/components/common/PageHeader'
import { TagInput } from '@/components/common/TagInput'
import { useActivateClient, useClient, useSetupRows, useUpdateClient } from '@/hooks/useClient'
import { useAiProviders, usePlatformSettings } from '@/hooks/usePlatform'
import {
  APPROVAL_STAGE_LABELS,
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS,
  GOVCON_STATUS_LABELS,
  SETUP_STEPS,
  classificationRank,
} from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { ApprovalStage, Classification, Client, GovconStatus, SetupStep } from '@/types/domain'
import { useWorkspace } from './workspace'

type Save = (changes: Partial<Client>) => Promise<void>

/**
 * Client Setup Wizard (master prompt §5). Each step saves on its own and
 * records the next step, so setup can be left and resumed. The client stays
 * "In setup" until activate_client() confirms the required fields.
 */
export function ClientSetupWizard() {
  const { client: summary } = useWorkspace()
  const { data: client, isLoading } = useClient(summary.id)
  const update = useUpdateClient(summary.id)
  const [params, setParams] = useSearchParams()

  if (isLoading || !client) return <Skeleton className="h-64 w-full" />

  const current = (params.get('step') as SetupStep | null) ?? client.setup_step
  const index = SETUP_STEPS.findIndex((s) => s.key === current)
  const reached = SETUP_STEPS.findIndex((s) => s.key === client.setup_step)
  const go = (step: SetupStep) => setParams({ step })

  /** Save this step's fields and move on, remembering the furthest step reached. */
  const saveAndNext: Save = async (changes) => {
    const next = SETUP_STEPS[Math.min(index + 1, SETUP_STEPS.length - 1)].key
    const furthest = SETUP_STEPS[Math.max(reached, index + 1, 0)]?.key ?? 'review'
    await update.mutateAsync({ ...changes, setup_step: furthest } as never)
    go(next)
  }

  const steps: Record<SetupStep, ReactNode> = {
    profile: <ProfileStep client={client} save={saveAndNext} />,
    sap_landscape: <SapStep client={client} save={saveAndNext} />,
    organization: <OrganizationStep clientId={client.id} onNext={() => void saveAndNext({})} />,
    branding: <BrandingStep client={client} save={saveAndNext} />,
    governance: <GovernanceStep client={client} save={saveAndNext} />,
    review: <ReviewStep client={client} goTo={go} />,
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Client setup" description={client.name} helpKey="client-setup" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Setup steps" className="lg:w-56 lg:shrink-0">
          <ol className="flex gap-1 overflow-x-auto lg:flex-col">
            {SETUP_STEPS.map((step, i) => (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => go(step.key)}
                  aria-current={step.key === current ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-white',
                    step.key === current && 'bg-white font-medium text-brand-700 shadow-card',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs',
                      i < reached || client.status === 'active' ? 'border-status-green bg-status-green text-white' : 'border-border-strong',
                    )}
                  >
                    {i < reached || client.status === 'active' ? <Check className="h-3 w-3" aria-label="done" /> : i + 1}
                  </span>
                  {step.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 flex-1">
          {steps[current] ?? steps.profile}
          <div className="mt-2">
            <ErrorText error={update.error} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StepCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        {footer && <div className="flex justify-end gap-2 border-t border-border pt-4">{footer}</div>}
      </CardContent>
    </Card>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function SaveButton({ pending }: { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      Save and continue
    </Button>
  )
}

function useSubmit(save: Save) {
  const [pending, setPending] = useState(false)
  return {
    pending,
    submit: (changes: Partial<Client>) => (e: React.FormEvent) => {
      e.preventDefault()
      setPending(true)
      save(changes)
        .catch(() => {})
        .finally(() => setPending(false))
    },
  }
}

function ProfileStep({ client, save }: { client: Client; save: Save }) {
  const [name, setName] = useState(client.name)
  const [industry, setIndustry] = useState(client.industry ?? '')
  const [govcon, setGovcon] = useState<GovconStatus | ''>(client.govcon_status ?? '')
  const { pending, submit } = useSubmit(save)

  return (
    <form onSubmit={submit({ name: name.trim(), industry: industry.trim() || null, govcon_status: govcon || null })}>
      <StepCard title="Profile" footer={<SaveButton pending={pending} />}>
        <Field id="setup-name" label="Client name">
          <Input id="setup-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field id="setup-industry" label="Industry" hint="For example: Aerospace & Defense, Space systems, Shipbuilding.">
          <Input id="setup-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </Field>
        <Field id="setup-govcon" label="Government contracting status">
          <Select value={govcon} onValueChange={(v) => setGovcon(v as GovconStatus)}>
            <SelectTrigger id="setup-govcon"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {Object.entries(GOVCON_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </StepCard>
    </form>
  )
}

const DEPLOYMENTS = ['RISE with SAP (private cloud)', 'Public cloud', 'On-premise', 'Hosted / other']

function SapStep({ client, save }: { client: Client; save: Save }) {
  const [version, setVersion] = useState(client.sap_landscape.version ?? '')
  const [deployment, setDeployment] = useState(client.sap_landscape.deployment ?? '')
  const [fiori, setFiori] = useState(client.sap_landscape.fiori ?? '')
  const [otherTools, setOtherTools] = useState(client.sap_landscape.other_tools ?? '')
  const [dassian, setDassian] = useState(client.dassian_products)
  const { pending, submit } = useSubmit(save)

  const landscape = Object.fromEntries(
    Object.entries({ version, deployment, fiori, other_tools: otherTools }).filter(([, v]) => v.trim()),
  )

  return (
    <form onSubmit={submit({ sap_landscape: landscape, dassian_products: dassian })}>
      <StepCard title="SAP landscape" footer={<SaveButton pending={pending} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="setup-sap-version" label="SAP version" hint="For example: S/4HANA 2023 FPS02.">
            <Input id="setup-sap-version" value={version} onChange={(e) => setVersion(e.target.value)} />
          </Field>
          <Field id="setup-sap-deployment" label="Deployment model">
            <Select value={deployment} onValueChange={setDeployment}>
              <SelectTrigger id="setup-sap-deployment"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                {DEPLOYMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field id="setup-fiori" label="Fiori configuration" hint="Launchpad, spaces and pages, notable custom apps.">
          <Textarea id="setup-fiori" value={fiori} onChange={(e) => setFiori(e.target.value)} />
        </Field>
        <Field id="setup-dassian" label="Dassian products">
          <TagInput id="setup-dassian" tags={dassian} onChange={setDassian} placeholder="Add a product and press Enter…" />
        </Field>
        <Field id="setup-tools" label="Other integrated tools">
          <Input id="setup-tools" value={otherTools} onChange={(e) => setOtherTools(e.target.value)} />
        </Field>
      </StepCard>
    </form>
  )
}

function OrganizationStep({ clientId, onNext }: { clientId: string; onNext: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <SetupList
        title="Workstreams"
        hint="At least one is required. Codes are short, like FI or CO."
        table="client_workstreams"
        clientId={clientId}
        fields={[
          { key: 'code', label: 'Code', required: true },
          { key: 'name', label: 'Name', required: true },
          { key: 'description', label: 'Description' },
        ]}
        display={(r) => `${r.code} · ${r.name}`}
      />
      <SetupList
        title="Business roles"
        hint="The people who will be trained, such as GL Accountant or Cost Center Manager."
        table="client_business_roles"
        clientId={clientId}
        fields={[
          { key: 'name', label: 'Role', required: true },
          { key: 'description', label: 'Description' },
        ]}
        display={(r) => r.name}
      />
      <SetupList
        title="Client terminology"
        hint="The client's own words, mapped to the standard SAP terms. Generated training keeps the client's words."
        table="client_terms"
        clientId={clientId}
        fields={[
          { key: 'client_term', label: 'Client term', required: true },
          { key: 'standard_term', label: 'Standard term' },
          { key: 'definition', label: 'Definition' },
        ]}
        display={(r) => (r.standard_term ? `${r.client_term} → ${r.standard_term}` : r.client_term)}
      />
      <div className="flex justify-end">
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  )
}

interface ListField {
  key: string
  label: string
  required?: boolean
}

function SetupList<T extends 'client_workstreams' | 'client_business_roles' | 'client_terms'>({
  title,
  hint,
  table,
  clientId,
  fields,
  display,
}: {
  title: string
  hint: string
  table: T
  clientId: string
  fields: ListField[]
  display: (row: any) => string
}) {
  const { rows, add, remove } = useSetupRows(table, clientId)
  const empty = Object.fromEntries(fields.map((f) => [f.key, '']))
  const [draft, setDraft] = useState<Record<string, string>>(empty)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const row = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() || null]))
    add
      .mutateAsync(row as never)
      .then(() => setDraft(empty))
      .catch((err: Error) => toast.error(err.message.includes('duplicate') ? 'That one is already in the list.' : err.message))
  }

  return (
    <StepCard title={title}>
      <p className="-mt-2 text-sm text-slate-500">{hint}</p>
      {rows.isLoading && <Skeleton className="h-10" />}
      {rows.data && rows.data.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {rows.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{display(row)}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${display(row)}`}
                onClick={() => remove.mutateAsync(row.id).catch((err: Error) => toast.error(err.message))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        {fields.map((f) => (
          <div key={f.key} className="flex min-w-32 flex-1 flex-col gap-1">
            <Label htmlFor={`${table}-${f.key}`}>{f.label}</Label>
            <Input
              id={`${table}-${f.key}`}
              value={draft[f.key]}
              required={f.required}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
            />
          </div>
        ))}
        <Button type="submit" variant="outline" disabled={add.isPending}>Add</Button>
      </form>
    </StepCard>
  )
}

function BrandingStep({ client, save }: { client: Client; save: Save }) {
  const [primary, setPrimary] = useState(client.branding.primary_color ?? '#233145')
  const [accent, setAccent] = useState(client.branding.accent_color ?? '#4d6a92')
  const { pending, submit } = useSubmit(save)

  return (
    <form onSubmit={submit({ branding: { ...client.branding, primary_color: primary, accent_color: accent } })}>
      <StepCard title="Branding" footer={<SaveButton pending={pending} />}>
        <p className="text-sm text-slate-500">
          Generated training uses the RevTech template with these colours. Logo upload arrives with file storage later in
          this phase.
        </p>
        <div className="flex flex-wrap gap-6">
          <Field id="setup-primary" label="Primary colour">
            <Input id="setup-primary" type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-10 w-24 p-1" />
          </Field>
          <Field id="setup-accent" label="Accent colour" hint="Also used for this client's context label.">
            <Input id="setup-accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 w-24 p-1" />
          </Field>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="mb-2 text-xs uppercase text-slate-500">Preview</p>
          <div className="rounded-md p-4 text-white" style={{ backgroundColor: primary }}>
            <p className="font-heading text-lg font-semibold">{client.name}</p>
            <span className="mt-2 inline-block rounded px-2 py-0.5 text-sm" style={{ backgroundColor: accent }}>
              Post a General Journal Entry
            </span>
          </div>
        </div>
      </StepCard>
    </form>
  )
}

const STAGES: ApprovalStage[] = ['contributor', 'sme', 'client']

function GovernanceStep({ client, save }: { client: Client; save: Save }) {
  const { data: settings } = usePlatformSettings()
  // Platform Administrators also see disabled providers; a client may only allow enabled ones.
  const providers = useAiProviders().data?.filter((p) => p.is_enabled)
  const [maxClass, setMaxClass] = useState<Classification>(client.max_classification)
  // Drop any provider that has since been disabled, so saving the step still works.
  const [allowed, setAllowed] = useState(client.allowed_ai_providers)
  const enabledAllowed = allowed.filter((id) => !providers || providers.some((p) => p.id === id))
  const [stages, setStages] = useState(client.approval_stages)
  const [accessibility, setAccessibility] = useState(client.accessibility_requirements ?? '')
  const [exportNotes, setExportNotes] = useState(client.export_control_notes ?? '')
  const [support, setSupport] = useState(client.support_contact ?? '')
  const { pending, submit } = useSubmit(save)
  const ceiling = settings ? classificationRank(settings.max_classification) : 4

  return (
    <form
      onSubmit={submit({
        max_classification: maxClass,
        allowed_ai_providers: enabledAllowed,
        approval_stages: STAGES.filter((s) => stages.includes(s)),
        accessibility_requirements: accessibility.trim() || null,
        export_control_notes: exportNotes.trim() || null,
        support_contact: support.trim() || null,
      })}
    >
      <StepCard title="Governance" footer={<SaveButton pending={pending} />}>
        <Field
          id="setup-classification"
          label="Most sensitive data this client may hold"
          hint="Controlled (CUI) and export-controlled data can't be held in this environment."
        >
          <Select value={maxClass} onValueChange={(v) => setMaxClass(v as Classification)}>
            <SelectTrigger id="setup-classification"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CLASSIFICATIONS.map((c) => (
                <SelectItem key={c} value={c} disabled={classificationRank(c) > ceiling}>
                  {CLASSIFICATION_LABELS[c]}
                  {classificationRank(c) > ceiling ? ' (not allowed here)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">AI services this client allows</legend>
          {!providers?.length && (
            <p className="text-sm text-slate-500">
              No AI services are enabled on the platform yet. A Platform Administrator adds and enables them under AI providers.
            </p>
          )}
          {providers?.map((p) => {
            const tooLow = classificationRank(p.max_classification) < classificationRank(maxClass)
            return (
              <label key={p.id} htmlFor={`provider-${p.id}`} className="flex items-start gap-2 text-sm">
                <Checkbox
                  id={`provider-${p.id}`}
                  className="mt-0.5"
                  checked={allowed.includes(p.id)}
                  onCheckedChange={(on) => setAllowed(on === true ? [...allowed, p.id] : allowed.filter((id) => id !== p.id))}
                />
                <span>
                  {p.name}
                  <span className="block text-xs text-slate-500">
                    Accepts up to {CLASSIFICATION_LABELS[p.max_classification]}
                    {tooLow && '. Sources above that level will never be sent to it.'}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">Review stages before approval</legend>
          {STAGES.map((s) => (
            <label key={s} htmlFor={`stage-${s}`} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`stage-${s}`}
                checked={stages.includes(s)}
                onCheckedChange={(on) => setStages(on === true ? [...stages, s] : stages.filter((x) => x !== s))}
              />
              {APPROVAL_STAGE_LABELS[s]}
            </label>
          ))}
        </fieldset>

        <Field id="setup-support" label="Support contact" hint="Where learners' unanswered questions go. Required to activate.">
          <Input id="setup-support" value={support} onChange={(e) => setSupport(e.target.value)} placeholder="training-help@client.example" />
        </Field>
        <Field id="setup-accessibility" label="Accessibility requirements">
          <Textarea id="setup-accessibility" value={accessibility} onChange={(e) => setAccessibility(e.target.value)} />
        </Field>
        <Field id="setup-export" label="Export-control notes">
          <Textarea id="setup-export" value={exportNotes} onChange={(e) => setExportNotes(e.target.value)} />
        </Field>
      </StepCard>
    </form>
  )
}

function ReviewStep({ client, goTo }: { client: Client; goTo: (step: SetupStep) => void }) {
  const activate = useActivateClient(client.id)
  const workstreams = useSetupRows('client_workstreams', client.id)
  const navigate = useNavigate()

  const checks: { label: string; ok: boolean; step: SetupStep }[] = [
    { label: 'Industry', ok: !!client.industry, step: 'profile' },
    { label: 'Government contracting status', ok: !!client.govcon_status, step: 'profile' },
    { label: 'SAP landscape', ok: Object.keys(client.sap_landscape).length > 0, step: 'sap_landscape' },
    { label: 'At least one workstream', ok: (workstreams.rows.data?.length ?? 0) > 0, step: 'organization' },
    { label: 'Support contact', ok: !!client.support_contact, step: 'governance' },
  ]
  const ready = checks.every((c) => c.ok)

  return (
    <StepCard
      title="Review"
      footer={
        client.status === 'active' ? (
          <p className="text-sm text-status-green">This client is active.</p>
        ) : (
          <Button
            disabled={!ready || activate.isPending}
            onClick={() =>
              activate
                .mutateAsync()
                .then(() => {
                  toast.success(`${client.name} is active`)
                  navigate(`/c/${client.slug}`)
                })
                .catch(() => {})
            }
          >
            Activate client
          </Button>
        )
      }
    >
      <ul className="flex flex-col gap-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-2 text-sm">
            <span className={c.ok ? 'text-slate-700' : 'text-status-red'}>
              {c.ok ? '✓' : '✗'} {c.label}
            </span>
            {!c.ok && (
              <Button variant="link" size="sm" onClick={() => goTo(c.step)}>Fix</Button>
            )}
          </li>
        ))}
      </ul>
      {client.allowed_ai_providers.length === 0 && (
        <p className="text-sm text-slate-500">
          No AI services allowed yet. The client can be activated, but training can't be generated until one is allowed.
        </p>
      )}
      <ErrorText error={activate.error} />
    </StepCard>
  )
}
