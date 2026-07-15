import { Info, AlertTriangle } from 'lucide-react'
import type { ContentBlock } from '@/types/domain'
import { cn } from '@/lib/utils'

export function ContentBlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, i) => (
        <ContentBlockItem key={i} block={block} />
      ))}
    </div>
  )
}

function ContentBlockItem({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'heading':
      return <h2 className="font-heading text-xl font-semibold text-slate-900">{block.text}</h2>
    case 'paragraph':
      return <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{block.text}</p>
    case 'image':
      return <img src={block.url} alt={block.alt ?? ''} className="w-full rounded-lg border border-border" />
    case 'video_embed':
      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-border">
          <iframe src={block.url} className="h-full w-full" allowFullScreen title="Training video" />
        </div>
      )
    case 'callout': {
      const isWarning = block.tone === 'warning'
      return (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3 text-sm',
            isWarning
              ? 'border-status-yellow-bg bg-status-yellow-bg text-status-yellow'
              : 'border-brand-100 bg-brand-50 text-brand-800',
          )}
        >
          {isWarning ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{block.text}</span>
        </div>
      )
    }
    default:
      return null
  }
}
