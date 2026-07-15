import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAssignment } from '@/hooks/useAssignments'
import { useModule, useQuestionsPublic } from '@/hooks/useModules'
import { useMyAttempts, useMarkContentViewed, useStartAttempt, useSubmitAttempt } from '@/hooks/useAttempts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ContentBlockRenderer } from './ContentBlockRenderer'
import { EmbeddedContentViewer } from './EmbeddedContentViewer'
import { QuizRunner } from './QuizRunner'
import { ResultScreen } from './ResultScreen'
import type { Attempt, QuizAnswer } from '@/types/domain'

type SubPhase = 'content' | 'quiz'

export function TrainingPlayerPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const navigate = useNavigate()

  const { data: assignment, isLoading: loadingAssignment } = useAssignment(assignmentId)
  const { data: module, isLoading: loadingModule } = useModule(assignment?.module_id)
  const { data: attempts, isLoading: loadingAttempts } = useMyAttempts(assignmentId)
  const { data: questions } = useQuestionsPublic(assignment?.module_id)

  const startAttempt = useStartAttempt()
  const markContentViewed = useMarkContentViewed()
  const submitAttempt = useSubmitAttempt()

  const [activeAttempt, setActiveAttempt] = useState<Attempt | null | undefined>(undefined)
  const [subPhase, setSubPhase] = useState<SubPhase>('content')
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current || !attempts) return
    const inProgress = attempts.find((a) => !a.completed_at) ?? null
    setActiveAttempt(inProgress)
    initialized.current = true
  }, [attempts])

  if (loadingAssignment || loadingModule || loadingAttempts || activeAttempt === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!assignment || !module) {
    return <p className="text-sm text-slate-500">This training could not be found.</p>
  }

  const latestCompleted = attempts?.find((a) => a.completed_at) ?? null

  async function handleStart() {
    try {
      const attempt = await startAttempt.mutateAsync(assignment!.id)
      setActiveAttempt(attempt)
      setSubPhase('content')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start training')
    }
  }

  async function handleContinueToQuiz() {
    if (!activeAttempt) return
    if (module!.content_type === 'external') {
      try {
        const updated = await markContentViewed.mutateAsync(activeAttempt.id)
        setActiveAttempt(updated)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not record content view')
        return
      }
    }
    setSubPhase('quiz')
  }

  async function handleSubmitQuiz(answers: QuizAnswer[]) {
    if (!activeAttempt) return
    try {
      const completed = await submitAttempt.mutateAsync({ attemptId: activeAttempt.id, answers })
      setActiveAttempt(completed)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit quiz')
    }
  }

  // Completed active attempt (just submitted, or resumed into a completed state) -> results
  const completedAttempt = activeAttempt?.completed_at ? activeAttempt : !activeAttempt ? latestCompleted : null

  if (completedAttempt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{module.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultScreen
            attempt={completedAttempt}
            passingScore={module.passing_score_pct}
            onRetake={handleStart}
            onBackToDashboard={() => navigate('/')}
          />
        </CardContent>
      </Card>
    )
  }

  // No attempt yet -> intro screen
  if (!activeAttempt) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{module.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {module.description && <p className="text-sm text-slate-600">{module.description}</p>}
          <p className="text-xs text-slate-400">
            Passing score: {module.passing_score_pct}%
            {module.renewal_period_months && ` · Renews every ${module.renewal_period_months} months`}
          </p>
          <Button onClick={handleStart} disabled={startAttempt.isPending} className="w-fit">
            {startAttempt.isPending ? 'Starting…' : 'Start Training'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // In-progress attempt -> content then quiz
  return (
    <Card>
      <CardHeader>
        <CardTitle>{module.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {subPhase === 'content' && (
          <>
            {module.content_type === 'in_app' && module.content_blocks && (
              <ContentBlockRenderer blocks={module.content_blocks} />
            )}
            {module.content_type === 'external' && module.external_url && module.external_content_type && (
              <EmbeddedContentViewer url={module.external_url} type={module.external_content_type} />
            )}
            <Button onClick={handleContinueToQuiz} disabled={markContentViewed.isPending} className="w-fit">
              {module.content_type === 'external' ? "I've reviewed this — Continue to Quiz" : 'Continue to Quiz'}
            </Button>
          </>
        )}

        {subPhase === 'quiz' &&
          (questions && questions.length > 0 ? (
            <QuizRunner questions={questions} onSubmit={handleSubmitQuiz} submitting={submitAttempt.isPending} />
          ) : (
            <p className="text-sm text-slate-500">This module has no quiz questions yet.</p>
          ))}
      </CardContent>
    </Card>
  )
}
