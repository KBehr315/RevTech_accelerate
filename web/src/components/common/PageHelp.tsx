import { HelpCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HELP_CONTENT, type HelpKey } from './helpContent'

export function PageHelp({ helpKey }: { helpKey: HelpKey }) {
  const entry = HELP_CONTENT[helpKey]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About this page: ${entry.title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-surface-muted hover:text-brand-600"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <h3 className="font-heading text-sm font-semibold text-slate-900">{entry.title}</h3>
        <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600">{entry.body}</div>
      </PopoverContent>
    </Popover>
  )
}
