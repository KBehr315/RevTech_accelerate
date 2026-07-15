import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { QuizAnswer, QuizQuestionPublic } from '@/types/domain'

interface QuizRunnerProps {
  questions: QuizQuestionPublic[]
  onSubmit: (answers: QuizAnswer[]) => void
  submitting: boolean
}

export function QuizRunner({ questions, onSubmit, submitting }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({})

  const sorted = [...questions].sort((a, b) => a.position - b.position)
  const answeredCount = sorted.filter((q) => (answers[q.id]?.length ?? 0) > 0).length
  const allAnswered = answeredCount === sorted.length

  function setSingle(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: [optionId] }))
  }

  function toggleMulti(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? []
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
      return { ...prev, [questionId]: next }
    })
  }

  function handleSubmit() {
    const payload: QuizAnswer[] = sorted.map((q) => ({
      question_id: q.id,
      selected_option_ids: answers[q.id] ?? [],
    }))
    onSubmit(payload)
  }

  return (
    <div className="flex flex-col gap-6">
      {sorted.map((question, index) => (
        <div key={question.id} className="rounded-lg border border-border p-4">
          <p className="mb-3 text-sm font-medium text-slate-900">
            {index + 1}. {question.prompt}
          </p>
          {question.question_type === 'true_false' ? (
            <RadioGroup
              value={answers[question.id]?.[0] ?? ''}
              onValueChange={(value) => setSingle(question.id, value)}
              className="flex flex-col gap-2"
            >
              {question.options.map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <RadioGroupItem value={opt.id} />
                  {opt.text}
                </label>
              ))}
            </RadioGroup>
          ) : (
            <div className="flex flex-col gap-2">
              {question.options.map((opt) => (
                <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={(answers[question.id] ?? []).includes(opt.id)}
                    onCheckedChange={() => toggleMulti(question.id, opt.id)}
                  />
                  {opt.text}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {answeredCount} of {sorted.length} questions answered
        </p>
        <Button onClick={handleSubmit} disabled={!allAnswered || submitting}>
          {submitting ? 'Submitting…' : 'Submit Quiz'}
        </Button>
      </div>
    </div>
  )
}
