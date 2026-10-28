import { useState } from 'react'
import { toast } from 'sonner'
import { Download, ExternalLink, Search, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/PageHeader'
import {
  downloadFile,
  openPdfAtPage,
  useClientAssets,
  useLibrarySearch,
  useUpload,
  type LibraryAsset,
} from '@/hooks/useLibrary'
import {
  AI_USE_LABELS,
  ASSET_APPROVAL_LABELS,
  CLASSIFICATION_LABELS,
  EXTRACTION_STATUS_LABELS,
  SCAN_STATUS_LABELS,
  SCOPE_LABELS,
  UPLOAD_EXTENSIONS,
  formatBytes,
  locatorLabel,
} from '@/lib/labels'
import { cn, formatDate } from '@/lib/utils'
import type { ExtractionStatus, ScanStatus, SearchResult } from '@/types/domain'
import { useWorkspace } from './workspace'

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

export function LibraryPage() {
  const { client, roles } = useWorkspace()
  const { data: assets, isLoading } = useClientAssets(client.id)
  const canUpload = roles.includes('client_training_admin') || roles.includes('contributor')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Library"
        helpKey="library"
        description={`Source material for ${client.name}'s training. Files here are Client-Specific: only ${client.name}'s members can see them.`}
      />
      {canUpload && <UploadArea clientId={client.id} />}
      <LibrarySearch clientId={client.id} />
      <Card>
        <CardContent className="p-0">
          {isLoading && <Skeleton className="m-4 h-24" />}
          {assets?.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              {canUpload ? 'Nothing here yet. Upload the first files above.' : 'Nothing has been shared with you here yet.'}
            </p>
          )}
          <ul className="divide-y divide-border">
            {assets?.map((asset) => <AssetRow key={asset.id} asset={asset} />)}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

function UploadArea({ clientId }: { clientId: string }) {
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
        await upload.mutateAsync(file)
        update(key, { status: 'done' })
      } catch (err) {
        update(key, { status: 'failed', error: (err as Error).message })
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
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
        <span className="text-xs text-slate-500">
          Word, PowerPoint, Excel, PDF, PNG, JPG, TXT or CSV. New files start as Draft, Client Confidential, and
          need human approval before AI can use them.
        </span>
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

function AssetRow({ asset }: { asset: LibraryAsset }) {
  const file = asset.current?.file
  const [busy, setBusy] = useState(false)
  const downloadable = file && (file.scan_status === 'clean' || file.scan_status === 'not_scanned')

  return (
    <li className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{asset.title}</p>
        <p className="truncate text-xs text-slate-500">
          {file?.filename} · {formatBytes(file?.bytes ?? null)} · version {asset.current?.version_no} · uploaded by{' '}
          {asset.uploader?.full_name ?? 'someone'} on {formatDate(asset.created_at)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
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
        </div>
        {asset.current?.extraction_detail && asset.current.extraction_status !== 'done' && (
          <p className="mt-1 text-xs text-slate-500">{asset.current.extraction_detail}</p>
        )}
      </div>
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
    </li>
  )
}

function LibrarySearch({ clientId }: { clientId: string }) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const { data: results, isFetching, error } = useLibrarySearch(clientId, query)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search the library</CardTitle>
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
            {results.length === 0 ? (
              <p className="text-sm text-slate-500">No passages match "{query}". Files still being read won't show up yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {results.map((result) => <SearchResultRow key={result.chunk_id} result={result} />)}
              </ul>
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

function SearchResultRow({ result }: { result: SearchResult }) {
  const [busy, setBusy] = useState(false)
  const run = (action: () => Promise<void>) => {
    setBusy(true)
    action()
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setBusy(false))
  }
  const isPdf = result.filename.toLowerCase().endsWith('.pdf')

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-slate-900">
          {result.title} <span className="text-xs font-normal text-slate-500">· {locatorLabel(result.locator)}</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {result.scope !== 'client' && <Badge>{SCOPE_LABELS[result.scope]}</Badge>}
          <Badge variant={result.approval_status === 'approved' ? 'success' : 'neutral'}>
            {ASSET_APPROVAL_LABELS[result.approval_status]}
          </Badge>
          <Badge variant="neutral">{CLASSIFICATION_LABELS[result.security_classification]}</Badge>
        </div>
      </div>
      <Snippet text={result.snippet} />
      <div className="flex flex-wrap gap-2">
        {isPdf && result.locator.page && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => openPdfAtPage(result.file_id, result.locator.page!))}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open at page {result.locator.page}
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => downloadFile(result.file_id, result.filename))}>
          <Download className="h-4 w-4" aria-hidden />
          Download {result.filename}
        </Button>
      </div>
    </li>
  )
}
