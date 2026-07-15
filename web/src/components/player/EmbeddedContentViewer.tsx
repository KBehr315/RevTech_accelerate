import { ExternalLink } from 'lucide-react'
import type { ExternalContentType } from '@/types/domain'

export function EmbeddedContentViewer({ url, type }: { url: string; type: ExternalContentType }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-border bg-slate-50">
        {type === 'video' ? (
          <div className="aspect-video w-full">
            <iframe src={url} className="h-full w-full" allowFullScreen title="Training content" />
          </div>
        ) : (
          <iframe src={url} className="h-[70svh] w-full" title="Training content" />
        )}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-brand-600 hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open in a new tab
      </a>
      <p className="text-xs text-slate-400">
        If the content above doesn't load, the source may block embedding — use "Open in a new tab" instead.
      </p>
    </div>
  )
}
