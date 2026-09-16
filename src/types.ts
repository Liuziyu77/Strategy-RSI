import type { GameType, Locale } from './games/core';
export type Role = '主公' | '忠臣' | '反贼' | '内奸';
export type Suit = '♠' | '♥' | '♣' | '♦';
export type Slot = 'weapon' | 'armor' | 'offense' | 'defense';
export interface Card {
  id: string;
  name: string;
  suit: Suit;
  rank: number;
  type: 'basic' | 'trick' | 'equipment';
  slot?: Slot;
  range?: number;
}
export interface Hero {
  name: string;
  hp: number;
  gender: '男' | '女';
  faction: string;
  skills: string[];
  description: string;
}
export interface Player {
  seat: number;
  agentId: string;
  name: string;
  hero: string;
  role: Role;
  hp: number;
  maxHp: number;
  alive: boolean;
  hand: string[];
  equipment: Partial<Record<Slot, string>>;
  judge: string[];
}
export type Task = {
  type: string;
  actor: number;
  target?: number;
  source?: number;
  card?: string;
  name?: string;
  amount?: number;
  need?: number;
  cursor?: number;
  passes?: number;
  cancelled?: boolean;
  effect?: Task;
  ignoreArmor?: boolean;
  usedArmor?: boolean;
  victim?: number;
  cards?: string[];
  remaining?: number;
};
export interface GameState {
  version: 1;
  id: string;
  seed: number;
  rng: number;
  revision: number;
  round: number;
  turn: number;
  active: number;
  phase: '准备' | '判定' | '摸牌' | '出牌' | '弃牌' | '结束';
  status: 'playing' | 'finished';
  winner: string | null;
  reason: string | null;
  players: Player[];
  cards: Record<string, Card>;
  deck: string[];
  discard: string[];
  pool: string[];
  resolving: string[];
  tasks: Task[];
  slashUsed: number;
  skipPlay: boolean;
  naked: boolean;
  skillUsed: boolean;
}
export interface Choice {
  id: string;
  kind: string;
  label: string;
  cards?: string[];
  targets?: number[];
  zone?: Slot | 'hand' | 'judge';
  index?: number;
  value?: string;
  selectCards?: { count: number; from: string[] };
}
export interface Decision {
  actionId: string;
  reason: string;
  cardIds?: string[];
  speech?: string;
}
export interface ChatMessage {
  seq: number;
  time: string;
  seat: number;
  agentId: string;
  name: string;
  text: string;
  round: number;
  turn: number;
  phase: string;
}
export interface GameEvent {
  seq: number;
  time: string;
  type: string;
  text: string;
  actor?: number;
  data?: Record<string, unknown>;
  privateTo?: number;
  publicText?: string;
  visibleTo?: number[];
}
export interface Observation {
  gameId: string;
  revision: number;
  round: number;
  turn: number;
  active: number;
  phase: string;
  status: string;
  winner: string | null;
  reason?: string | null;
  viewer: number;
  players: Array<
    Omit<Player, 'hand' | 'role'> & { role: Role | '未知'; handCount: number; hand?: Card[] }
  >;
  deckCount: number;
  discardCount: number;
  pool: Card[];
  pending: {
    type: string;
    actor: number;
    source?: number;
    target?: number;
    name?: string;
    need?: number;
  } | null;
  equipmentCards: Record<string, Card>;
  legalActions: Choice[];
}
export type RsiMode = 'off' | 'immediate' | 'round' | 'both';
export interface AgentConfig {
  id: string;
  name: string;
  kind: 'llm' | 'heuristic' | 'external';
  provider: string;
  model: string;
  rsi: RsiMode;
  hero: string;
}
export interface PlayerProfile extends AgentConfig {
  description: string;
  color: string;
  apiMode: 'provider' | 'custom';
  baseUrl: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface GameStats {
  games: number;
  finished: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
}
export interface PlayerRecord extends PlayerProfile {
  stats: GameStats & { memories: number; matches: number };
}
export interface PlayerMatchHistory {
  matchId: string;
  matchName: string;
  status: string;
  createdAt: string;
  plannedGames: number;
  stats: GameStats;
}
export interface PlayerGameHistory {
  gameId: string;
  matchId: string;
  matchName: string;
  number: number;
  status: string;
  matchStatus: string;
  winner: string | null;
  seat: number;
  name: string;
  hero: string;
  role: string;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  lastEventAt: string;
  durationMs: number | null;
  round: number;
  turn: number;
  decisionCount: number;
  playerCount: number;
  won: boolean;
}
export interface MatchConfig {
  gameType?: GameType;
  locale?: Locale;
  rulesVersion?: string;
  name: string;
  agents: AgentConfig[];
  games: number;
  concurrency?: number;
  seed: number;
  paceMs: number;
  maxDecisions: number;
  apiTimeoutMs: number;
  contextEvents: number;
  chatEnabled?: boolean;
  contextChatMessages?: number;
  autoStart: boolean;
  rotateSeats: boolean;
  roleMode?: 'random' | 'fixed';
  roleAssignments?: Record<string, Role>;
}
export interface Memory {
  gameType?: GameType;
  id: string;
  agentId: string;
  text: string;
  mode: string;
  gameId: string | null;
  createdAt: string;
  matchId?: string | null;
  matchName?: string | null;
  gameNumber?: number | null;
  consolidationId?: string | null;
  sourceIds?: string[];
  active?: boolean;
}
export type GameRunStatus =
  | 'paused'
  | 'running'
  | 'waiting'
  | 'reflecting'
  | 'finished'
  | 'error'
  | 'stopped';
export interface Consolidation {
  id: string;
  agentId: string;
  matchId: string;
  status: 'running' | 'completed' | 'error' | 'interrupted';
  model: string;
  sourceIds: string[];
  immediateCount: number;
  roundCount: number;
  completedCalls: number;
  reusedCalls?: number;
  retryCount?: number;
  timeoutMs?: number;
  stage: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
