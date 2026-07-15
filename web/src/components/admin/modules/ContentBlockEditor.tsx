import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ContentBlock } from '@/types/domain'

const BLOCK_DEFAULTS: Record<ContentBlock['type'], ContentBlock> = {
  heading: { type: 'heading', text: '' },
  paragraph: { type: 'paragraph', text: '' },
  image: { type: 'image', url: '', alt: '' },
  video_embed: { type: 'video_embed', url: '' },
  callout: { type: 'callout', text: '', tone: 'info' },
}

const BLOCK_LABELS: Record<ContentBlock['type'], string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  image: 'Image',
  video_embed: 'Video embed',
  callout: 'Callout',
}

interface ContentBlockEditorProps {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
}

export function ContentBlockEditor({ blocks, onChange }: ContentBlockEditorProps) {
  function addBlock(type: ContentBlock['type']) {
    onChange([...blocks, { ...BLOCK_DEFAULTS[type] }])
  }

  function updateBlock(index: number, next: ContentBlock) {
    onChange(blocks.map((b, i) => (i === index ? next : b)))
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => (
        <div key={index} className="flex gap-2 rounded-lg border border-border p-3">
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{BLOCK_LABELS[block.type]}</p>
            <BlockFields block={block} onChange={(next) => updateBlock(index, next)} />
          </div>
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="icon" onClick={() => moveBlock(index, -1)} disabled={index === 0}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => moveBlock(index, 1)}
              disabled={index === blocks.length - 1}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => removeBlock(index)}>
              <Trash2 className="h-4 w-4 text-status-red" />
            </Button>
          </div>
        </div>
      ))}

      <Select onValueChange={(value) => addBlock(value as ContentBlock['type'])}>
        <SelectTrigger className="w-56">
          <Plus className="h-4 w-4" />
          <SelectValue placeholder="Add a block…" />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(BLOCK_LABELS) as ContentBlock['type'][]).map((type) => (
            <SelectItem key={type} value={type}>
              {BLOCK_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function BlockFields({ block, onChange }: { block: ContentBlock; onChange: (b: ContentBlock) => void }) {
  switch (block.type) {
    case 'heading':
      return <Input value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Heading text" />
    case 'paragraph':
      return (
        <Textarea
          rows={4}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          placeholder="Paragraph text"
        />
      )
    case 'image':
      return (
        <div className="flex flex-col gap-2">
          <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="Image URL" />
          <Input
            value={block.alt ?? ''}
            onChange={(e) => onChange({ ...block, alt: e.target.value })}
            placeholder="Alt text (optional)"
          />
        </div>
      )
    case 'video_embed':
      return (
        <Input
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
          placeholder="Video embed URL (YouTube/Vimeo embed link)"
        />
      )
    case 'callout':
      return (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="Callout text"
          />
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={(block.tone ?? 'info') === 'info'}
                onChange={() => onChange({ ...block, tone: 'info' })}
              />
              Info
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={block.tone === 'warning'}
                onChange={() => onChange({ ...block, tone: 'warning' })}
              />
              Warning
            </label>
          </div>
        </div>
      )
    default:
      return null
  }
}
