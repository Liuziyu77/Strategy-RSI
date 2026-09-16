import { describe, expect, it } from 'vitest';
import { ChessEngine } from '../../src/games/chess';
import {
  XiangqiEngine,
  initialBoard,
  reaches,
  inCheck,
  xiangqiMoves,
  type Piece,
} from '../../src/games/xiangqi';
import { WerewolfEngine, wolfRoles } from '../../src/games/werewolf';
import { restoreEngine, gamePlugin } from '../../src/games/registry';
import type { GameEngine, GameType } from '../../src/games/core';
import type { AgentConfig } from '../../src/types';
const agents = (n: number): AgentConfig[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    name: `Agent ${i}`,
    hero: '张飞',
    kind: 'heuristic',
    provider: 'default',
    model: '',
    rsi: 'off',
  }));
function play(e: GameEngine, id: string, speech?: string) {
  e.apply(id, e.s.revision, undefined, speech);
}
function chessAt(fen: string) {
  return new ChessEngine('test', agents(2), 'en', {
    ...new ChessEngine('test', agents(2), 'en').s,
    initialFen: fen,
    fen,
    moves: [],
    positions: { [fen.split(' ').slice(0, 4).join(' ')]: 1 },
  });
}
function wolves(n = 6) {
  const e = new WerewolfEngine('wolf', agents(n), 42, 'en');
  e.start();
  return e;
}
function wolfPhase(e: WerewolfEngine, phase: string, seats: number[]) {
  e.setPhase(phase, seats);
  e.s.ballots = {};
}

