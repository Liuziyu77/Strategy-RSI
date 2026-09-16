import type { AgentConfig, Choice, Decision, GameEvent } from '../types';

export type GameType = 'sanguosha' | 'werewolf' | 'chess' | 'xiangqi';
export type Locale = 'zh' | 'en';
export interface Participant {
  seat: number;
  agentId: string;
  name: string;
  role: string;
  alive: boolean;
  hero?: string;
}
export interface Outcome {
  winners: string[];
  draw: boolean;
}
/** JSON-only common envelope. Plugin-specific state stays in the plugin. */
export interface ArenaState {
  id: string;
  version: number;
  gameType?: GameType; // absent in version-1 Sanguosha archives
  locale?: Locale;
  revision: number;
  round: number;
  turn: number;
  active: number;
  phase: string;
  status: 'playing' | 'finished';
  winner: string | null;
  reason: string | null;
  players: Participant[];
  outcome?: Outcome;
}
export interface ArenaObservation {
  gameId: string;
  gameType?: GameType;
  locale?: Locale;
  revision: number;
  round: number;
  turn: number;
  active: number;
  phase: string;
  status: string;
  winner: string | null;
  viewer: number;
  players: Participant[];
  legalActions: Choice[];
  pending: { type: string; actor: number } | null;
  /** Language-neutral structured game data; never contains hidden engine state. */
  board?: unknown;
  details?: Record<string, unknown>;
  speechChannel?: 'public' | 'team' | 'none';
}
export interface GameEngine {
  readonly s: ArenaState;
  readonly actor: number;
  readonly pending: { type: string; actor: number } | null;
  events: GameEvent[];
  onEvent?: (event: GameEvent, state: ArenaState) => void;
  p(seat: number): Participant;
  start(): void;
  view(viewer?: number): ArenaObservation;
  visibleHistory(viewer: number): GameEvent[];
  legalActions(): Choice[];
  resolveAction(id: string, cardIds?: string[]): Choice;
  apply(id: string, revision?: number, cardIds?: string[], speech?: string): void;
  finish(winner: string, reason: string): void;
  /** Discussion turns need a model call even when there is only one action. */
  requiresDecision?: boolean;
}
export interface GamePlugin {
  id: GameType;
  create(
    id: string,
    agents: AgentConfig[],
    seed: number,
    locale: Locale,
    roles?: string[],
  ): GameEngine;
  restore(state: ArenaState): GameEngine;
  rules(locale: Locale): string;
  heuristic(observation: ArenaObservation): Decision;
}
export function isWinner(state: ArenaState, player: Participant): boolean {
  return (
    state.status === 'finished' &&
    (state.outcome
      ? state.outcome.winners.includes(player.agentId)
      : state.winner === '主忠'
        ? ['主公', '忠臣'].includes(player.role)
        : state.winner === player.role)
  );
}
