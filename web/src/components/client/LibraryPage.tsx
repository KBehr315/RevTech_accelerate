import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/common/PageHeader'
import { downloadFile, useClientAssets, useUpload, type LibraryAsset } from '@/hooks/useLibrary'
import {
  AI_USE_LABELS,
  ASSET_APPROVAL_LABELS,
  CLASSIFICATION_LABELS,
  SCAN_STATUS_LABELS,
  UPLOAD_EXTENSIONS,
  formatBytes,
} from '@/lib/labels'
import { cn, formatDate } from '@/lib/utils'
import type { ScanStatus } from '@/types/domain'
import { useWorkspace } from './workspace'

type Pending = { key: string; name: string; status: 'waiting' | 'uploading' | 'done' | 'failed'; error?: string }

const SCAN_VARIANT: Record<ScanStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  clean: 'success',
  infected: 'danger',
  failed: 'danger',
  not_scanned: 'warning',
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
        </div>
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
