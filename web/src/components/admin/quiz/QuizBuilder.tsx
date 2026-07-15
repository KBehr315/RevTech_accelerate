import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useCreateQuestion, useDeleteQuestion, useQuestions, useUpdateQuestion } from '@/hooks/useModules'
import { QuestionEditor, type QuestionDraft } from './QuestionEditor'
import type { QuizQuestion } from '@/types/domain'

export function QuizBuilder({ moduleId }: { moduleId: string }) {
  const { data: questions, isLoading } = useQuestions(moduleId)
  const createQuestion = useCreateQuestion()
  const updateQuestion = useUpdateQuestion(moduleId)
  const deleteQuestion = useDeleteQuestion(moduleId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<QuizQuestion | undefined>(undefined)

  const sorted = [...(questions ?? [])].sort((a, b) => a.position - b.position)

  function openCreate() {
    setEditing(undefined)
    setDialogOpen(true)
  }

  function openEdit(question: QuizQuestion) {
    setEditing(question)
    setDialogOpen(true)
  }

  async function handleSave(draft: QuestionDraft) {
    try {
      if (editing) {
        await updateQuestion.mutateAsync({ id: editing.id, input: draft })
        toast.success('Question updated')
      } else {
        await createQuestion.mutateAsync({ module_id: moduleId, position: sorted.length, ...draft })
        toast.success('Question added')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save question')
      throw err
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this question?')) return
    try {
      await deleteQuestion.mutateAsync(id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete question')
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />

  return (
    <div className="flex flex-col gap-3">
      {sorted.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">No questions yet — add at least one.</p>
      )}
      {sorted.map((q, i) => (
        <div key={q.id} className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {i + 1}. {q.prompt}
            </p>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <Badge variant="neutral">{q.question_type === 'true_false' ? 'True/False' : 'Multiple choice'}</Badge>
              <span>{q.points} pt{q.points === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(q)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)}>
              <Trash2 className="h-4 w-4 text-status-red" />
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" className="w-fit" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        Add Question
      </Button>

      <QuestionEditor open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSave={handleSave} />
    </div>
  )
}
