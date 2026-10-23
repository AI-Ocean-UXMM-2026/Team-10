export const modes = {
  understand: { label: 'Understand', description: 'Make sense of a new idea.', prompt: 'Explain the main idea in your own words. What is still unclear?' },
  practice: { label: 'Practice', description: 'Apply what you know.', prompt: 'What did you complete? What was difficult or incorrect?' },
  remember: { label: 'Remember', description: 'Recall without your notes.', prompt: 'Without looking at your notes, write what you remember.' },
  review: { label: 'Review', description: 'Revisit and connect material.', prompt: 'What did you review? What needs another review?' },
} as const;
export type Mode = keyof typeof modes;
export type Quest = {
  id: string; topic: string; subject: string | null; study_mode: Mode; finish_line: string;
  planned_minutes: number; status: 'running' | 'paused' | 'completed' | 'cancelled' | 'expired';
  started_at: string; running_since: string | null; accrued_active_seconds: number; ended_at: string | null;
  reflection_status: 'pending' | 'answered' | 'skipped'; reflection_text: string | null;
  next_step_status: 'pending' | 'saved' | 'skipped'; next_step_text: string | null;
};
export type QuestResult = { ok: boolean; code: string; session: Quest | null; server_time: string; active_seconds: number | null; coins_balance: number; reward_coins: number };
export type QuestInput = { topic: string; subject: string; mode: string; finishLine: string; minutes: string };
export function validateQuest(input: QuestInput) {
  const errors: Partial<Record<keyof QuestInput, string>> = {};
  const count = (value: string) => [...value.trim()].length;
  if (!count(input.topic) || count(input.topic) > 120) errors.topic = 'Enter a topic of 1–120 characters.';
  if (count(input.subject) > 80) errors.subject = 'Use up to 80 characters.';
  if (!Object.hasOwn(modes, input.mode)) errors.mode = 'Choose one study mode.';
  if (!count(input.finishLine) || count(input.finishLine) > 240) errors.finishLine = 'Enter a concrete finish line of 1–240 characters.';
  if (!/^\d+$/.test(input.minutes) || Number(input.minutes) < 5 || Number(input.minutes) > 120) errors.minutes = 'Choose 5–120 whole minutes.';
  return errors;
}
// A continuation is a new editable quest, never a restart of the previous topic.
export function questInputFromNextStep(bookmark: Quest | null): QuestInput {
  const nextStep = bookmark?.next_step_text ?? '';
  const input = { topic: nextStep, subject: bookmark?.subject ?? '', mode: bookmark && Object.hasOwn(modes, bookmark.study_mode) ? bookmark.study_mode : 'understand', finishLine: nextStep, minutes: '25' };
  return { ...input, topic: validateQuest(input).topic ? '' : nextStep.trim() };
}
// Canonical active_seconds anchors the estimate. performance.now() avoids wall-clock
// edits; only the RPC may authorize completion, regardless of this display.
export function remainingSeconds(result: QuestResult, elapsedSeconds = 0) {
  if (!result.session) return 0;
  const extra = result.session.status === 'running' ? Math.max(0, elapsedSeconds) : 0;
  return Math.max(0, result.session.planned_minutes * 60 - (result.active_seconds ?? result.session.accrued_active_seconds) - Math.floor(extra));
}
export function clockText(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}
export const activeQuest = (quest?: Quest | null) => quest?.status === 'running' || quest?.status === 'paused';
