import type { Card, Hero, Slot, Suit } from './types';

export const HEROES: Hero[] = [
  {
    name: '张飞',
    hp: 4,
    gender: '男',
    faction: '蜀',
    skills: ['咆哮'],
    description: '咆哮：出牌阶段使用杀无次数限制。',
  },
  {
    name: '关羽',
    hp: 4,
    gender: '男',
    faction: '蜀',
    skills: ['武圣'],
    description: '武圣：可将一张红色手牌或装备牌当杀使用或打出。',
  },
  {
    name: '赵云',
    hp: 4,
    gender: '男',
    faction: '蜀',
    skills: ['龙胆'],
    description: '龙胆：可将手牌中的杀当闪、闪当杀使用或打出。',
  },
  {
    name: '马超',
    hp: 4,
    gender: '男',
    faction: '蜀',
    skills: ['马术', '铁骑'],
    description:
      '马术：计算与其他角色的距离时减一。铁骑：使用杀指定目标后可判定，若为红色，此杀不能被闪响应。',
  },
  {
    name: '黄月英',
    hp: 3,
    gender: '女',
    faction: '蜀',
    skills: ['集智', '奇才'],
    description: '集智：使用非延时锦囊时可摸一张牌。奇才：使用锦囊无距离限制。',
  },
  {
    name: '许褚',
    hp: 4,
    gender: '男',
    faction: '魏',
    skills: ['裸衣'],
    description: '裸衣：摸牌阶段可少摸一张牌，本回合杀与决斗造成的伤害加一。',
  },
  {
    name: '张辽',
    hp: 4,
    gender: '男',
    faction: '魏',
    skills: ['突袭'],
    description: '突袭：摸牌阶段可改为获得至多两名其他角色的各一张手牌。',
  },
  {
    name: '吕布',
    hp: 4,
    gender: '男',
    faction: '群',
    skills: ['无双'],
    description: '无双：杀需两张闪；决斗中，对方每次需连续打出两张杀。',
  },
];
export const EQUIPMENT: Record<string, { slot: Slot; range?: number; description: string }> = {
  诸葛连弩: { slot: 'weapon', range: 1, description: '使用杀无次数限制。' },
  雌雄双股剑: {
    slot: 'weapon',
    range: 2,
    description: '对异性角色使用杀时，可令其弃一张手牌，否则你摸一张牌。',
  },
  青釭剑: { slot: 'weapon', range: 2, description: '使用杀时无视目标防具。' },
  寒冰剑: {
    slot: 'weapon',
    range: 2,
    description: '杀造成伤害时，可防止伤害，改为依次弃置目标两张手牌或装备。',
  },
  青龙偃月刀: { slot: 'weapon', range: 3, description: '杀被闪抵消后可继续对该目标使用杀。' },
  丈八蛇矛: { slot: 'weapon', range: 3, description: '可将两张手牌当杀使用或打出。' },
  贯石斧: {
    slot: 'weapon',
    range: 3,
    description: '杀被闪抵消后可弃两张其他手牌或装备，令杀仍造成伤害。',
  },
  方天画戟: {
    slot: 'weapon',
    range: 4,
    description: '使用最后一张手牌杀时，可额外指定至多两个目标。',
  },
  麒麟弓: { slot: 'weapon', range: 5, description: '杀造成伤害后可弃置目标的一张坐骑。' },
  八卦阵: { slot: 'armor', description: '需要闪时可判定，红色视为打出一张闪。' },
  仁王盾: { slot: 'armor', description: '黑色杀对你无效。' },
  赤兔: { slot: 'offense', description: '到其他角色距离减一。' },
  大宛: { slot: 'offense', description: '到其他角色距离减一。' },
  紫骍: { slot: 'offense', description: '到其他角色距离减一。' },
  绝影: { slot: 'defense', description: '其他角色到你的距离加一。' },
  的卢: { slot: 'defense', description: '其他角色到你的距离加一。' },
  爪黄飞电: { slot: 'defense', description: '其他角色到你的距离加一。' },
};
export const CARD_RULES: Record<string, string> = {
  杀: '出牌阶段限一次，对攻击范围内其他角色造成1点伤害；目标可出闪抵消。',
  闪: '响应杀或万箭齐发，抵消该次效果。',
  桃: '出牌阶段回复自己1点体力；任一角色濒死时可救援回复1点。',
  无中生有: '摸两张牌。',
  过河拆桥: '弃置其他角色区域里的一张牌。',
  顺手牵羊: '获得距离1以内其他角色区域里的一张牌。',
  决斗: '目标开始轮流打出杀，未打出者受到另一方造成的1点伤害。',
  南蛮入侵: '其他角色依次打出一张杀，否则受到1点伤害。',
  万箭齐发: '其他角色依次打出一张闪，否则受到1点伤害。',
  桃园结义: '所有角色依次回复1点体力。',
  五谷丰登: '亮出存活人数的牌，每名角色依次选择一张获得。',
  无懈可击: '抵消一个锦囊对一名角色的效果，也可抵消另一张无懈可击。',
  乐不思蜀: '置于其他角色判定区；其判定阶段若不为红桃，跳过出牌阶段。',
  闪电: '置于自己判定区；判定黑桃2至9，受到无来源的3点伤害，否则传给下家。',
  借刀杀人: '选择装备武器的其他角色及其攻击范围内的一名角色；前者对后者使用杀，否则你获得其武器。',
};

