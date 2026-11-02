import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/common/PageHeader'
import { useWorkspace } from '@/components/client/workspace'
import { useTrainingDraft, useTrainingDrafts } from '@/hooks/useTraining'
import type { ProvenanceLabel, TrainingBlock, TrainingContent, TrainingDraft } from '@/types/domain'
import { DRAFT_STATUS_LABELS, OUTPUT_LABELS, PIECE_LABELS } from './labels'

const STATUS_VARIANT = { queued: 'neutral', generating: 'default', ready: 'warning', failed: 'danger' } as const

/** The client's training drafts: everyone's for Training Administrators, your own otherwise. */
export function TrainingPage() {
  const { client } = useWorkspace()
  const { data: drafts, isLoading } = useTrainingDrafts(client.id)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Training"
        description={`Training built for ${client.name}. Drafts are only visible to their author and ${client.name}'s Training Administrators.`}
        actions={
          <Button asChild>
            <Link to="new">
              <Sparkles className="h-4 w-4" aria-hidden />
              Build with Claude
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {!isLoading && !drafts?.length && (
            <p className="p-4 text-sm text-slate-500">No training yet. Click "Build with Claude" to describe the first one.</p>
          )}
          <ul className="divide-y divide-border">
            {drafts?.map((draft) => (
              <li key={draft.id}>
                <Link to={draft.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-muted">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{draft.title}</span>
                    <span className="block text-xs text-slate-500">
                      {draft.outputs.map((o) => OUTPUT_LABELS[o]).join(' + ')} · {draft.author?.full_name} ·{' '}
                      {new Date(draft.created_at).toLocaleString()}
                    </span>
                  </span>
                  <Badge variant={STATUS_VARIANT[draft.status]}>{DRAFT_STATUS_LABELS[draft.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/** One draft: progress while Claude writes, then the content to review. */
export function TrainingDraftPage() {
  const { draftId } = useParams()
  const { data: draft, isLoading, error } = useTrainingDraft(draftId!)

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>
  if (error || !draft) return <p className="text-sm text-status-red">This draft doesn't exist, or you can't see it.</p>

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={draft.title}
        description={
          <>
            <Badge variant={STATUS_VARIANT[draft.status]} className="mr-2">
              {DRAFT_STATUS_LABELS[draft.status]}
            </Badge>
            {draft.outputs.map((o) => OUTPUT_LABELS[o]).join(' + ')}
          </>
        }
      />
      {(draft.status === 'queued' || draft.status === 'generating') && <Writing draft={draft} />}
      {draft.status === 'failed' && (
        <Card className="border-status-red">
          <CardContent className="flex gap-3 p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-status-red" aria-hidden />
            <div>
              <p className="font-medium text-slate-900">Claude couldn't write this draft.</p>
              <p className="text-slate-600">{draft.status_detail}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {draft.status === 'ready' && draft.content && <DraftContent draft={draft} content={draft.content} />}
    </div>
  )
}

function Writing({ draft }: { draft: TrainingDraft }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5 text-sm">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" aria-hidden />
        <div>
          <p className="font-medium text-slate-900">{draft.status_detail ?? 'Waiting to start…'}</p>
          <p className="text-slate-600">
            This usually takes a few minutes. You can leave this page; the draft keeps going and appears under Training when it's done.
          </p>
          <p className="mt-3 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-slate-700">{draft.brief}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DraftContent({ draft, content }: { draft: TrainingDraft; content: TrainingContent }) {
  const sourceTitle = (citation: string) => content.sources.find((s) => s.ref === citation.split('.')[0])?.title ?? citation

  const Provenance = ({ label, citations }: { label: ProvenanceLabel; citations: string[] }) =>
    label === 'source' ? (
      <span className="text-xs text-status-green" title={citations.join(', ')}>
        From {[...new Set(citations.map(sourceTitle))].join(', ')}
      </span>
    ) : (
      <span className="text-xs text-status-yellow">AI-generated: check this</span>
    )

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 p-5 text-sm">
          <p className="text-slate-700">{content.summary}</p>
          <p className="text-slate-500">
            For {content.audience} · about {content.duration_minutes} minutes · {draft.status_detail}
          </p>
          {content.objectives.length > 0 && (
            <div>
              <p className="font-medium text-slate-900">Learning objectives</p>
              <ul className="ml-5 list-disc text-slate-700">
                {content.objectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Coming next: download as PowerPoint, play the interactive lesson, and edit the draft.
          </p>
        </CardContent>
      </Card>

      {content.review_notes.length > 0 && (
        <Card className="border-status-yellow">
          <CardContent className="p-5 text-sm">
            <p className="font-medium text-slate-900">Check these before using the training</p>
            <ul className="ml-5 mt-2 list-disc text-slate-700">
              {content.review_notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={draft.outputs.includes('lesson') ? 'lesson' : 'slides'}>
        <TabsList className="flex-wrap">
          {draft.outputs.includes('lesson') && <TabsTrigger value="lesson">Lesson</TabsTrigger>}
          {draft.outputs.includes('slides') && <TabsTrigger value="slides">Slides</TabsTrigger>}
          <TabsTrigger value="quiz">Quiz ({content.quiz.length})</TabsTrigger>
          <TabsTrigger value="sources">Sources ({content.sources.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lesson" className="flex flex-col gap-4">
          {content.sections.map((section, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-4 p-5">
                <h2 className="font-heading text-lg font-semibold text-slate-900">
                  {i + 1}. {section.heading}
                </h2>
                {section.blocks.map((block, j) => (
                  <div key={j} className="flex flex-col gap-1 border-l-4 border-brand-100 pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{block.type === 'text' ? 'Text' : (PIECE_LABELS[block.type as keyof typeof PIECE_LABELS] ?? block.type)}</Badge>
                      <Provenance label={block.label} citations={block.citations} />
                    </div>
                    <BlockView block={block} content={content} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="slides" className="flex flex-col gap-3">
          {content.sections.flatMap((section) => section.slides).map((slide, i) => (
            <Card key={i}>
              <CardContent className="grid gap-4 p-5 text-sm md:grid-cols-2">
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-400">Slide {i + 2}</p>
                  <p className="font-heading text-base font-semibold text-brand-900">{slide.title}</p>
                  <ul className="ml-5 list-disc text-slate-700">
                    {slide.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                  {slide.media && <MediaNote media={slide.media} content={content} />}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Speaker notes</p>
                  <p className="whitespace-pre-wrap text-slate-700">{slide.notes}</p>
                  <Provenance label={slide.label} citations={slide.citations} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="quiz" className="flex flex-col gap-3">
          {!content.quiz.length && <p className="text-sm text-slate-500">No quiz questions.</p>}
          {content.quiz.map((q, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2 p-5 text-sm">
                <p className="font-medium text-slate-900">
                  {i + 1}. {q.question}
                </p>
                <ul className="flex flex-col gap-1">
                  {q.choices.map((choice, j) => (
                    <li key={j} className={q.correct.includes(j) ? 'font-medium text-status-green' : 'text-slate-700'}>
                      {q.correct.includes(j) ? '✓ ' : '○ '}
                      {choice}
                    </li>
                  ))}
                </ul>
                <p className="text-slate-600">{q.explanation}</p>
                <Provenance label={q.label} citations={q.citations} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sources" className="flex flex-col gap-3">
          <Card>
            <CardContent className="p-5 text-sm">
              {content.sources.length ? (
                <ul className="flex flex-col gap-1">
                  {content.sources.map((s) => (
                    <li key={s.ref}>
                      <span className="text-slate-500">{s.ref}</span> {s.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-600">No library documents were used. Everything was written from Claude's general knowledge, so check it all.</p>
              )}
              {content.videos.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1">
                  {content.videos.map((v) => (
                    <li key={v.ref}>
                      <a href={v.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">
                        {v.url}
                      </a>{' '}
                      <span className="text-slate-500">{v.note}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}

/** A plain reading view of a block. The interactive player comes in a later piece. */
function BlockView({ block, content }: { block: TrainingBlock; content: TrainingContent }) {
  const items = (render: (item: TrainingBlock['items'][number], i: number) => ReactNode) => (
    <ul className="ml-5 list-disc text-sm text-slate-700">{block.items.map((item, i) => <li key={i}>{render(item, i)}</li>)}</ul>
  )
  const pair = (a: string, b: string, item: TrainingBlock['items'][number]) => (
    <>
      <span className="font-medium">{a}</span> {item.title} — <span className="font-medium">{b}</span> {item.detail}
    </>
  )

  return (
    <div className="flex flex-col gap-1 text-sm">
      {block.heading && <p className="font-medium text-slate-900">{block.heading}</p>}
      {block.body && <p className="whitespace-pre-wrap text-slate-700">{block.body}</p>}
      {block.type === 'flip_cards' && items((item) => pair('Front:', 'Back:', item))}
      {block.type === 'mistake_better' && items((item) => pair('Mistake:', 'Better:', item))}
      {block.type === 'drag_drop' && items((item) => pair('', 'goes in', item))}
      {block.type === 'multiple_choice' &&
        items((item, i) => (
          <span className={block.correct.includes(i) ? 'font-medium text-status-green' : ''}>
            {item.title}
            {item.detail && <span className="font-normal text-slate-500"> — {item.detail}</span>}
          </span>
        ))}
      {block.type === 'diagram' && (
        <ol className="ml-5 list-decimal text-sm text-slate-700">
          {block.items.map((item, i) => (
            <li key={i}>
              <span className="font-medium">{item.title}</span> {item.detail}
            </li>
          ))}
        </ol>
      )}
      {['checklist', 'info_cards', 'expandable', 'hotspot'].includes(block.type) &&
        items((item) => (
          <>
            <span className="font-medium">{item.title}</span> {item.detail}
            {block.type === 'hotspot' && <span className="text-slate-400"> (at {item.x}%, {item.y}%)</span>}
          </>
        ))}
      {block.type === 'timed_activity' && block.seconds > 0 && <p className="text-slate-500">Time limit: {block.seconds} seconds</p>}
      {block.media && <MediaNote media={block.media} content={content} />}
    </div>
  )
}

function MediaNote({ media, content }: { media: string; content: TrainingContent }) {
  if (media.startsWith('video:')) {
    const video = content.videos.find((v) => v.ref === media)
    return video ? (
      <a href={video.url} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">
        Video: {video.note || video.url}
      </a>
    ) : null
  }
  const source = content.sources.find((s) => `image:${s.ref}` === media)
  return source ? <p className="text-sm text-slate-500">Picture: {source.title}</p> : null
}
