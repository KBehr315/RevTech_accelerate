// Pieces shared by the client Library and the Global Library: uploading, the
// list of documents in a bucket, moving or copying between buckets, and search.

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronUp, Download, ExternalLink, FolderInput, Search, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  downloadFile,
  openPdfAtPage,
  useAudienceChoices,
  useLibrarySearch,
  usePlaceAsset,
  useUpload,
  type LibraryAsset,
  type Placement,
} from '@/hooks/useLibrary'
import {
  AI_USE_LABELS,
  ASSET_APPROVAL_LABELS,
  CLASSIFICATION_LABELS,
  EXTRACTION_STATUS_LABELS,
  SCAN_STATUS_LABELS,
  SCOPE_DESCRIPTIONS,
  SCOPE_LABELS,
  UPLOAD_EXTENSIONS,
  formatBytes,
  locatorLabel,
} from '@/lib/labels'
import { cn, formatDate } from '@/lib/utils'
import type { ExtractionStatus, KnowledgeAsset, KnowledgeScope, ScanStatus, SearchResult } from '@/types/domain'

type Pending = { key: string; name: string; status: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string }

const SCAN_VARIANT: Record<ScanStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  clean: 'success',
  infected: 'danger',
  failed: 'danger',
  not_scanned: 'warning',
}

const EXTRACTION_VARIANT: Record<ExtractionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  running: 'neutral',
  done: 'success',
  failed: 'danger',
  skipped: 'neutral',
  needs_ocr: 'warning',
}

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/**
 * Drop zone for one or more files. `clientId` null uploads outside a client, to
 * Pending; `afterUpload` can then place each new document (the Global Library).
 */