// 标准包 + EX 的公开牌面数据；每一项是“点数:牌名”，每花色27张。
const FACES: Record<Suit, string> = {
  '♥': '1:桃园结义 1:万箭齐发 2:闪 2:闪 3:桃 3:五谷丰登 4:桃 4:五谷丰登 5:麒麟弓 5:赤兔 6:桃 6:乐不思蜀 7:桃 7:无中生有 8:桃 8:无中生有 9:桃 9:无中生有 10:杀 10:杀 11:杀 11:无中生有 12:桃 12:过河拆桥 12:闪电 13:闪 13:爪黄飞电',
  '♠': '1:决斗 1:闪电 2:雌雄双股剑 2:八卦阵 2:寒冰剑 3:过河拆桥 3:顺手牵羊 4:过河拆桥 4:顺手牵羊 5:青龙偃月刀 5:绝影 6:乐不思蜀 6:青釭剑 7:杀 7:南蛮入侵 8:杀 8:杀 9:杀 9:杀 10:杀 10:杀 11:顺手牵羊 11:无懈可击 12:过河拆桥 12:丈八蛇矛 13:南蛮入侵 13:大宛',
  '♦': '1:诸葛连弩 1:决斗 2:闪 2:闪 3:闪 3:顺手牵羊 4:闪 4:顺手牵羊 5:闪 5:贯石斧 6:杀 6:闪 7:杀 7:闪 8:杀 8:闪 9:杀 9:闪 10:杀 10:闪 11:闪 11:闪 12:桃 12:方天画戟 12:无懈可击 13:杀 13:紫骍',
  '♣': '1:决斗 1:诸葛连弩 2:杀 2:八卦阵 2:仁王盾 3:杀 3:过河拆桥 4:杀 4:过河拆桥 5:杀 5:的卢 6:杀 6:乐不思蜀 7:杀 7:南蛮入侵 8:杀 8:杀 9:杀 9:杀 10:杀 10:杀 11:杀 11:杀 12:借刀杀人 12:无懈可击 13:借刀杀人 13:无懈可击',
};
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const [suit, faces] of Object.entries(FACES))
    for (const face of faces.split(' ')) {
      const [rank, name] = face.split(':');
      const eq = EQUIPMENT[name];
      cards.push({
        id: `c${cards.length.toString().padStart(3, '0')}`,
        name,
        suit: suit as Suit,
        rank: +rank,
        type: eq ? 'equipment' : ['杀', '闪', '桃'].includes(name) ? 'basic' : 'trick',
        ...(eq ? { slot: eq.slot, range: eq.range } : {}),
      });
    }
  return cards;
}
export const red = (card: Card) => card.suit === '♥' || card.suit === '♦';
