import type { TrainingDraft, TrainingPiece } from '@/types/domain'

/** The interactive pieces, in the order the form lists them (training_pieces(), 00111). */
export const PIECE_LABELS: Record<TrainingPiece, string> = {
  checklist: 'Checklist cards',
  stat: 'Stat card',
  reveal: 'Reveal card',
  hotspot: 'Hotspot diagram',
  mistake_better: 'Mistake vs better toggle',
  info_cards: 'Info cards',
  timed_activity: 'Timed activity',
  flip_cards: 'Flip cards',
  expandable: 'Expandable items',
  drag_drop: 'Drag & drop',
  multiple_choice: 'Multiple choice question',
  diagram: 'Diagram in RevTech colours',
}

export const DRAFT_STATUS_LABELS: Record<TrainingDraft['status'], string> = {
  queued: 'Waiting to start',
  generating: 'Claude is writing',
  ready: 'Draft',
  failed: 'Failed',
}

export const OUTPUT_LABELS = { slides: 'PowerPoint', lesson: 'Interactive lesson' } as const
