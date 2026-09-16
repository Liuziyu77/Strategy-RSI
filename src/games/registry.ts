import { Engine } from '../engine';
import type { GameState, Role, Observation } from '../types';
import type { GamePlugin, GameType, ArenaState } from './core';
import { sanguoshaHeuristic } from './sanguosha-policy';
import { ChessEngine, chessHeuristic, chessRules, type ChessState } from './chess';
import { XiangqiEngine, xiangqiHeuristic, xiangqiRules, type XiangqiState } from './xiangqi';
import { WerewolfEngine, werewolfHeuristic, werewolfRules, type WerewolfState } from './werewolf';
const plugins: Record<GameType, GamePlugin> = {
  sanguosha: {
    id: 'sanguosha',
    create: (id, agents, seed, _locale, roles) =>
      new Engine(id, agents, seed, undefined, roles as Role[] | undefined),
    restore: (s) => new Engine(s.id, [], 1, s as GameState),
    rules: () => '三国杀标准身份局，108张牌。',
    heuristic: (v) => sanguoshaHeuristic(v as Observation),
  },
  chess: {
    id: 'chess',
    create: (id, agents, _seed, locale) => new ChessEngine(id, agents, locale),
    restore: (s) => new ChessEngine(s.id, [], s.locale, s as ChessState),
    rules: chessRules,
    heuristic: chessHeuristic,
  },
  xiangqi: {
    id: 'xiangqi',
    create: (id, agents) => new XiangqiEngine(id, agents),
    restore: (s) => new XiangqiEngine(s.id, [], s as XiangqiState),
    rules: xiangqiRules,
    heuristic: xiangqiHeuristic,
  },
  werewolf: {
    id: 'werewolf',
    create: (id, agents, seed, locale) => new WerewolfEngine(id, agents, seed, locale),
    restore: (s) => new WerewolfEngine(s.id, [], 1, s.locale, s as WerewolfState),
    rules: werewolfRules,
    heuristic: werewolfHeuristic,
  },
};
export function gamePlugin(id: GameType): GamePlugin {
  const plugin = plugins[id];
  if (!plugin) throw new Error(`Unknown game: ${id}`);
  return plugin;
}
export function restoreEngine(state: ArenaState) {
  if (state.version !== 1) throw new Error(`Unsupported state version: ${state.version}`);
  return gamePlugin(state.gameType ?? 'sanguosha').restore(state);
}
