import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useDeleteModule, useModules } from '@/hooks/useModules'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHelp } from '@/components/common/PageHelp'
import { moduleMatchesSearch } from '@/lib/utils'
import { toast } from 'sonner'

export function ModuleListPage() {
  const { data: modules, isLoading } = useModules()
  const deleteModule = useDeleteModule()
  const [search, setSearch] = useState('')

  const filteredModules = (modules ?? []).filter((m) => moduleMatchesSearch(m, search))

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This also removes its quiz and assignments.`)) return
    try {
      await deleteModule.mutateAsync(id)
      toast.success('Module deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete module')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-slate-900">Training Modules</h1>
          <p className="text-sm text-slate-500">Author content in-app or link external resources, then attach a quiz.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link to="/admin/modules/new">
              <Plus className="h-4 w-4" />
              New Module
            </Link>
          </Button>
          <PageHelp helpKey="admin-modules" />
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>All Modules</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or topic…"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <Skeleton className="h-40 w-full" />}
          {!isLoading && modules?.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No modules yet — create your first one.</p>
          )}
          {!isLoading && modules && modules.length > 0 && filteredModules.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">No modules match "{search}".</p>
          )}
          {filteredModules.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <Link to={`/admin/modules/${m.id}`} className="font-medium text-slate-900 hover:underline">
                    {m.title}
                  </Link>
                  <Badge variant={m.is_published ? 'success' : 'neutral'}>
                    {m.is_published ? 'Published' : 'Draft'}
                  </Badge>
                  <Badge variant="default">{m.content_type === 'in_app' ? 'In-app content' : 'External link'}</Badge>
                  {m.topics.map((topic) => (
                    <Badge key={topic} variant="neutral">
                      {topic}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Passing score {m.passing_score_pct}%
                  {m.renewal_period_months && ` · Renews every ${m.renewal_period_months} months`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/admin/modules/${m.id}`}>Edit</Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id, m.title)}>
                  <Trash2 className="h-4 w-4 text-status-red" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
