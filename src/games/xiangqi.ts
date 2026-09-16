import { BaseEngine } from './base';
import type { ArenaObservation, ArenaState } from './core';
import type { AgentConfig, Choice } from '../types';
export type Piece = string | null;
export interface XiangqiState extends ArenaState {
  gameType: 'xiangqi';
  locale: 'zh';
  board: Piece[];
  quiet: number;
  positions: string[];
  checks: { side: number; check: boolean }[];
}
const side = (p: string) => (p === p.toUpperCase() ? 0 : 1);
const xy = (i: number) => [i % 9, Math.floor(i / 9)];
const inside = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 10;
const palace = (x: number, y: number, s: number) =>
  x >= 3 && x <= 5 && (s === 0 ? y >= 7 && y <= 9 : y >= 0 && y <= 2);
export const square = (i: number) => String.fromCharCode(97 + (i % 9)) + (9 - Math.floor(i / 9));
export function initialBoard(): Piece[] {
  const rows = [
    'rheakaehr',
    '.........',
    '.c.....c.',
    'p.p.p.p.p',
    '.........',
    '.........',
    'P.P.P.P.P',
    '.C.....C.',
    '.........',
    'RHEAKAEHR',
  ];
  return rows
    .join('')
    .split('')
    .map((p) => (p === '.' ? null : p));
}
function between(board: Piece[], from: number, to: number) {
  const [x, y] = xy(from),
    [tx, ty] = xy(to);
  if (x !== tx && y !== ty) return -1;
  const step = x === tx ? Math.sign(ty - y) * 9 : Math.sign(tx - x);
  let count = 0;
  for (let i = from + step; i !== to; i += step) if (board[i]) count++;
  return count;
}
/** Pseudo attacks include pinned pieces, as required for king safety. */
export function reaches(board: Piece[], from: number, to: number): boolean {
  const p = board[from];
  if (!p || from === to) return false;
  const [x, y] = xy(from),
    [tx, ty] = xy(to),
    dx = tx - x,
    dy = ty - y,
    s = side(p);
  switch (p.toLowerCase()) {
    case 'r':
      return between(board, from, to) === 0;
    case 'c':
      return between(board, from, to) === (board[to] ? 1 : 0);
    case 'h':
      return Math.abs(dx) === 2 && Math.abs(dy) === 1
        ? !board[y * 9 + x + Math.sign(dx)]
        : Math.abs(dx) === 1 && Math.abs(dy) === 2 && !board[(y + Math.sign(dy)) * 9 + x];
    case 'e':
      return (
        Math.abs(dx) === 2 &&
        Math.abs(dy) === 2 &&
        (s === 0 ? ty >= 5 : ty <= 4) &&
        !board[(y + dy / 2) * 9 + x + dx / 2]
      );
    case 'a':
      return Math.abs(dx) === 1 && Math.abs(dy) === 1 && palace(tx, ty, s);
    case 'k':
      return (
        (Math.abs(dx) + Math.abs(dy) === 1 && palace(tx, ty, s)) ||
        (board[to]?.toLowerCase() === 'k' && x === tx && between(board, from, to) === 0)
      );
    case 'p':
      return (
        (dx === 0 && dy === (s === 0 ? -1 : 1)) ||
        (dy === 0 && Math.abs(dx) === 1 && (s === 0 ? y <= 4 : y >= 5))
      );
  }
  return false;
}
export function inCheck(board: Piece[], s: number) {
  const king = board.indexOf(s === 0 ? 'K' : 'k');
  return king < 0 || board.some((p, i) => p && side(p) !== s && reaches(board, i, king));
}
export function xiangqiMoves(board: Piece[], s: number): [number, number][] {
  const moves: [number, number][] = [];
  for (let from = 0; from < 90; from++) {
    const p = board[from];
    if (!p || side(p) !== s) continue;
    for (let to = 0; to < 90; to++) {
      const target = board[to];
      if (target && (side(target) === s || target.toLowerCase() === 'k')) continue;
      if (!reaches(board, from, to)) continue;
      const next = [...board];
      next[to] = p;
      next[from] = null;
      if (!inCheck(next, s)) moves.push([from, to]);
    }
  }
  return moves;
}
const names: Record<string, string> = {
  K: '帅',
  A: '仕',
  E: '相',
  H: '马',
  R: '车',
  C: '炮',
  P: '兵',
  k: '将',
  a: '士',
  e: '象',
  h: '马',
  r: '车',
  c: '炮',
  p: '卒',
};
export class XiangqiEngine extends BaseEngine<XiangqiState> {
  constructor(id: string, agents: AgentConfig[], restored?: XiangqiState) {
    super(
      restored
        ? structuredClone(restored)
        : {
            id,
            version: 1,
            gameType: 'xiangqi',
            locale: 'zh',
            revision: 0,
            round: 1,
            turn: 1,
            active: 0,
            phase: '走棋',
            status: 'playing',
            winner: null,
            reason: null,
            players: agents.map((a, seat) => ({
              seat,
              agentId: a.id,
              name: a.name,
              role: seat ? '黑方' : '红方',
              alive: true,
            })),
            board: initialBoard(),
            quiet: 0,
            positions: [],
            checks: [],
          },
    );
    if (!this.s.positions.length) this.s.positions.push(this.position());
  }
  position() {
    return this.s.board.map((p) => p ?? '.').join('') + this.actor;
  }
  legalActions(): Choice[] {
    if (this.s.status !== 'playing') return [];
    return [
      ...xiangqiMoves(this.s.board, this.actor).map(([from, to]) => ({
        id: square(from) + square(to),
        kind: 'move',
        label: `${names[this.s.board[from]!]} ${square(from)} → ${square(to)}`,
        index: from,
        targets: [to],
        value: this.s.board[to] ?? '',
      })),
      { id: 'resign', kind: 'resign', label: '认输' },
    ];
  }
  execute(choice: Choice) {
    const actor = this.actor;
    if (choice.kind === 'resign') {
      this.finish(actor ? '红方' : '黑方', '认输');
      return;
    }
    const from = choice.index!,
      to = choice.targets![0],
      captured = this.s.board[to];
    this.s.board[to] = this.s.board[from];
    this.s.board[from] = null;
    this.s.quiet = captured ? 0 : this.s.quiet + 1;
    this.s.active = 1 - actor;
    this.s.turn++;
    this.s.round = Math.floor((this.s.turn - 1) / 2) + 1;
    const check = inCheck(this.s.board, this.actor);
    this.s.checks.push({ side: actor, check });
    this.s.positions.push(this.position());
    this.emit('move', `${this.p(actor).name}：${choice.label}${check ? '，将军' : ''}`, actor, {
      from: square(from),
      to: square(to),
      captured,
    });
    if (!xiangqiMoves(this.s.board, this.actor).length)
      this.finish(actor ? '黑方' : '红方', check ? '将死' : '困毙');
    else {
      const repeats = this.s.positions.flatMap((p, i) => (p === this.position() ? [i] : []));
      if (repeats.length >= 3) {
        const cycle = this.s.checks.slice(repeats.at(-3)!);
        const offenders = [0, 1].filter((s) => {
          const turns = cycle.filter((t) => t.side === s);
          return turns.length > 0 && turns.every((t) => t.check);
        });
        if (offenders.length === 1)
          this.finish(offenders[0] === 0 ? '黑方' : '红方', '单方长将判负');
        else this.finish('平局', '三次重复局面');
      } else if (this.s.quiet >= 120) this.finish('平局', '连续六十回合无吃子');
    }
  }
  view(viewer = -1): ArenaObservation {
    return {
      ...this.observation(viewer),
      board: Array.from({ length: 10 }, (_, y) =>
        Array.from({ length: 9 }, (_, x) => {
          const p = this.s.board[y * 9 + x];
          return p
            ? {
                type: p.toLowerCase(),
                color: side(p) ? 'black' : 'red',
                label: names[p],
                square: square(y * 9 + x),
              }
            : null;
        }),
      ),
      details: {
        check: inCheck(this.s.board, this.actor),
        reason: this.s.reason,
        quietPlies: this.s.quiet,
      },
    };
  }
}
export const xiangqiRules = () =>
  '中国象棋，红先黑后。将帅限九宫且不能照面，士走斜线，象不过河且受象眼限制，马受蹩马腿限制，炮隔一个棋子吃子，兵卒过河可横走、不得后退。将死或困毙均判负。三次重复时单方连续将军判该方负，其他重复和棋；连续60回合无吃子和棋。采用明确的实验室规则：不实现长捉及将捉混合循环的竞赛裁定，无棋钟。动作采用 UCCI 坐标，a0 是红方左下角、i9 是右上角。可公开交流，发言不能改变合法走法。';
export function xiangqiHeuristic(view: ArenaObservation) {
  const values: Record<string, number> = { r: 9, c: 4, h: 4, e: 2, a: 2, p: 1 };
  const moves = view.legalActions.filter((a) => a.kind === 'move');
  const score = (a: Choice) => values[a.value?.toLowerCase() ?? ''] ?? 0;
  moves.sort((a, b) => score(b) - score(a));
  const best = moves.filter((a) => score(a) === score(moves[0]));
  return {
    actionId: best[view.turn % best.length]?.id ?? 'resign',
    reason: '优先吃子，保持合法走法',
  };
}
