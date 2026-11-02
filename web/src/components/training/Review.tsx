import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Loader2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCheckTrainingPart, useEditTrainingPart, useReviseTrainingPart } from '@/hooks/useTraining'
import type { TrainingBlock, TrainingQuestion, TrainingRevision, TrainingSlide } from '@/types/domain'

/** Who ticked a piece as checked, and when. */
export type Check = { name: string; at: string }
export type Part =
  | { kind: 'block'; part: TrainingBlock }
  | { kind: 'slide'; part: TrainingSlide }
  | { kind: 'question'; part: TrainingQuestion }

const KIND_NAMES = { block: 'lesson piece', slide: 'slide', question: 'quiz question' }

/** The "Checked" box for a piece or a review note. */
export function CheckBox({ draftId, partId, check }: { draftId: string; partId: string; check: Check | undefined }) {
  const mark = useCheckTrainingPart(draftId)
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <Checkbox
        checked={!!check}
        disabled={mark.isPending}
        onCheckedChange={(on) => mark.mutate({ partId, checked: on === true }, { onError: (err) => toast.error(err.message) })}
      />
      {check ? (
        <span className="text-status-green">
          Checked by {check.name}, {new Date(check.at).toLocaleDateString()}
        </span>
      ) : (
        'Checked'
      )}
    </label>
  )
}

/** Under each piece: the Checked box, Revise, and how Claude's last rewrite of it went. */
export function ReviewControls({
  draftId,
  item,
  check,
  revision,
}: {
  draftId: string
  item: Part
  check: Check | undefined
  revision: TrainingRevision | undefined
}) {
  const [open, setOpen] = useState(false)
  const rewriting = revision?.status === 'queued' || revision?.status === 'running'

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <CheckBox draftId={draftId} partId={item.part.id} check={check} />
      {rewriting ? (
        <span className="flex items-center gap-1 text-xs text-brand-700">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Claude is rewriting this…
        </span>
      ) : (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setOpen(true)}>
          <PenLine className="h-3 w-3" aria-hidden />
          Revise
        </Button>
      )}
      {revision?.status === 'failed' && <span className="text-xs text-status-red">Claude couldn't rewrite this: {revision.detail}</span>}
      <ReviseDialog draftId={draftId} item={item} open={open} onOpenChange={setOpen} />
    </div>
  )
}

