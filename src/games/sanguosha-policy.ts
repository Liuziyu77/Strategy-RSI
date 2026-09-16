import type { Observation, Choice, Decision } from '../types';
export function sanguoshaHeuristic(v: Observation): Decision {
  const me = v.players[v.viewer],
    own = me.role,
    actions = v.legalActions;
  if (!actions.length) throw new Error('没有合法行动');
  const enemy = (seat: number) => {
    const p = v.players[seat];
    if (seat === v.viewer) return -8;
    if (own === '反贼') return p.role === '主公' ? 8 : p.role === '反贼' ? -6 : 1;
    if (own === '主公' || own === '忠臣')
      return p.role === '主公' || p.role === '忠臣'
        ? -8
        : p.role === '反贼' || p.role === '内奸'
          ? 7
          : 2;
    return p.role === '主公' && v.players.filter((p) => p.alive).length > 2 ? -4 : 3;
  };
  const value = (id: string) => {
    const c =
      me.hand?.find((c) => c.id === id) ?? v.equipmentCards[id] ?? v.pool.find((c) => c.id === id);
    return c?.name === '桃'
      ? 9
      : c?.name === '闪'
        ? 6
        : c?.name === '无懈可击'
          ? 5
          : c?.name === '杀'
            ? 4
            : 3;
  };
  const score = (c: Choice) => {
    const target = c.targets?.[0];
    let s = 0;
    if (c.kind === 'end' || c.kind === 'pass') return -2;
    if (c.kind === 'equip') return 5;
    if (c.kind === 'peach') return 15;
    if (c.kind === 'save')
      return v.pending?.target === v.viewer || enemy(v.pending?.target ?? v.viewer) < 0 ? 20 : -10;
    if (c.kind === 'respond' || c.kind === 'bagua') return 12;
    if (c.kind === 'slash') return 4 + enemy(target!);
    if (c.kind === 'trick')
      return c.label.includes('无中生有')
        ? 15
        : target !== undefined
          ? 3 + enemy(target)
          : c.label.includes('桃园')
            ? me.hp < me.maxHp
              ? 5
              : -3
            : 2;
    if (c.kind === 'delay') return target === v.viewer ? -8 : enemy(target!);
    if (c.kind === 'counter') {
      const target = v.pending?.target ?? v.viewer,
        name = v.pending?.name ?? '',
        beneficial = ['无中生有', '桃园结义', '五谷丰登'].includes(name);
      const threat = beneficial ? enemy(target) : -enemy(target);
      return c.label.includes('恢复') ? -threat : threat;
    }
    if (c.kind === 'discard') return 10 - value(c.cards![0]);
    if (c.kind === 'pick') return c.zone === 'hand' ? 3 : 5;
    if (c.kind === 'harvest') return value(c.cards![0]);
    if (c.kind === 'activate') return 8;
    if (c.kind === 'normalDraw') return 5;
    if (c.kind === 'raid') return c.targets!.reduce((sum, i) => sum + Math.max(0, enemy(i)), 0);
    if (c.kind === 'naked') return (me.hand ?? []).some((c) => c.name === '杀') ? 6 : 1;
    if (c.kind === 'hit' || c.kind === 'bow') return 8;
    if (c.kind === 'axe') return 1 - c.cards!.reduce((sum, id) => sum + value(id) / 4, 0);
    return s;
  };
  const selection = actions.find((c) => c.selectCards);
  if (selection?.selectCards)
    return {
      actionId: selection.id,
      cardIds: [...selection.selectCards.from]
        .sort((a, b) => value(a) - value(b))
        .slice(0, selection.selectCards.count),
      reason: '一次弃置超出体力上限的手牌，优先保留桃和闪',
    };
  const selected = [...actions].sort((a, b) => score(b) - score(a))[0];
  return { actionId: selected.id, reason: '基于可见身份、体力、卡牌价值与合法目标的本地策略' };
}
