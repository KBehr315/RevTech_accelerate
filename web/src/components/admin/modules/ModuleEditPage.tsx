import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/authStore'
import { useCreateModule, useModule, useUpdateModule } from '@/hooks/useModules'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ContentBlockEditor } from './ContentBlockEditor'
import { ExternalContentForm } from './ExternalContentForm'
import { QuizBuilder } from '@/components/admin/quiz/QuizBuilder'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHelp } from '@/components/common/PageHelp'
import type { ContentBlock, ExternalContentType, ModuleContentType } from '@/types/domain'

interface FormState {
  title: string
  description: string
  contentType: ModuleContentType
  blocks: ContentBlock[]
  externalType: ExternalContentType | null
  externalUrl: string
  renewalMonths: string
  passingScore: string
  isPublished: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  contentType: 'in_app',
  blocks: [],
  externalType: null,
  externalUrl: '',
  renewalMonths: '',
  passingScore: '80',
  isPublished: false,
}

export function ModuleEditPage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const isNew = !moduleId
  const navigate = useNavigate()
  const profile = useAuthStore((s) => s.profile)

  const { data: existing, isLoading } = useModule(moduleId)
  const createModule = useCreateModule()
  const updateModule = useUpdateModule()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Loaded module data arrives asynchronously (React Query), so it can't be
  // a useState lazy initializer. Adjusting state during render (rather than
  // in a useEffect) avoids the extra effect-triggered re-render — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [loadedId, setLoadedId] = useState<string | undefined>(undefined)
  if (existing && existing.id !== loadedId) {
    setLoadedId(existing.id)
    setForm({
      title: existing.title,
      description: existing.description ?? '',
      contentType: existing.content_type,
      blocks: existing.content_blocks ?? [],
      externalType: existing.external_content_type,
      externalUrl: existing.external_url ?? '',
      renewalMonths: existing.renewal_period_months ? String(existing.renewal_period_months) : '',
      passingScore: String(existing.passing_score_pct),
      isPublished: existing.is_published,
    })
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // A draft only needs a title. Full content is required to *publish*, not
  // to save — this is what lets an admin start a module and finish it later.
  const hasContent =
    form.contentType === 'in_app'
      ? form.blocks.length > 0
      : !!form.externalType && form.externalUrl.trim().length > 0

  const canSave = form.title.trim().length > 0
  const canPublish = canSave && hasContent

  async function handleSave() {
    if (!profile) return
    const publishing = form.isPublished && canPublish
    if (form.isPublished && !canPublish) {
      toast.warning('Add module content before publishing — saved as a draft instead.')
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        content_type: form.contentType,
        content_blocks: form.contentType === 'in_app' ? form.blocks : null,
        external_content_type: form.contentType === 'external' ? form.externalType : null,
        external_url: form.contentType === 'external' ? form.externalUrl.trim() : null,
        renewal_period_months: form.renewalMonths ? Number(form.renewalMonths) : null,
        passing_score_pct: Number(form.passingScore) || 80,
        is_published: publishing,
      }

      if (isNew) {
        const created = await createModule.mutateAsync({ ...payload, created_by: profile.id })
        toast.success(publishing ? 'Module created and published' : 'Draft saved — add quiz questions next')
        navigate(`/admin/modules/${created.id}`, { replace: true })
      } else {
        await updateModule.mutateAsync({ id: moduleId!, input: payload })
        toast.success(publishing ? 'Module saved and published' : 'Draft saved')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save module')
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          {isNew ? 'New Training Module' : 'Edit Module'}
        </h1>
        <PageHelp helpKey="admin-module-edit" />
      </div>

      <Tabs defaultValue="content">
        <TabsList>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="quiz" disabled={isNew}>
            Quiz {isNew && '(save first)'}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>Module Details</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Workplace Safety 2026"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Shown to employees before they start"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="passing-score">Passing score (%)</Label>
                  <Input
                    id="passing-score"
                    type="number"
                    min={1}
                    max={100}
                    value={form.passingScore}
                    onChange={(e) => set('passingScore', e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewal">Renewal period (months, blank = one-time)</Label>
                  <Input
                    id="renewal"
                    type="number"
                    min={1}
                    value={form.renewalMonths}
                    onChange={(e) => set('renewalMonths', e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Content type</Label>
                <Select value={form.contentType} onValueChange={(v) => set('contentType', v as ModuleContentType)}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_app">Author content in-app</SelectItem>
                    <SelectItem value="external">Link or embed external content</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.contentType === 'in_app' ? (
                <ContentBlockEditor blocks={form.blocks} onChange={(blocks) => set('blocks', blocks)} />
              ) : (
                <ExternalContentForm
                  contentType={form.externalType}
                  url={form.externalUrl}
                  onChangeType={(t) => set('externalType', t)}
                  onChangeUrl={(u) => set('externalUrl', u)}
                />
              )}

              <div className="flex flex-col gap-1">
                <label className="flex w-fit items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.isPublished}
                    disabled={!hasContent}
                    onChange={(e) => set('isPublished', e.target.checked)}
                  />
                  Published (visible to assigned employees)
                </label>
                {!hasContent && (
                  <p className="text-xs text-slate-400">
                    Add {form.contentType === 'in_app' ? 'at least one content block' : 'a content URL'} before
                    publishing — until then this saves as a draft only you (and other admins) can see.
                  </p>
                )}
              </div>

              <Button onClick={handleSave} disabled={!canSave || saving} className="w-fit">
                {saving
                  ? 'Saving…'
                  : form.isPublished && canPublish
                    ? isNew
                      ? 'Create & Publish'
                      : 'Save & Publish'
                    : 'Save Draft'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quiz">
          {moduleId && (
            <Card>
              <CardHeader>
                <CardTitle>Quiz Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <QuizBuilder moduleId={moduleId} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
