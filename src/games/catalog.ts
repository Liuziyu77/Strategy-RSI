import type { GameType, Locale } from './core';
/** Browser-safe discovery metadata. No engine imports. */
export const GAME_CATALOG: Record<
  GameType,
  {
    id: GameType;
    name: Record<Locale, string>;
    minPlayers: number;
    maxPlayers: number;
    locales: Locale[];
    rulesVersion: string;
  }
> = {
  sanguosha: {
    id: 'sanguosha',
    name: { zh: '三国杀', en: 'Sanguosha' },
    minPlayers: 2,
    maxPlayers: 8,
    locales: ['zh'],
    rulesVersion: 'standard-108-v1',
  },
  werewolf: {
    id: 'werewolf',
    name: { zh: '狼人杀', en: 'Werewolf' },
    minPlayers: 6,
    maxPlayers: 12,
    locales: ['zh', 'en'],
    rulesVersion: 'social-deduction-v1',
  },
  chess: {
    id: 'chess',
    name: { zh: '国际象棋', en: 'Chess' },
    minPlayers: 2,
    maxPlayers: 2,
    locales: ['zh', 'en'],
    rulesVersion: 'standard-v1',
  },
  xiangqi: {
    id: 'xiangqi',
    name: { zh: '中国象棋', en: '中国象棋' },
    minPlayers: 2,
    maxPlayers: 2,
    locales: ['zh'],
    rulesVersion: 'arena-v1',
  },
};
