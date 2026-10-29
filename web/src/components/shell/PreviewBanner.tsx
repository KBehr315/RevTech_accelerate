import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CLIENT_ROLE_LABELS } from '@/lib/labels'
import { usePreviewStore } from '@/store/previewStore'

/** Always on screen while previewing a role, with the way out. */
export function PreviewBanner() {
  const preview = usePreviewStore((s) => s.preview)
  const stop = usePreviewStore((s) => s.stop)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (!preview) return null

  return (
    <div className="flex flex-wrap items-center gap-3 bg-amber-400 px-4 py-2 text-sm text-slate-900 md:px-6">
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <p className="flex-1">
        Viewing as <strong>{CLIENT_ROLE_LABELS[preview.role]}</strong> at <strong>{preview.client.name}</strong>. Read-only:
        nothing can be changed.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="bg-white"
        onClick={() => {
          stop()
          // Everything loaded during the preview was seen as that role.
          queryClient.removeQueries()
          navigate('/platform/view-as')
        }}
      >
        Exit preview
      </Button>
    </div>
  )
}
