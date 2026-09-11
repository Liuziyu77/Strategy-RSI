import type { ChatMessage, GameEvent } from './types';

export const MAX_SPEECH_LENGTH = 200;
export const DEFAULT_CHAT_CONTEXT = 80;

// A malformed optional utterance must not invalidate an otherwise legal card decision.
export function normalizeSpeech(value: unknown): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
    .slice(0, MAX_SPEECH_LENGTH)
    .join('');
}

export function chatMessage(event: GameEvent): ChatMessage | undefined {
  const d = event.data;
  if (
    event.type !== 'chat' ||
    event.privateTo !== undefined ||
    event.actor === undefined ||
    !d ||
    typeof d.message !== 'string' ||
    typeof d.agentId !== 'string' ||
    typeof d.name !== 'string' ||
    typeof d.round !== 'number' ||
    typeof d.turn !== 'number' ||
    typeof d.phase !== 'string'
  )
    return;
  return {
    seq: event.seq,
    time: event.time,
    seat: event.actor,
    agentId: d.agentId,
    name: d.name,
    text: d.message,
    round: d.round,
    turn: d.turn,
    phase: d.phase,
  };
}
