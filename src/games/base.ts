import type { ArenaState, ArenaObservation, GameEngine } from './core';
import type { Choice, GameEvent } from '../types';
import { normalizeSpeech } from '../chat';

export abstract class BaseEngine<S extends ArenaState> implements GameEngine {
  events: GameEvent[] = [];
  onEvent?: (event: GameEvent, state: ArenaState) => void;
  constructor(public s: S) {}
  get actor() {
    return this.s.active;
  }
  get pending() {
    return this.s.status === 'finished' ? null : { type: this.s.phase, actor: this.actor };
  }
  get requiresDecision() {
    return false;
  }
  p(seat: number) {
    return this.s.players[seat];
  }
  text(zh: string, en: string) {
    return this.s.locale === 'en' ? en : zh;
  }
  emit(
    type: string,
    text: string,
    actor?: number,
    data?: Record<string, unknown>,
    visibleTo?: number[],
  ) {
    const event: GameEvent = {
      seq: ++this.s.revision,
      time: new Date().toISOString(),
      type,
      text,
      actor,
      data,
      ...(visibleTo ? { visibleTo } : {}),
    };
    this.events.push(event);
    this.onEvent?.(event, this.s);
  }
  start() {
    this.emit('start', this.text('对局开始', 'Game started'));
    this.ready();
  }
  ready() {
    this.emit('ready', this.text('等待下一步', 'Ready for next action'));
  }
  abstract legalActions(): Choice[];
  abstract view(viewer?: number): ArenaObservation;
  abstract execute(choice: Choice): void;
  speechAudience(): number[] | undefined | null {
    return undefined;
  }
  resolveAction(id: string, cardIds?: string[]) {
    const choice = this.legalActions().find((c) => c.id === id);
    if (!choice || cardIds !== undefined) throw new Error(this.text('非法行动', 'Illegal action'));
    return choice;
  }
  apply(id: string, revision = this.s.revision, cardIds?: string[], speech?: string) {
    if (this.s.status !== 'playing' || revision !== this.s.revision)
      throw new Error(this.text('过期决策', 'Stale decision'));
    const choice = this.resolveAction(id, cardIds),
      actor = this.actor,
      audience = this.speechAudience();
    const message = normalizeSpeech(speech);
    if (message && audience !== null)
      this.emit(
        'chat',
        `${this.p(actor).name}: ${message}`,
        actor,
        {
          message,
          agentId: this.p(actor).agentId,
          name: this.p(actor).name,
          round: this.s.round,
          turn: this.s.turn,
          phase: this.s.phase,
        },
        audience,
      );
    this.execute(choice);
    this.ready();
  }
  finish(winner: string, reason: string) {
    this.s.status = 'finished';
    this.s.winner = winner;
    this.s.reason = reason;
    const draw = ['平局', 'draw'].includes(winner);
    this.s.outcome = {
      draw,
      winners: draw ? [] : this.s.players.filter((p) => p.role === winner).map((p) => p.agentId),
    };
    this.emit('finish', reason, undefined, { winner, outcome: this.s.outcome });
  }
  visibleHistory(viewer: number) {
    return this.events.filter(
      (e) =>
        (!e.visibleTo || e.visibleTo.includes(viewer)) &&
        (e.privateTo === undefined || e.privateTo === viewer),
    );
  }
  observation(viewer: number): ArenaObservation {
    return {
      gameId: this.s.id,
      gameType: this.s.gameType,
      locale: this.s.locale,
      revision: this.s.revision,
      round: this.s.round,
      turn: this.s.turn,
      active: this.actor,
      phase: this.s.phase,
      status: this.s.status,
      winner: this.s.winner,
      viewer,
      players: structuredClone(this.s.players),
      legalActions: viewer === this.actor ? this.legalActions() : [],
      pending: this.pending,
      speechChannel: 'public',
    };
  }
}