export function UploadArea({
  clientId,
  hint,
  afterUpload,
  children,
}: {
  clientId: string | null
  hint: string
  afterUpload?: (asset: KnowledgeAsset) => Promise<unknown>
  children?: ReactNode
}) {
  const upload = useUpload(clientId)
  const [dragging, setDragging] = useState(false)
  const [queue, setQueue] = useState<Pending[]>([])

  const update = (key: string, changes: Partial<Pending>) =>
    setQueue((items) => items.map((item) => (item.key === key ? { ...item, ...changes } : item)))

  // One at a time, so a large batch doesn't open dozens of connections at once.
  async function add(files: File[]) {
    const items = files.map((file, i) => ({ file, key: `${Date.now()}-${i}-${file.name}` }))
    setQueue((current) => [
      ...current.filter((item) => item.status !== 'done'),
      ...items.map(({ file, key }) => ({ key, name: file.name, status: 'waiting' as const })),
    ])
    for (const { file, key } of items) {
      if (!UPLOAD_EXTENSIONS.includes(extensionOf(file.name))) {
        update(key, { status: 'failed', error: 'This file type is not supported yet.' })
        continue
      }
      update(key, { status: 'uploading' })
      try {
        const asset = await upload.mutateAsync(file)
        await afterUpload?.(asset)
        update(key, { status: 'done' })
      } catch (err) {
        update(key, { status: 'failed', error: (err as Error).message })
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {children}
      <label
        htmlFor="library-upload"
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void add(Array.from(e.dataTransfer.files))
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-white p-8 text-center transition-colors hover:border-brand-400',
          dragging && 'border-brand-500 bg-brand-50',
        )}
      >
        <Upload className="h-6 w-6 text-slate-400" aria-hidden />
        <span className="text-sm font-medium text-slate-800">Drop files here, or click to choose</span>
        <span className="text-xs text-slate-500">{hint}</span>
        <input
          id="library-upload"
          type="file"
          multiple
          accept={UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          className="sr-only"
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </label>
      {queue.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
          {queue.map((item) => (
            <li key={item.key} className="flex flex-wrap items-center gap-2">
              <span className="truncate text-slate-700">{item.name}</span>
              {item.status === 'waiting' && <span className="text-xs text-slate-500">Waiting</span>}
              {item.status === 'uploading' && <span className="text-xs text-slate-500">Uploading…</span>}
              {item.status === 'done' && <span className="text-xs text-status-green">Uploaded</span>}
              {item.status === 'failed' && <span className="text-xs text-status-red">{item.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The documents in one bucket, with an optional action per row (move, copy). */
export function AssetList({
  assets,
  isLoading,
  empty,
  action,
  note,
}: {
  assets: LibraryAsset[] | undefined
  isLoading: boolean
  empty: string
  action?: (asset: LibraryAsset) => ReactNode
  note?: (asset: LibraryAsset) => ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading && <Skeleton className="m-4 h-24" />}
        {assets?.length === 0 && <p className="p-4 text-sm text-slate-500">{empty}</p>}
        <ul className="divide-y divide-border">
          {assets?.map((asset) => (
            <AssetRow key={asset.id} asset={asset} action={action?.(asset)} note={note?.(asset)} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function AssetRow({ asset, action, note }: { asset: LibraryAsset; action?: ReactNode; note?: ReactNode }) {
  const file = asset.current?.file
  const [busy, setBusy] = useState(false)
  const downloadable = file && (file.scan_status === 'clean' || file.scan_status === 'not_scanned')
  const audiences = asset.scope === 'shared' ? audienceNames(asset) : []

  return (
    <li className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{asset.title}</p>
        <p className="truncate text-xs text-slate-500">
          {file?.filename} · {formatBytes(file?.bytes ?? null)} · version {asset.current?.version_no} · added by{' '}
          {asset.uploader?.full_name ?? 'someone'} on {formatDate(asset.created_at)}
        </p>
        {audiences.length > 0 && <p className="text-xs text-slate-500">Shared with {audiences.join(', ')}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {asset.scope !== 'client' && <Badge>{SCOPE_LABELS[asset.scope]}</Badge>}
          <Badge variant="neutral">{CLASSIFICATION_LABELS[asset.security_classification]}</Badge>
          <Badge variant={asset.approval_status === 'approved' ? 'success' : 'neutral'}>
            {ASSET_APPROVAL_LABELS[asset.approval_status]}
          </Badge>
          <Badge variant={asset.ai_use === 'generation' ? 'success' : 'warning'}>{AI_USE_LABELS[asset.ai_use]}</Badge>
          {file && <Badge variant={SCAN_VARIANT[file.scan_status]}>{SCAN_STATUS_LABELS[file.scan_status]}</Badge>}
          {asset.current && (
            <Badge variant={EXTRACTION_VARIANT[asset.current.extraction_status]} title={asset.current.extraction_detail ?? undefined}>
              {EXTRACTION_STATUS_LABELS[asset.current.extraction_status]}
            </Badge>
          )}
          {note}
        </div>
        {asset.current?.extraction_detail && asset.current.extraction_status !== 'done' && (
          <p className="mt-1 text-xs text-slate-500">{asset.current.extraction_detail}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {action}
        {file && (
          <Button
            variant="outline"
            size="sm"
            disabled={!downloadable || busy}
            title={downloadable ? undefined : 'Available once the virus check has passed'}
            onClick={() => {
              setBusy(true)
              downloadFile(file.id, file.filename)
                .catch((err: Error) => toast.error(err.message))
                .finally(() => setBusy(false))
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download
          </Button>
        )}
      </div>
    </li>
  )
}

const audienceNames = (asset: LibraryAsset) =>
  (asset.audiences ?? []).map((a) => a.client?.name ?? a.client_group?.name).filter((name): name is string => !!name)

/**
 * Chooses where a document goes. For a client's document this makes a copy
 * (the client keeps its own); for anything else it moves the document.
 */
export function PlaceDialog({
  asset,
  choices,
  open,
  onOpenChange,
}: {
  asset: LibraryAsset
  choices: KnowledgeScope[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const copying = asset.scope === 'client'
  const current = asset.scope === 'shared' ? asset.audiences ?? [] : []
  const [scope, setScope] = useState<KnowledgeScope>(choices.includes(asset.scope) ? asset.scope : choices[0])
  const [clientIds, setClientIds] = useState<string[]>(current.flatMap((a) => (a.client ? [a.client.id] : [])))
  const [groupIds, setGroupIds] = useState<string[]>(current.flatMap((a) => (a.client_group ? [a.client_group.id] : [])))
  const audienceChoices = useAudienceChoices(open && choices.includes('shared'))
  const place = usePlaceAsset()

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id))
  const needsAudience = scope === 'shared' && clientIds.length + groupIds.length === 0

  async function submit() {
    const to: Placement = scope === 'shared' ? { scope, clientIds, groupIds } : { scope }
    try {
      await place.mutateAsync({ asset, to })
      toast.success(copying ? `Copied to ${SCOPE_LABELS[scope]}` : `Moved to ${SCOPE_LABELS[scope]}`)
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copying ? 'Copy to another library' : 'Move to another library'}</DialogTitle>
          <DialogDescription>
            {copying
              ? `"${asset.title}" stays in this client's library. The copy gets the same file and text.`
              : `Choose who can see "${asset.title}".`}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as KnowledgeScope)} className="flex flex-col gap-3">
          {choices.map((choice) => (
            <label key={choice} className="flex cursor-pointer items-start gap-3">
              <RadioGroupItem value={choice} className="mt-0.5" />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">{SCOPE_LABELS[choice]}</span>
                <span className="text-xs text-slate-500">{SCOPE_DESCRIPTIONS[choice]}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {scope === 'shared' && (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border p-3">
            {audienceChoices.isLoading && <Skeleton className="h-16" />}
            {audienceChoices.data && (
              <>
                <AudiencePicker
                  label="Client groups"
                  items={audienceChoices.data.groups}
                  selected={groupIds}
                  onChange={(id, on) => setGroupIds((list) => toggle(list, id, on))}
                  empty="No client groups yet. Create them under Client groups."
                />
                <AudiencePicker
                  label="Clients"
                  items={audienceChoices.data.clients}
                  selected={clientIds}
                  onChange={(id, on) => setClientIds((list) => toggle(list, id, on))}
                  empty="No clients yet."
                />
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={place.isPending || needsAudience} onClick={() => void submit()}>
            {copying ? 'Copy' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AudiencePicker({
  label,
  items,
  selected,
  onChange,
  empty,
}: {
  label: string
  items: { id: string; name: string }[]
  selected: string[]
  onChange: (id: string, on: boolean) => void
  empty: string
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</legend>
      {items.length === 0 && <p className="text-xs text-slate-500">{empty}</p>}
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={selected.includes(item.id)} onCheckedChange={(on) => onChange(item.id, on === true)} />
          {item.name}
        </label>
      ))}
    </fieldset>
  )
}

/** A button that opens PlaceDialog for one document. */
export function PlaceButton({ asset, choices, label }: { asset: LibraryAsset; choices: KnowledgeScope[]; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderInput className="h-4 w-4" aria-hidden />
        {label}
      </Button>
      {open && <PlaceDialog asset={asset} choices={choices} open={open} onOpenChange={setOpen} />}
    </>
  )
}

// ============================================================================
// Search, grouped by document
// ============================================================================

const SHOWN_PER_DOCUMENT = 3

type DocumentHits = { first: SearchResult; hits: SearchResult[] }

/** Results come best-first; each document keeps the position of its best passage. */
function byDocument(results: SearchResult[]): DocumentHits[] {
  const groups = new Map<string, DocumentHits>()
  for (const result of results) {
    const group = groups.get(result.asset_id)
    if (group) group.hits.push(result)
    else groups.set(result.asset_id, { first: result, hits: [result] })
  }
  return [...groups.values()]
}

export function LibrarySearch({ clientId, hint }: { clientId: string | null; hint: string }) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const { data: results, isFetching, error } = useLibrarySearch(clientId, query)
  const documents = results ? byDocument(results) : []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search the library</CardTitle>
        <p className="text-xs text-slate-500">{hint}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(draft.trim())
          }}
        >
          <Label htmlFor="library-search" className="sr-only">Search the library</Label>
          <Input
            id="library-search"
            placeholder='e.g. accrual reversal, FB50, "cost center"'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" disabled={draft.trim().length < 2}>
            <Search className="h-4 w-4" aria-hidden />
            Search
          </Button>
        </form>
        {isFetching && <p className="text-sm text-slate-500">Searching…</p>}
        {error && <p className="text-sm text-status-red">{(error as Error).message}</p>}
        {results && !isFetching && (
          <div aria-live="polite">
            {documents.length === 0 ? (
              <p className="text-sm text-slate-500">No passages match "{query}". Files still being read won't show up yet.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  {documents.length === 1 ? '1 document' : `${documents.length} documents`} match "{query}".
                </p>
                <ul className="flex flex-col divide-y divide-border">
                  {documents.map((doc) => <DocumentResult key={doc.first.asset_id} doc={doc} />)}
                </ul>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** The snippet with matches (marked [[ and ]] by search_library) highlighted, without injecting HTML. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/\[\[|\]\]/)
  return (
    <p className="text-sm text-slate-700">
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-yellow-100 px-0.5">{part}</mark> : part))}
    </p>
  )
}

function DocumentResult({ doc }: { doc: DocumentHits }) {
  const { first, hits } = doc
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<void>) => {
    setBusy(true)
    action()
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false))
  }
  const isPdf = first.filename.toLowerCase().endsWith('.pdf')
  const shown = expanded ? hits : hits.slice(0, SHOWN_PER_DOCUMENT)
  const hidden = hits.length - SHOWN_PER_DOCUMENT

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">
          {first.title}{' '}
          <span className="text-xs font-normal text-slate-500">
            · {hits.length === 1 ? '1 match' : `${hits.length} matches`}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Badge>{SCOPE_LABELS[first.scope]}</Badge>
          <Badge variant={first.approval_status === 'approved' ? 'success' : 'neutral'}>
            {ASSET_APPROVAL_LABELS[first.approval_status]}
          </Badge>
          <Badge variant="neutral">{CLASSIFICATION_LABELS[first.security_classification]}</Badge>
        </div>
      </div>
      <ul className="flex flex-col gap-3 border-l-2 border-border pl-3">
        {shown.map((hit) => (
          <li key={hit.chunk_id} className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
              {locatorLabel(hit.locator)}
              {isPdf && hit.locator.page && (
                <button
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-brand-600 hover:underline disabled:opacity-50"
                  onClick={() => run(() => openPdfAtPage(hit.file_id, hit.locator.page!))}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  Open at page {hit.locator.page}
                </button>
              )}
            </p>
            <Snippet text={hit.snippet} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {hidden > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            {expanded ? 'Show fewer' : `Show ${hidden} more`}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => downloadFile(first.file_id, first.filename))}>
          <Download className="h-4 w-4" aria-hidden />
          Download {first.filename}
        </Button>
      </div>
    </li>
  )
}
