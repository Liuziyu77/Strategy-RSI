import { Chess, type Move } from 'chess.js';
import { BaseEngine } from './base';
import type { AgentConfig, Choice } from '../types';
import type { ArenaState } from './core';
import type { ArenaObservation, Locale } from './core';

export interface ChessState extends ArenaState {
  gameType: 'chess';
  locale: Locale;
  initialFen: string;
  moves: string[];
  fen: string;
  positions: Record<string, number>;
  drawOffer?: number | null;
}
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const uci = (m: Move) => m.from + m.to + (m.promotion ?? '');
export class ChessEngine extends BaseEngine<ChessState> {
  chess: Chess;
  constructor(id: string, agents: AgentConfig[], locale: Locale = 'zh', restored?: ChessState) {
    const chess = new Chess(restored?.initialFen);
    if (restored)
      for (const move of restored.moves)
        chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    const fen = chess.fen();
    super(
      restored
        ? structuredClone(restored)
        : {
            id,
            version: 1,
            gameType: 'chess',
            locale,
            revision: 0,
            round: 1,
            turn: 1,
            active: 0,
            phase: 'move',
            status: 'playing',
            winner: null,
            reason: null,
            players: agents.map((a, seat) => ({
              seat,
              agentId: a.id,
              name: a.name,
              role: seat ? 'black' : 'white',
              alive: true,
            })),
            initialFen: fen,
            fen,
            moves: [],
            positions: { [key(fen)]: 1 },
          },
    );
    this.chess = chess;
    if (restored && fen !== restored.fen)
      throw new Error('Chess checkpoint does not match move history');
  }
  legalActions(): Choice[] {
    if (this.s.status !== 'playing') return [];
    const moves = this.chess.moves({ verbose: true });
    const actions: Choice[] = moves.map((m) => ({
      id: uci(m),
      kind: 'move',
      label: m.san,
      value: uci(m),
    }));
    actions.push(
      ...moves.map((m) => ({
        id: `offer:${uci(m)}`,
        kind: 'offer_move',
        label: this.text('走子并提和：', 'Move and offer draw: ') + m.san,
        value: uci(m),
      })),
    );
    if (
      this.s.drawOffer !== undefined &&
      this.s.drawOffer !== null &&
      this.s.drawOffer !== this.actor
    )
      actions.push({
        id: 'accept_draw',
        kind: 'accept_draw',
        label: this.text('接受和棋', 'Accept draw'),
      });
    if (this.chess.isThreefoldRepetition() || this.chess.isDrawByFiftyMoves())
      actions.push({ id: 'claim_draw', kind: 'claim', label: this.text('申请和棋', 'Claim draw') });
    // FIDE 9.2 / 9.3 also allow a claim based on an announced intended move.
    for (const m of moves) {
      this.chess.move(m);
      if (this.chess.isThreefoldRepetition() || this.chess.isDrawByFiftyMoves())
        actions.push({
          id: `claim:${uci(m)}`,
          kind: 'claim',
          label: this.text('申请和棋：', 'Claim draw: ') + m.san,
          value: uci(m),
        });
      this.chess.undo();
    }
    actions.push({ id: 'resign', kind: 'resign', label: this.text('认输', 'Resign') });
    return actions;
  }
  execute(choice: Choice) {
    const actor = this.actor;
    if (choice.kind === 'accept_draw') {
      this.finish('draw', this.text('双方同意和棋', 'Draw by agreement'));
      return;
    }
    if (choice.kind === 'claim') {
      this.finish(
        'draw',
        this.text('三次重复或五十回合申请和棋', 'Draw claimed by repetition or fifty-move rule'),
      );
      return;
    }
    if (choice.kind === 'resign') {
      this.finish(actor ? 'white' : 'black', this.text('认输', 'Resignation'));
      return;
    }
    const move = choice.value!;
    const m = this.chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
    this.s.drawOffer = choice.kind === 'offer_move' ? actor : null;
    this.s.moves.push(move);
    this.s.fen = this.chess.fen();
    this.s.active = this.chess.turn() === 'w' ? 0 : 1;
    this.s.turn++;
    this.s.round = Math.floor(this.s.moves.length / 2) + 1;
    const count = (this.s.positions[key(this.s.fen)] =
      (this.s.positions[key(this.s.fen)] ?? 0) + 1);
    this.emit('move', `${this.p(actor).name}: ${m.san}`, actor, {
      from: m.from,
      to: m.to,
      san: m.san,
      promotion: m.promotion,
      drawOffer: this.s.drawOffer,
    });
    if (this.chess.isCheckmate())
      this.finish(actor ? 'black' : 'white', this.text('将死', 'Checkmate'));
    else if (this.chess.isStalemate()) this.finish('draw', this.text('逼和', 'Stalemate'));
    else if (this.chess.isInsufficientMaterial())
      this.finish('draw', this.text('子力不足', 'Insufficient material'));
    else if (count >= 5) this.finish('draw', this.text('五次重复局面', 'Fivefold repetition'));
    else if (Number(this.s.fen.split(' ')[4]) >= 150)
      this.finish('draw', this.text('七十五回合无吃子或兵移动', 'Seventy-five-move rule'));
  }
  view(viewer = -1): ArenaObservation {
    return {
      ...this.observation(viewer),
      board: this.chess.board(),
      details: {
        fen: this.s.fen,
        drawOffer: this.s.drawOffer ?? null,
        check: this.chess.isCheck(),
        moves: this.chess.history(),
        reason: this.s.reason,
        sides: this.s.locale === 'en' ? ['White', 'Black'] : ['白方', '黑方'],
      },
    };
  }
}
export const chessRules = (locale: Locale) =>
  locale === 'en'
    ? 'Standard chess, White first. Legal moves include castling, en passant, and all four promotions. Checkmate wins; stalemate and insufficient material draw. You may claim a draw after threefold repetition or fifty moves, including an intended move, using a claim action. Fivefold repetition and seventy-five moves draw automatically. You can offer a draw with offer:<UCI> alongside a move; the opponent may accept_draw or decline by moving. No clock. Coordinates use algebraic squares and action IDs use UCI. Chat is public, optional and cannot change the rules.'
    : '标准国际象棋，白方先行。支持王车易位、吃过路兵和四种升变。将死获胜，逼和或子力不足和棋。三次重复或五十回合可通过申请动作和棋（包括声明下一步）；五次重复或七十五回合自动和棋。可用 offer:<UCI> 随走子提和，对手可 accept_draw 接受或走子拒绝。无棋钟。坐标为代数格名，动作 ID 为 UCI。交流公开、可选，不能改变规则。';
export function chessHeuristic(view: ArenaObservation) {
  const actions = view.legalActions;
  const claim = actions.find((a) => a.kind === 'claim');
  if (claim)
    return {
      actionId: claim.id,
      reason: view.locale === 'en' ? 'Claim available draw' : '申请可用的和棋',
    };
  const moves = actions.filter((a) => a.kind === 'move');
  const score = (a: Choice) =>
    (a.label.includes('#') ? 100 : 0) +
    (a.label.includes('=Q') ? 15 : 0) +
    (a.label.includes('x') ? 5 : 0) +
    (a.label.includes('+') ? 2 : 0);
  const sorted = moves.sort((a, b) => score(b) - score(a));
  const best = sorted.filter((a) => score(a) === score(sorted[0]));
  return {
    actionId: best[view.turn % best.length]?.id ?? actions[0].id,
    reason: view.locale === 'en' ? 'Legal tactical baseline' : '合法战术基线',
  };
}