describe('Chess rules and deterministic recovery', () => {
  it('starts with 20 legal moves and rejects illegal/stale actions without speech', () => {
    const e = new ChessEngine('c', agents(2));
    e.start();
    expect(e.legalActions().filter((a) => a.kind === 'move')).toHaveLength(20);
    const before = JSON.stringify(e.s),
      count = e.events.length;
    expect(() => play(e, 'e2e5', 'bad')).toThrow();
    expect(() => e.apply('e2e4', -1, undefined, 'bad')).toThrow();
    expect(JSON.stringify(e.s)).toBe(before);
    expect(e.events).toHaveLength(count);
  });
  it('Fool’s mate, result IDs and a restored midgame', () => {
    const e = new ChessEngine('c', agents(2), 'en');
    e.start();
    play(e, 'f2f3');
    play(e, 'e7e5');
    const r = restoreEngine(JSON.parse(JSON.stringify(e.s)));
    for (const engine of [e, r]) {
      play(engine, 'g2g4');
      play(engine, 'd8h4');
    }
    expect(r.s).toEqual(e.s);
    expect(e.s.winner).toBe('black');
    expect(e.s.outcome?.winners).toEqual(['a1']);
  });
  it('castling, attacked castling path, en passant, all promotions', () => {
    const castle = chessAt('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(castle.legalActions().map((a) => a.id)).toEqual(
      expect.arrayContaining(['e1g1', 'e1c1']),
    );
    play(castle, 'e1g1');
    expect(castle.chess.get('f1')?.type).toBe('r');
    const blocked = chessAt('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1');
    expect(blocked.legalActions().map((a) => a.id)).not.toContain('e1g1');
    const ep = chessAt('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    play(ep, 'e5d6');
    expect(ep.chess.get('d5')).toBeUndefined();
    const promotion = chessAt('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(promotion.legalActions().map((a) => a.id)).toEqual(
      expect.arrayContaining(['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n']),
    );
  });
  it('preserves repetition history; claims differ from automatic fivefold draw', () => {
    let e: GameEngine = new ChessEngine('c', agents(2), 'en');
    const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    for (let i = 0; i < 2; i++) for (const m of cycle) play(e, m);
    expect(e.s.status).toBe('playing');
    expect(e.legalActions().some((a) => a.id === 'claim_draw')).toBe(true);
    e = restoreEngine(JSON.parse(JSON.stringify(e.s)));
    for (let i = 0; i < 2; i++) for (const m of cycle) play(e, m);
    expect(e.s.status).toBe('finished');
    expect(e.s.reason).toBe('Fivefold repetition');
  });
  it('draw claims on intended moves, 75 moves, stalemate and material', () => {
    const e = chessAt('7k/8/8/8/8/8/R7/K7 w - - 99 60');
    expect(e.legalActions().some((a) => a.id.startsWith('claim:'))).toBe(true);
    play(e, e.legalActions().find((a) => a.kind === 'claim')!.id);
    expect(e.s.outcome?.draw).toBe(true);
    const auto = chessAt('7k/8/8/8/8/8/R7/K7 w - - 149 80');
    play(auto, 'a2b2');
    expect(auto.s.reason).toBe('Seventy-five-move rule');
    const stale = chessAt('7k/5K2/6Q1/8/8/8/8/8 w - - 0 1');
    play(stale, 'f7f6');
    expect(stale.s.reason).toBe('Stalemate');
    const material = chessAt('7k/8/8/8/8/8/3b4/K2R4 w - - 0 1');
    play(material, 'd1d2');
    // A rook remains, so this is not falsely classified as insufficient material.
    expect(material.s.status).toBe('playing');
  });
});

describe('Xiangqi movement and terminal rules', () => {
  it('has 44 opening moves; rook and cannon screens, horse legs, elephant eyes', () => {
    const b = initialBoard();
    expect(xiangqiMoves(b, 0)).toHaveLength(44);
    expect(reaches(b, 82, 63)).toBe(true); // b0-a2
    b[73] = 'P';
    expect(reaches(b, 82, 63)).toBe(false);
    b[73] = null;
    expect(reaches(b, 83, 63)).toBe(true);
    b[73] = 'P';
    expect(reaches(b, 83, 63)).toBe(false);
    const c: Piece[] = Array(90).fill(null);
    c[0] = 'C';
    c[9] = 'p';
    c[27] = 'r';
    expect(reaches(c, 0, 27)).toBe(true);
    c[18] = 'p';
    expect(reaches(c, 0, 27)).toBe(false);
    expect(reaches(c, 0, 1)).toBe(true);
    c[0] = 'R';
    expect(reaches(c, 0, 27)).toBe(false);
  });
  it('enforces palace, river, pawn direction and facing kings', () => {
    const b: Piece[] = Array(90).fill(null);
    b[85] = 'K';
    b[4] = 'k';
    b[49] = 'P';
    expect(inCheck(b, 0)).toBe(false);
    expect(xiangqiMoves(b, 0)).not.toContainEqual([49, 48]);
    b[49] = null;
    expect(inCheck(b, 0)).toBe(true);
    expect(reaches(b, 85, 84)).toBe(true);
    expect(reaches(b, 85, 76)).toBe(true);
    b[66] = 'A';
    expect(reaches(b, 66, 56)).toBe(false);
    b[47] = 'E';
    expect(reaches(b, 47, 27)).toBe(false);
    b[31] = 'P';
    expect(reaches(b, 31, 30)).toBe(true);
    expect(reaches(b, 31, 40)).toBe(false);
  });
  it('filters self-check, restores positions and records public speech', () => {
    const e = new XiangqiEngine('x', agents(2));
    e.start();
    play(e, 'b0c2', '开局先出马');
    const restored = restoreEngine(JSON.parse(JSON.stringify(e.s)));
    expect(restored.legalActions()).toEqual(e.legalActions());
    expect(e.events.find((e) => e.type === 'chat')?.data?.message).toBe('开局先出马');
    const before = JSON.stringify(e.s);
    expect(() => play(e, 'a0a9')).toThrow();
    expect(JSON.stringify(e.s)).toBe(before);
  });
  it('stalemate is a loss, not a draw', () => {
    const e = new XiangqiEngine('x', agents(2));
    e.s.board = Array(90).fill(null);
    e.s.board[4] = 'k';
    e.s.board[85] = 'K';
    e.s.board[49] = 'P';
    e.s.board[12] = 'R';
    e.s.board[14] = 'R';
    e.s.board[22] = 'R';
    // Rc7-c8 leaves all black palace exits attacked without checking the king.
    const move = e.legalActions().find((a) => a.index === 22 && a.targets?.[0] === 21)!;
    play(e, move.id);
    expect(e.s.winner).toBe('红方');
    expect(e.s.reason).toBe('困毙');
  });
});

describe('Werewolf rules, secrecy and phase transitions', () => {
  it('seeded roles for every supported size, hidden roles and wolf-only chat', () => {
    for (let n = 6; n <= 12; n++) {
      const a = wolves(n),
        b = wolves(n);
      expect(a.s.players).toEqual(b.s.players);
      expect(a.s.players.map((p) => p.role).sort()).toEqual(wolfRoles(n).sort());
      const wolf = a.actor,
        villager = a.s.players.find((p) => p.role === 'villager')!.seat;
      play(a, 'speak', 'secret signal');
      expect(a.visibleHistory(wolf).some((e) => e.text.includes('secret signal'))).toBe(true);
      expect(a.visibleHistory(villager).some((e) => e.text.includes('secret signal'))).toBe(false);
      expect(a.view(villager).players.filter((p) => p.role !== 'unknown')).toHaveLength(1);
      expect(a.view(villager).active).toBe(-1);
    }
  });
  it('seer result and witch victim are private, and night speech is suppressed', () => {
    const e = wolves(),
      seer = e.living('seer')[0],
      witch = e.living('witch')[0],
      wolf = e.living('wolf')[0],
      other = e.living('villager')[0];
    wolfPhase(e, 'seer', [seer]);
    e.s.victims = [other];
    play(e, `inspect:${wolf}`, 'should never publish');
    expect(e.view(seer).details?.visions).toEqual({ [wolf]: true });
    expect(e.view(other).details?.visions).toBeUndefined();
    expect(e.view(other).active).toBe(-1);
    expect(e.view(witch).details?.attacked).toEqual([other]);
    expect(e.view(other).details?.attacked).toBeUndefined();
    expect(e.visibleHistory(other).some((ev) => ev.type === 'inspection')).toBe(false);
    expect(e.events.some((ev) => ev.type === 'chat')).toBe(false);
    play(e, `heal:${other}`);
    expect(e.p(other).alive).toBe(true);
    expect(e.s.antidote).toBe(false);
  });
  it('witch cannot self-heal after first night or use both potions; poisoned hunter cannot shoot', () => {
    const e = wolves(),
      witch = e.living('witch')[0],
      hunter = e.living('hunter')[0];
    e.s.round = 2;
    e.s.victims = [witch];
    wolfPhase(e, 'witch', [witch]);
    expect(e.legalActions().some((a) => a.kind === 'heal')).toBe(false);
    play(e, `poison:${hunter}`);
    expect(e.p(hunter).alive).toBe(false);
    expect(e.s.phase).not.toBe('hunter');
    expect(e.s.poison).toBe(false);
  });
  it('hunter shot resolves before parity victory; eliminated villagers can still win', () => {
    const e = wolves(),
      hunter = e.living('hunter')[0],
      wolfSeats = e.living('wolf');
    e.p(wolfSeats[1]).alive = false;
    for (const p of e.s.players) if (p.role !== 'wolf' && p.seat !== hunter) p.alive = false;
    e.s.victims = [hunter];
    e.dawn();
    expect(e.s.phase).toBe('hunter');
    expect(e.s.status).toBe('playing');
    play(e, `shoot:${wolfSeats[0]}`);
    expect(e.s.winner).toBe('village');
    expect(e.s.outcome?.winners).toContain(e.p(hunter).agentId);
  });
  it('secret votes are revealed only after all voters; tie runoff then no exile', () => {
    const e = wolves(9),
      alive = e.living();
    wolfPhase(e, 'vote', alive);
    const first = alive[0],
      second = alive[1];
    play(e, `vote:${second}`);
    expect(e.visibleHistory(second).some((ev) => ev.type === 'ballot')).toBe(false);
    play(e, `vote:${first}`);
    while (e.s.phase === 'vote') play(e, 'skip');
    expect(e.s.voteRound).toBe(2);
    expect(e.s.runoff).toEqual([first, second]);
    while (e.s.phase === 'discussion') play(e, 'speak');
    play(e, `vote:${second}`);
    play(e, `vote:${first}`);
    while (e.s.phase === 'vote') play(e, 'skip');
    expect(e.s.players.every((p) => p.alive)).toBe(true);
    expect(e.s.phase).toBe('wolf_discussion');
  });
  it('night restoration preserves pending votes and potion state', () => {
    const e = wolves(9);
    while (e.s.phase === 'wolf_discussion') play(e, 'speak');
    play(e, e.legalActions()[0].id);
    const r = restoreEngine(JSON.parse(JSON.stringify(e.s)));
    expect(r.view(r.actor)).toEqual(e.view(e.actor));
    expect(r.legalActions()).toEqual(e.legalActions());
  });
});

it('every game can finish a local match without invalid moves across seeds', () => {
  for (const type of ['werewolf', 'chess', 'xiangqi'] as GameType[])
    for (const seed of [1, 7, 42]) {
      const plugin = gamePlugin(type),
        e = plugin.create(`${type}-${seed}`, agents(type === 'werewolf' ? 8 : 2), seed, 'zh');
      e.start();
      for (let step = 0; step < 450 && e.s.status === 'playing'; step++) {
        const d = plugin.heuristic(e.view(e.actor));
        play(e, d.actionId, d.speech);
        expect(e.legalActions().length > 0 || e.s.status === 'finished').toBe(true);
      }
      if (e.s.status !== 'finished') e.finish('平局', 'test decision cap');
      expect(e.s.outcome).toBeDefined();
    }
}, 30000);

it('chess draw offers accompany a move, survive restore and expire on a reply move', () => {
  const e = new ChessEngine('offer', agents(2), 'en');
  play(e, 'offer:e2e4');
  const restored = restoreEngine(structuredClone(e.s));
  expect(restored.legalActions().some((a) => a.id === 'accept_draw')).toBe(true);
  play(restored, 'accept_draw');
  expect(restored.s.reason).toBe('Draw by agreement');
  play(e, 'e7e5');
  expect(e.legalActions().some((a) => a.id === 'accept_draw')).toBe(false);
});
it('xiangqi perpetual checking loses across restart; quiet move limit draws', () => {
  let e = new XiangqiEngine('checks', agents(2));
  e.s.board = Array(90).fill(null);
  e.s.board[4] = 'k';
  e.s.board[86] = 'K';
  e.s.board[12] = 'R';
  e.s.positions = [e.position()];
  const cycle = ['d8e8', 'e9d9', 'e8d8', 'd9e9'];
  for (const move of cycle) play(e, move);
  e = restoreEngine(structuredClone(e.s)) as XiangqiEngine;
  for (const move of cycle) play(e, move);
  expect(e.s.winner).toBe('黑方');
  expect(e.s.reason).toBe('单方长将判负');
  const quiet = new XiangqiEngine('quiet', agents(2));
  quiet.s.quiet = 119;
  play(quiet, 'b0c2');
  expect(quiet.s.outcome?.draw).toBe(true);
});
it('xiangqi standard initial position has 1920 legal move pairs (perft depth 2)', () => {
  const board = initialBoard();
  let count = 0;
  for (const [from, to] of xiangqiMoves(board, 0)) {
    const next = [...board];
    next[to] = next[from];
    next[from] = null;
    count += xiangqiMoves(next, 1).length;
  }
  expect(count).toBe(1920);
});
