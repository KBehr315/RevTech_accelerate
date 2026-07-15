import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input, Label } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { QuestionType, QuizOption, QuizQuestion } from '@/types/domain'

export interface QuestionDraft {
  question_type: QuestionType
  prompt: string
  options: QuizOption[]
  correct_option_ids: string[]
  points: number
}

function emptyDraft(): QuestionDraft {
  return {
    question_type: 'multiple_choice',
    prompt: '',
    options: [
      { id: crypto.randomUUID(), text: '' },
      { id: crypto.randomUUID(), text: '' },
    ],
    correct_option_ids: [],
    points: 1,
  }
}

function trueFalseDraft(): QuestionDraft {
  const trueId = crypto.randomUUID()
  const falseId = crypto.randomUUID()
  return {
    question_type: 'true_false',
    prompt: '',
    options: [
      { id: trueId, text: 'True' },
      { id: falseId, text: 'False' },
    ],
    correct_option_ids: [trueId],
    points: 1,
  }
}

interface QuestionEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: QuizQuestion
  onSave: (draft: QuestionDraft) => Promise<void>
}

export function QuestionEditor({ open, onOpenChange, initial, onSave }: QuestionEditorProps) {
  const [draft, setDraft] = useState<QuestionDraft>(() =>
    initial
      ? {
          question_type: initial.question_type,
          prompt: initial.prompt,
          options: initial.options,
          correct_option_ids: initial.correct_option_ids,
          points: initial.points,
        }
      : emptyDraft(),
  )
  const [saving, setSaving] = useState(false)

  function reset() {
    setDraft(initial ? { ...initial } : emptyDraft())
  }

  function handleOpenChange(next: boolean) {
    if (next) reset()
    onOpenChange(next)
  }

  function setType(type: QuestionType) {
    setDraft(type === 'true_false' ? trueFalseDraft() : emptyDraft())
  }

  function updateOption(id: string, text: string) {
    setDraft((d) => ({ ...d, options: d.options.map((o) => (o.id === id ? { ...o, text } : o)) }))
  }

  function toggleCorrect(id: string) {
    setDraft((d) => ({
      ...d,
      correct_option_ids: d.correct_option_ids.includes(id)
        ? d.correct_option_ids.filter((x) => x !== id)
        : [...d.correct_option_ids, id],
    }))
  }

  function addOption() {
    setDraft((d) => ({ ...d, options: [...d.options, { id: crypto.randomUUID(), text: '' }] }))
  }

  function removeOption(id: string) {
    setDraft((d) => ({
      ...d,
      options: d.options.filter((o) => o.id !== id),
      correct_option_ids: d.correct_option_ids.filter((x) => x !== id),
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(draft)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const canSave =
    draft.prompt.trim().length > 0 &&
    draft.options.every((o) => o.text.trim().length > 0) &&
    draft.correct_option_ids.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Question' : 'Add Question'}</DialogTitle>
          <DialogDescription>Check every correct option — multi-select is supported.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Question type</Label>
            <Select value={draft.question_type} onValueChange={(v) => setType(v as QuestionType)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiple_choice">Multiple choice</SelectItem>
                <SelectItem value="true_false">True / False</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prompt">Prompt</Label>
            <Input
              id="prompt"
              value={draft.prompt}
              onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
              placeholder="What is…?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Options (check the correct answer{draft.question_type === 'multiple_choice' ? '(s)' : ''})</Label>
            {draft.options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <Checkbox checked={draft.correct_option_ids.includes(opt.id)} onCheckedChange={() => toggleCorrect(opt.id)} />
                <Input
                  value={opt.text}
                  onChange={(e) => updateOption(opt.id, e.target.value)}
                  disabled={draft.question_type === 'true_false'}
                  className="flex-1"
                />
                {draft.question_type === 'multiple_choice' && draft.options.length > 2 && (
                  <Button variant="ghost" size="icon" onClick={() => removeOption(opt.id)}>
                    <Trash2 className="h-4 w-4 text-status-red" />
                  </Button>
                )}
              </div>
            ))}
            {draft.question_type === 'multiple_choice' && (
              <Button variant="outline" size="sm" className="w-fit" onClick={addOption}>
                <Plus className="h-4 w-4" />
                Add option
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="points">Points</Label>
            <Input
              id="points"
              type="number"
              min={1}
              className="w-24"
              value={draft.points}
              onChange={(e) => setDraft((d) => ({ ...d, points: Number(e.target.value) || 1 }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
