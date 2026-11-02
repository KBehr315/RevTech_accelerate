import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label, Textarea } from '@/components/ui/input'
import { PageHeader } from '@/components/common/PageHeader'
import { UploadArea } from '@/components/library/LibraryParts'
import { useWorkspace } from '@/components/client/workspace'
import { useAssets, type LibraryAsset } from '@/hooks/useLibrary'
import { useStartTrainingDraft } from '@/hooks/useTraining'
import { SCOPE_LABELS } from '@/lib/labels'
import type { TrainingOutput, TrainingPiece } from '@/types/domain'
import { PIECE_LABELS } from './labels'

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/|embed\/)|youtu\.be\/)\S+$/

/** "Build with Claude": describe the training; documents and videos are optional (00111). */
export function NewTrainingPage() {
  const { client } = useWorkspace()
  const navigate = useNavigate()
  const startDraft = useStartTrainingDraft()
  const [brief, setBrief] = useState('')
  const [outputs, setOutputs] = useState<TrainingOutput[]>(['slides', 'lesson'])
  const [pieces, setPieces] = useState<TrainingPiece[]>(Object.keys(PIECE_LABELS) as TrainingPiece[])
  const [assetIds, setAssetIds] = useState<string[]>([])
  const [videos, setVideos] = useState<{ url: string; note: string }[]>([])

  const toggle = <T,>(list: T[], value: T, on: boolean) => (on ? [...list, value] : list.filter((v) => v !== value))

  async function build() {
    try {
      const draft = await startDraft.mutateAsync({ clientId: client.id, brief, outputs, pieces, assetIds, videos })
      navigate(`/c/${client.slug}/training/${draft.id}`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Build training with Claude"
        description="Describe the training and, if you like, choose documents for Claude to teach from. Claude writes a slide deck and an interactive lesson for you to review before anyone sees them."
      />

      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <Label htmlFor="training-brief">What should this training cover?</Label>
          <Textarea
            id="training-brief"
            rows={5}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. A 20-minute module for GL accountants new to S/4HANA on posting a general journal entry: when to use it, the steps, the required fields, and what to do if it's rejected. Include a 5-question quiz."
          />
          <p className="text-xs text-slate-500">Say who it's for, roughly how long it should take, the key points, and how many quiz questions you want.</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-slate-900">Make</p>
          <div className="flex flex-wrap gap-6">
            {(
              [
                ['slides', 'PowerPoint deck', 'Slides with speaker notes'],
                ['lesson', 'Interactive lesson', 'Sections, interactive pieces and a quiz'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={outputs.includes(value)}
                  onCheckedChange={(on) => setOutputs((list) => toggle(list, value, on === true))}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-slate-800">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {outputs.includes('lesson') && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="text-sm font-medium text-slate-900">
              Interactive pieces Claude may use <span className="font-normal text-slate-500">— it picks where each one fits</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.entries(PIECE_LABELS) as [TrainingPiece, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={pieces.includes(value)} onCheckedChange={(on) => setPieces((list) => toggle(list, value, on === true))} />
                  {label}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-slate-900">
            Source material <span className="font-normal text-slate-500">— optional; Claude teaches from these first</span>
          </p>
          <DocumentPicker clientId={client.id} selected={assetIds} onChange={setAssetIds} />
          <UploadArea
            clientId={client.id}
            hint="Or add new files: Word, PowerPoint, Excel, PDF, PNG, JPG, TXT or CSV. They're also saved to the library as Drafts, and Claude can see pictures."
            afterUpload={async (asset) => setAssetIds((ids) => [...ids, asset.id])}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm font-medium text-slate-900">
            Videos to include <span className="font-normal text-slate-500">— optional; Claude places each one where it fits</span>
          </p>
          <VideoList videos={videos} onChange={setVideos} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Claude's draft opens as a <strong>Draft</strong>, with notes on anything to check. Nobody else can see it until it's published.
        </p>
        <Button disabled={!brief.trim() || !outputs.length || startDraft.isPending} onClick={() => void build()}>
          <Sparkles className="h-4 w-4" aria-hidden />
          {startDraft.isPending ? 'Starting…' : 'Build with Claude'}
        </Button>
      </div>
    </div>
  )
}

/** Tick documents from this client's library, Shared and Global. */
function DocumentPicker({ clientId, selected, onChange }: { clientId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const own = useAssets({ clientId })
  const shared = useAssets({ sharedWith: clientId })
  const global = useAssets({ scope: 'global' })
  const [filter, setFilter] = useState('')

  const all = useMemo(() => {
    const seen = new Map<string, LibraryAsset>()
    for (const asset of [...(own.data ?? []), ...(shared.data ?? []), ...(global.data ?? [])]) seen.set(asset.id, asset)
    return [...seen.values()]
  }, [own.data, shared.data, global.data])
  const shown = all.filter((a) => a.title.toLowerCase().includes(filter.trim().toLowerCase()))
  const loading = own.isLoading || shared.isLoading || global.isLoading

  if (!loading && !all.length) return <p className="text-sm text-slate-500">The library is empty, so Claude will write from general SAP knowledge unless you add files below.</p>

  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Filter documents" value={filter} onChange={(e) => setFilter(e.target.value)} className="sm:max-w-xs" />
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {loading && <li className="p-3 text-sm text-slate-500">Loading the library…</li>}
        {shown.map((asset) => {
          const blocked = asset.ai_use === 'not_approved'
          return (
            <li key={asset.id}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm">
                <Checkbox
                  disabled={blocked}
                  checked={selected.includes(asset.id)}
                  onCheckedChange={(on) => onChange(on === true ? [...selected, asset.id] : selected.filter((id) => id !== asset.id))}
                />
                <span className="flex-1 truncate text-slate-800">{asset.title}</span>
                <span className="shrink-0 text-xs text-slate-500">{blocked ? 'Not approved for AI' : SCOPE_LABELS[asset.scope]}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {selected.length > 0 && <p className="text-xs text-slate-600">{selected.length} chosen. Ticking a document approves it for this training.</p>}
    </div>
  )
}

function VideoList({ videos, onChange }: { videos: { url: string; note: string }[]; onChange: (videos: { url: string; note: string }[]) => void }) {
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const valid = YOUTUBE.test(url.trim())

  return (
    <div className="flex flex-col gap-3">
      {videos.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {videos.map((v, i) => (
            <li key={v.url} className="flex items-center gap-2">
              <span className="truncate text-slate-800">{v.url}</span>
              <span className="truncate text-slate-500">{v.note}</span>
              <button
                type="button"
                aria-label="Remove video"
                className="rounded p-1 text-slate-400 hover:bg-surface-muted hover:text-slate-700"
                onClick={() => onChange(videos.filter((_, j) => j !== i))}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="video-url">YouTube link</Label>
          <Input id="video-url" placeholder="https://www.youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="video-note">What the video covers</Label>
          <Input id="video-note" placeholder="e.g. 4-minute overview of journal entries in S/4HANA" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button
          variant="outline"
          disabled={!valid || videos.length >= 10}
          onClick={() => {
            onChange([...videos, { url: url.trim(), note: note.trim() }])
            setUrl('')
            setNote('')
          }}
        >
          Add video
        </Button>
      </div>
      <p className="text-xs text-slate-500">Claude can see pictures but can't watch videos, so the note is what it uses to place a video.</p>
    </div>
  )
}
