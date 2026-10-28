import { useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorText, PageHeader } from '@/components/common/PageHeader'
import { useAiProviders, useAiProviderTest, usePlatformSettings, useSaveAiProvider } from '@/hooks/usePlatform'
import { AI_PROVIDER_KIND_LABELS, CLASSIFICATIONS, CLASSIFICATION_LABELS, classificationRank } from '@/lib/labels'
import type { AiProvider, AiProviderKind, Classification } from '@/types/domain'

interface Draft {
  id?: string
  name: string
  kind: AiProviderKind
  model: string
  keyVaultSecret: string
  endpoint: string
  maxClassification: Classification
  isEnabled: boolean
  retentionTerms: string
}

const EMPTY: Draft = {
  name: '',
  kind: 'anthropic',
  model: '',
  keyVaultSecret: '',
  endpoint: '',
  maxClassification: 'internal',
  isEnabled: false,
  retentionTerms: '',
}

function toDraft(p: AiProvider): Draft {
  const config = p.config as { model?: string; key_vault_secret?: string; endpoint?: string }
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    model: config.model ?? '',
    keyVaultSecret: config.key_vault_secret ?? '',
    endpoint: config.endpoint ?? '',
    maxClassification: p.max_classification,
    isEnabled: p.is_enabled,
    retentionTerms: p.retention_terms ?? '',
  }
}

export function AiProvidersPage() {
  const { data: providers, isLoading } = useAiProviders()
  const { data: settings } = usePlatformSettings()
  const save = useSaveAiProvider()
  const [draft, setDraft] = useState<Draft | null>(null)
  const ceiling = settings ? classificationRank(settings.max_classification) : 4
  const test = useAiProviderTest()
  const [testedId, setTestedId] = useState<string | null>(null)
  const testing = test.start.isPending || (!!test.job.data && !['succeeded', 'failed'].includes(test.job.data.status))

  function close() {
    setDraft(null)
    save.reset()
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    await save.mutateAsync({
      id: draft.id,
      name: draft.name.trim(),
      kind: draft.kind,
      config: {
        model: draft.model.trim() || undefined,
        key_vault_secret: draft.keyVaultSecret.trim() || undefined,
        endpoint: draft.endpoint.trim() || undefined,
      },
      max_classification: draft.maxClassification,
      is_enabled: draft.isEnabled,
      retention_terms: draft.retentionTerms.trim() || null,
    })
    toast.success('Saved')
    close()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI providers" helpKey="ai-providers" actions={<Button onClick={() => setDraft(EMPTY)}>Add provider</Button>} />

      <Card>
        <CardContent className="p-0">
          {isLoading && <Skeleton className="m-4 h-24" />}
          {providers?.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No providers yet. Until one is added and enabled, no client can generate training.</p>
          )}
          <ul className="divide-y divide-border">
            {providers?.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <Badge variant={p.is_enabled ? 'success' : 'neutral'}>{p.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {AI_PROVIDER_KIND_LABELS[p.kind]} · up to {CLASSIFICATION_LABELS[p.max_classification]} · CUI: not approved
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testing}
                    onClick={() => {
                      setTestedId(p.id)
                      test.start.mutate(p.id)
                    }}
                  >
                    {testing && testedId === p.id ? 'Testing…' : 'Test connection'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(p))}>Edit</Button>
                </div>
                {testedId === p.id && <ProviderTestResult start={test.start} job={test.job} />}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={!!draft} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          {draft && (
            <form onSubmit={(e) => void submit(e).catch(() => {})} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>{draft.id ? 'Edit provider' : 'Add provider'}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-name">Name</Label>
                <Input id="ai-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-kind">Service</Label>
                <Select value={draft.kind} onValueChange={(kind) => setDraft({ ...draft, kind: kind as AiProviderKind })}>
                  <SelectTrigger id="ai-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AI_PROVIDER_KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ai-model">Model</Label>
                  <Input id="ai-model" placeholder="claude-opus-5-5" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="ai-secret">Key Vault secret name</Label>
                  <Input id="ai-secret" placeholder="anthropic-api-key" value={draft.keyVaultSecret} onChange={(e) => setDraft({ ...draft, keyVaultSecret: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-endpoint">Endpoint or region (if the service needs one)</Label>
                <Input id="ai-endpoint" value={draft.endpoint} onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-ceiling">Highest classification it may receive</Label>
                <Select
                  value={draft.maxClassification}
                  onValueChange={(v) => setDraft({ ...draft, maxClassification: v as Classification })}
                >
                  <SelectTrigger id="ai-ceiling"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CLASSIFICATIONS.filter((c) => classificationRank(c) <= ceiling).map((c) => (
                      <SelectItem key={c} value={c}>{CLASSIFICATION_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="ai-retention">Data retention terms</Label>
                <Input
                  id="ai-retention"
                  placeholder="e.g. no training on inputs; 30-day retention"
                  value={draft.retentionTerms}
                  onChange={(e) => setDraft({ ...draft, retentionTerms: e.target.value })}
                />
              </div>
              <label htmlFor="ai-enabled" className="flex items-center gap-2 text-sm">
                <Checkbox id="ai-enabled" checked={draft.isEnabled} onCheckedChange={(on) => setDraft({ ...draft, isEnabled: on === true })} />
                Enabled
              </label>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Approved for CUI / export-controlled data: no. Not available in this environment.
              </p>
              <ErrorText error={save.error} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" disabled={!draft.name.trim() || save.isPending}>Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ProviderTest = ReturnType<typeof useAiProviderTest>

function ProviderTestResult({ start, job }: ProviderTest) {
  const status = job.data?.status
  const result = job.data?.result
  return (
    <div className="w-full text-sm" role="status">
      {status === 'succeeded' && (
        <p className="text-status-green">
          Connected. {String(result?.model ?? '')} replied: “{String(result?.reply ?? '')}”
        </p>
      )}
      {status === 'failed' && <p className="text-status-red">Failed: {job.data?.last_error}</p>}
      {status === 'queued' && (job.data?.attempts ?? 0) === 0 && (
        <p className="text-xs text-slate-500">Queued. If this doesn't change within a minute, the worker isn't running.</p>
      )}
      <ErrorText error={start.error} />
    </div>
  )
}
