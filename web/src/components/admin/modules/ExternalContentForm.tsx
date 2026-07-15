import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ExternalContentType } from '@/types/domain'

interface ExternalContentFormProps {
  contentType: ExternalContentType | null
  url: string
  onChangeType: (type: ExternalContentType) => void
  onChangeUrl: (url: string) => void
}

const TYPE_LABELS: Record<ExternalContentType, string> = {
  video: 'Video (YouTube, Vimeo, mp4…)',
  pdf: 'PDF document',
  url: 'External web page',
}

export function ExternalContentForm({ contentType, url, onChangeType, onChangeUrl }: ExternalContentFormProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Content type</Label>
        <Select value={contentType ?? undefined} onValueChange={(value) => onChangeType(value as ExternalContentType)}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Choose a content type…" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TYPE_LABELS) as ExternalContentType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="external-url">Content URL</Label>
        <Input
          id="external-url"
          value={url}
          onChange={(e) => onChangeUrl(e.target.value)}
          placeholder="https://…"
        />
        <p className="text-xs text-slate-400">
          Employees will see this embedded, with a link to open it directly if the source blocks embedding.
        </p>
      </div>
    </div>
  )
}