function ReviseDialog({ draftId, item, open, onOpenChange }: { draftId: string; item: Part; open: boolean; onOpenChange: (open: boolean) => void }) {
  const revise = useReviseTrainingPart(draftId)
  const [instruction, setInstruction] = useState('')

  const ask = () =>
    revise.mutate(
      { partId: item.part.id, instruction },
      {
        onSuccess: () => {
          toast.success('Claude is rewriting it. It takes about a minute.')
          setInstruction('')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revise this {KIND_NAMES[item.kind]}</DialogTitle>
          <DialogDescription>Tell Claude what's wrong and it rewrites only this piece, or change the wording yourself.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="claude">
          <TabsList>
            <TabsTrigger value="claude">Ask Claude to rewrite</TabsTrigger>
            <TabsTrigger value="edit">Edit it myself</TabsTrigger>
          </TabsList>
          <TabsContent value="claude" className="flex flex-col gap-2">
            <Label htmlFor="instruction">What should change?</Label>
            <Textarea
              id="instruction"
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="For example: Meridian posts with the Post General Journal Entries app (F0718), not FB50. Keep it to three steps."
            />
            <p className="text-xs text-slate-500">Claude uses the same documents as the draft. You'll need to check the new version again.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={!instruction.trim() || revise.isPending} onClick={ask}>
                {revise.isPending ? 'Sending…' : 'Rewrite with Claude'}
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="edit">
            {/* Keyed so the form starts from the current wording each time it opens. */}
            {open && <EditForm key={item.part.id} draftId={draftId} item={item} onDone={() => onOpenChange(false)} />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** The piece's text as fields. Saving labels it "edited" and checks it as yours. */
function EditForm({ draftId, item, onDone }: { draftId: string; item: Part; onDone: () => void }) {
  const edit = useEditTrainingPart(draftId)
  const save = (part: Record<string, unknown>) =>
    edit.mutate(
      { partId: item.part.id, part },
      {
        onSuccess: () => {
          toast.success('Saved, and marked as checked by you.')
          onDone()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  const footer = (
    <DialogFooter>
      <Button variant="outline" onClick={onDone}>
        Cancel
      </Button>
      <Button type="submit" disabled={edit.isPending}>
        {edit.isPending ? 'Saving…' : 'Save my changes'}
      </Button>
    </DialogFooter>
  )
  if (item.kind === 'slide') return <SlideForm slide={item.part} onSave={save} footer={footer} />
  if (item.kind === 'question') return <QuestionForm question={item.part} onSave={save} footer={footer} />
  return <BlockForm block={item.part} onSave={save} footer={footer} />
}

type FormProps<T> = { onSave: (part: Record<string, unknown>) => void; footer: ReactNode } & T

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function SlideForm({ slide, onSave, footer }: FormProps<{ slide: TrainingSlide }>) {
  const [title, setTitle] = useState(slide.title)
  const [bullets, setBullets] = useState(slide.bullets.join('\n'))
  const [notes, setNotes] = useState(slide.notes)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ title, bullets: lines(bullets), notes })
      }}
    >
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Bullets (one per line)">
        <Textarea rows={6} value={bullets} onChange={(e) => setBullets(e.target.value)} />
      </Field>
      <Field label="Speaker notes">
        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {footer}
    </form>
  )
}

function QuestionForm({ question, onSave, footer }: FormProps<{ question: TrainingQuestion }>) {
  const [text, setText] = useState(question.question)
  const [choices, setChoices] = useState(question.choices.join('\n'))
  const [correct, setCorrect] = useState<number[]>(question.correct)
  const [explanation, setExplanation] = useState(question.explanation)
  const choiceList = lines(choices)
  const valid = choiceList.length >= 2 && correct.some((c) => c < choiceList.length)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return toast.error('Give at least two choices and tick the right one.')
        onSave({ question: text, choices: choiceList, correct: correct.filter((c) => c < choiceList.length), explanation })
      }}
    >
      <Field label="Question">
        <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Choices (one per line)">
        <Textarea rows={5} value={choices} onChange={(e) => setChoices(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-slate-700">Right answer</span>
        {choiceList.map((choice, i) => (
          <label key={i} className="flex items-center gap-2 text-sm text-slate-700">
            <Checkbox
              checked={correct.includes(i)}
              onCheckedChange={(on) => setCorrect((list) => (on === true ? [...list, i] : list.filter((c) => c !== i)))}
            />
            {choice}
          </label>
        ))}
      </div>
      <Field label="Why it's right">
        <Textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </Field>
      {footer}
    </form>
  )
}

/** Pieces with items show them as "title | detail" lines; hotspot positions stay with their line number. */
function BlockForm({ block, onSave, footer }: FormProps<{ block: TrainingBlock }>) {
  const [heading, setHeading] = useState(block.heading)
  const [body, setBody] = useState(block.body)
  const [items, setItems] = useState(block.items.map((i) => (i.detail ? `${i.title} | ${i.detail}` : i.title)).join('\n'))
  const [seconds, setSeconds] = useState(String(block.seconds))
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = lines(items).map((line, i) => {
          const [title, ...rest] = line.split('|')
          return { title: title.trim(), detail: rest.join('|').trim(), x: block.items[i]?.x ?? 0, y: block.items[i]?.y ?? 0 }
        })
        onSave({
          heading,
          body,
          items: parsed,
          correct: block.correct.filter((c) => c < parsed.length),
          seconds: Number(seconds) || 0,
        })
      }}
    >
      <Field label="Heading">
        <Input value={heading} onChange={(e) => setHeading(e.target.value)} />
      </Field>
      <Field label="Text">
        <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {block.items.length > 0 && (
        <Field label="Items (one per line, as: title | detail)">
          <Textarea rows={6} value={items} onChange={(e) => setItems(e.target.value)} />
        </Field>
      )}
      {block.type === 'timed_activity' && (
        <Field label="Time limit (seconds)">
          <Input type="number" min={0} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
        </Field>
      )}
      {footer}
    </form>
  )
}
