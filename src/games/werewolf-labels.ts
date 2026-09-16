import type { Locale } from './core';
export const roleName = (role: string, locale: Locale) =>
  locale === 'en'
    ? ((
        {
          wolf: 'Werewolf',
          seer: 'Seer',
          witch: 'Witch',
          hunter: 'Hunter',
          villager: 'Villager',
          unknown: 'Unknown',
        } as Record<string, string>
      )[role] ?? role)
    : ((
        {
          wolf: '狼人',
          seer: '预言家',
          witch: '女巫',
          hunter: '猎人',
          villager: '村民',
          unknown: '未知',
        } as Record<string, string>
      )[role] ?? role);
export const phaseName = (phase: string, locale: Locale) =>
  (
    ({
      wolf_discussion: ['狼人密谈', 'Wolf discussion'],
      wolf_vote: ['狼人袭击', 'Wolf attack'],
      seer: ['预言家查验', 'Seer inspection'],
      witch: ['女巫行动', 'Witch action'],
      discussion: ['白天讨论', 'Day discussion'],
      vote: ['放逐投票', 'Exile vote'],
      hunter: ['猎人开枪', 'Hunter shot'],
      night: ['夜晚', 'Night'],
    }) as Record<string, string[]>
  )[phase]?.[locale === 'en' ? 1 : 0] ?? phase;
