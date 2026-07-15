import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatScore } from '@/lib/utils'
import type { Attempt } from '@/types/domain'

interface ResultScreenProps {
  attempt: Attempt
  passingScore: number
  onRetake: () => void
  onBackToDashboard: () => void
}

export function ResultScreen({ attempt, passingScore, onRetake, onBackToDashboard }: ResultScreenProps) {
  const passed = attempt.passed

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      {passed ? (
        <CheckCircle2 className="h-14 w-14 text-status-green" />
      ) : (
        <XCircle className="h-14 w-14 text-status-red" />
      )}
      <div>
        <h2 className="font-heading text-xl font-semibold text-slate-900">
          {passed ? 'Training Complete' : 'Not Quite — Try Again'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          You scored <span className="font-semibold text-slate-700">{formatScore(attempt.score_pct)}</span> (passing
          score: {passingScore}%)
        </p>
        <p className="mt-1 text-xs text-slate-400">Completed {formatDateTime(attempt.completed_at)}</p>
      </div>
      <div className="flex gap-2">
        <Button variant={passed ? 'outline' : 'default'} onClick={onRetake}>
          Retake Training
        </Button>
        <Button variant={passed ? 'default' : 'outline'} onClick={onBackToDashboard}>
          Back to My Training
        </Button>
      </div>
    </div>
  )
}
