import { describe, it, expect } from 'vitest';
import { createDeck } from '../../src/cards';
import { Engine, ROLES, winningSide } from '../../src/engine';
import { agentInput, heuristic } from '../../server/agents';
import { agents, fixture, give, act, counters, top } from '../helpers';

describe('牌堆、身份和回合', () => {
  it('108张真实牌面、每花色27张、基础牌数量准确', () => {
    const d = createDeck();
    expect(d).toHaveLength(108);
    expect(new Set(d.map((c) => c.id)).size).toBe(108);
    for (const s of ['♥', '♠', '♣', '♦']) expect(d.filter((c) => c.suit === s)).toHaveLength(27);
    expect(d.filter((c) => c.name === '杀')).toHaveLength(30);
    expect(d.filter((c) => c.name === '闪')).toHaveLength(15);
    expect(d.filter((c) => c.name === '桃')).toHaveLength(8);
    expect(d.filter((c) => c.name === '无懈可击')).toHaveLength(4);
  });
  it.each([2, 3, 4, 5, 6, 7, 8])('%i 人身份、初始手牌与主公加体力', (n) => {
    const e = new Engine(
      'test',
      agents(n).map((a) => ({ ...a, hero: '张飞' })),
      8,
    );
    e.start();
    expect(e.s.players.map((p) => p.role).sort()).toEqual([...ROLES[n]].sort());
    const lord = e.s.players.find((p) => p.role === '主公')!;
    expect(lord.maxHp).toBe(n >= 5 ? 5 : 4);
    expect(lord.hand).toHaveLength(6);
    expect(e.s.players.filter((p) => p !== lord).every((p) => p.hand.length === 4)).toBe(true);
    expect(e.s.active).toBe(lord.seat);
    e.assertInvariants();
  });
  it.each([0, 1, 9])('拒绝非法人数 %s', (n) =>
    expect(() => new Engine('test', agents(n), 8)).toThrow(),
  );
  it('固定种子确定性发牌，状态可序列化恢复', () => {
    const a = new Engine('same', agents(), 82),
      b = new Engine('same', agents(), 82);
    a.start();
    b.start();
    expect(a.s).toEqual(b.s);
    const restored = new Engine('same', [], 1, JSON.parse(JSON.stringify(a.s)));
    expect(restored.legalActions()).toEqual(a.legalActions());
  });
  it('主公死但仍有忠臣时内奸不能胜', () => {
    const e = fixture(4);
    e.p(0).alive = false;
    e.p(1).role = '忠臣';
    e.p(2).role = '内奸';
    e.p(3).alive = false;
    expect(winningSide(e.s.players)).toBe('反贼');
    e.p(1).alive = false;
    expect(winningSide(e.s.players)).toBe('内奸');
  });
  it('过期和伪造动作不改变状态', () => {
    const e = fixture();
    give(e, 0, '杀');
    const before = structuredClone(e.s);
    expect(() => e.apply('invented')).toThrow('非法');
    expect(() => e.apply(e.legalActions()[0].id, -1)).toThrow('过期');
    expect(e.s).toEqual(before);
  });
  it('普通杀限一次、按存活座位计算距离', () => {
    const e = fixture();
    give(e, 0, '杀');
    give(e, 0, '杀');
    expect(e.distance(0, 2)).toBe(2);
    expect(
      e
        .legalActions()
        .filter((c) => c.kind === 'slash')
        .every((c) => c.targets![0] !== 2),
    ).toBe(true);
    act(e, 'slash', (c) => c.targets![0] === 1);
    act(e, 'pass');
    act(e, 'hit');
    expect(e.p(1).hp).toBe(3);
    expect(e.legalActions().some((c) => c.kind === 'slash')).toBe(false);
    e.p(1).alive = false;
    expect(e.distance(0, 2)).toBe(1);
  });
  it('弃牌到体力上限后进入下家回合', () => {
    const e = fixture();
    for (let i = 0; i < 5; i++) give(e, 0, '杀');
    e.p(0).hp = 2;
    act(e, 'end');
    act(e, 'discard');
    expect(e.p(0).hand).toHaveLength(2);
    expect(e.s.active).toBe(1);
  });
});
describe('响应、判定、救援和奖惩', () => {
  it('闪抵消杀', () => {
    const e = fixture();
    give(e, 0, '杀');
    give(e, 1, '闪');
    act(e, 'slash', (c) => c.targets![0] === 1);
    act(e, 'respond');
    expect(e.p(1).hp).toBe(4);
    expect(e.pending.type).toBe('play');
  });
  it('无双杀需要连续两张闪', () => {
    const e = fixture(2, ['吕布', '张辽']);
    give(e, 0, '杀');
    give(e, 1, '闪');
    act(e, 'slash');
    act(e, 'respond');
    expect(e.pending.need).toBe(1);
    act(e, 'pass');
    act(e, 'hit');
    expect(e.p(1).hp).toBe(3);
  });
  it('决斗轮流打出杀，并由另一方造成伤害', () => {
    const e = fixture(2);
    give(e, 0, '决斗');
    give(e, 1, '杀');
    act(e, 'trick');
    counters(e);
    act(e, 'respond');
    act(e, 'pass');
    expect(e.p(0).hp).toBe(3);
  });
  it('无懈可击可被无懈反制', () => {
    const e = fixture(2);
    give(e, 0, '无中生有');
    give(e, 0, '无懈可击');
    give(e, 1, '无懈可击');
    act(e, 'trick', (c) => c.label.includes('无中'));
    act(e, 'counter');
    act(e, 'counter');
    counters(e);
    expect(e.p(0).hand).toHaveLength(2);
    expect(e.p(1).hand).toHaveLength(0);
  });
  it('乐不思蜀非红桃跳过出牌，并清理判定牌', () => {
    const e = fixture(2);
    const id = give(e, 1, '乐不思蜀');
    e.remove(1, id);
    e.p(1).judge.push(id);
    e.s.tasks = [
      { type: 'delayed', actor: 1, card: id },
      { type: 'drawStage', actor: 1 },
      { type: 'play', actor: 1 },
    ];
    top(e, '♠');
    e.advance();
    counters(e);
    expect(e.p(1).judge).toHaveLength(0);
    expect(e.s.skipPlay).toBe(true);
    act(e, 'normalDraw');
    expect(e.s.active).toBe(0);
  });
  it('闪电黑桃2–9造成3点无来源伤害，否则传给下家', () => {
    const e = fixture(3);
    const id = give(e, 0, '闪电');
    act(e, 'delay');
    top(e, '♠', 5);
    e.s.tasks = [
      { type: 'delayed', actor: 0, card: id },
      { type: 'play', actor: 0 },
    ];
    e.advance();
    counters(e);
    expect(e.p(0).hp).toBe(1);
    expect(e.s.discard).toContain(id);
    const id2 = give(e, 0, '闪电');
    act(e, 'delay');
    top(e, '♥');
    e.s.tasks = [
      { type: 'delayed', actor: 0, card: id2 },
      { type: 'play', actor: 0 },
    ];
    e.advance();
    counters(e);
    expect(e.p(1).judge).toContain(id2);
  });
  it('负体力需足量桃救回，不能一张桃就跳出濒死', () => {
    const e = fixture(3);
    give(e, 0, '桃');
    give(e, 0, '桃');
    e.p(1).hp = 1;
    e.damage(1, 2, 2, '杀');
    e.advance();
    expect(e.p(1).hp).toBe(-1);
    act(e, 'save');
    expect(e.p(1).hp).toBe(0);
    expect(e.pending.type).toBe('rescue');
    act(e, 'save');
    expect(e.p(1).hp).toBe(1);
    expect(e.pending.type).toBe('play');
  });
  it('击杀反贼摸3张；主公误杀忠臣弃光手牌装备', () => {
    const e = fixture(4);
    give(e, 0, '杀');
    e.die(1, 0);
    expect(e.p(0).hand).toHaveLength(4);
    give(e, 0, '诸葛连弩', 'weapon');
    e.p(2).role = '忠臣';
    e.die(2, 0);
    expect(e.p(0).hand).toHaveLength(0);
    expect(e.p(0).equipment).toEqual({});
    e.assertInvariants();
  });
  it('AOE按座位依次响应，死亡会立即检查胜负', () => {
    const e = fixture(3);
    give(e, 0, '南蛮入侵');
    give(e, 1, '杀');
    act(e, 'trick');
    counters(e);
    expect(e.actor).toBe(1);
    act(e, 'respond');
    counters(e);
    expect(e.actor).toBe(2);
    act(e, 'pass');
    expect(e.p(1).hp).toBe(4);
    expect(e.p(2).hp).toBe(3);
  });
  it('五谷丰登每人一张，未选完的池在结算后清空', () => {
    const e = fixture(3);
    give(e, 0, '五谷丰登');
    act(e, 'trick');
    for (let i = 0; i < 3; i++) {
      counters(e);
      expect(e.actor).toBe(i);
      act(e, 'harvest');
    }
    expect(e.s.pool).toHaveLength(0);
    expect(e.s.players.every((p) => p.hand.length === 1)).toBe(true);
    e.assertInvariants();
  });
  it('借刀只对武器持有人结算一次', () => {
    const e = fixture(3);
    give(e, 0, '借刀杀人');
    const weapon = give(e, 1, '青釭剑', 'weapon');
    act(e, 'trick', (c) => c.targets?.[0] === 1 && c.targets[1] === 2);
    counters(e);
    expect(e.actor).toBe(1);
    act(e, 'pass');
    expect(e.p(0).hand).toContain(weapon);
    expect(e.pending.type).toBe('play');
  });
});
describe('装备与基础武将', () => {
  it('装备替换、坐骑距离与范围', () => {
    const e = fixture();
    const old = give(e, 0, '青釭剑', 'weapon');
    give(e, 0, '诸葛连弩');
    act(e, 'equip');
    expect(e.s.discard).toContain(old);
    give(e, 0, '赤兔', 'offense');
    expect(e.distance(0, 2)).toBe(1);
    give(e, 2, '绝影', 'defense');
    expect(e.distance(0, 2)).toBe(2);
  });
  it('诸葛连弩和咆哮取消杀次数限制', () => {
    for (const hero of ['张飞', '张辽']) {
      const e = fixture(2, [hero, '许褚']);
      if (hero === '张辽') give(e, 0, '诸葛连弩', 'weapon');
      give(e, 0, '杀');
      give(e, 0, '杀');
      act(e, 'slash');
      act(e, 'pass');
      act(e, 'hit');
      expect(e.legalActions().some((c) => c.kind === 'slash')).toBe(true);
    }
  });
  it('仁王盾挡黑杀，青釭剑可以无视', () => {
    for (const sword of [false, true]) {
      const e = fixture(2);
      give(e, 0, '杀', undefined, '♠');
      give(e, 1, '仁王盾', 'armor');
      if (sword) give(e, 0, '青釭剑', 'weapon');
      act(e, 'slash');
      if (sword) {
        act(e, 'pass');
        act(e, 'hit');
      }
      expect(e.p(1).hp).toBe(sword ? 3 : 4);
    }
  });
  it('铁骑不能绕过仁王盾', () => {
    const e = fixture(2, ['马超', '张辽']);
    give(e, 0, '杀', undefined, '♠');
    give(e, 1, '仁王盾', 'armor');
    top(e, '♥');
    act(e, 'slash');
    act(e, 'activate');
    expect(e.pending.type).toBe('play');
    expect(e.p(1).hp).toBe(4);
  });
  it.each(['♥', '♠'])('八卦阵 %s 判定红色抵消，黑色仍可手动出闪', (suit) => {
    const e = fixture(2);
    give(e, 0, '杀');
    give(e, 1, '八卦阵', 'armor');
    give(e, 1, '闪');
    top(e, suit);
    act(e, 'slash');
    act(e, 'bagua');
    if (suit === '♠') act(e, 'respond');
    expect(e.p(1).hp).toBe(4);
    expect(e.p(1).hand.length).toBe(suit === '♥' ? 1 : 0);
  });
  it('武圣红装备可当杀，但不能利用被转化武器的射程', () => {
    const e = fixture(4, ['关羽', '张辽']);
    const weapon = give(e, 0, '麒麟弓', 'weapon');
    expect(
      e
        .legalActions()
        .some((c) => c.kind === 'slash' && c.cards?.includes(weapon) && c.targets?.[0] === 2),
    ).toBe(false);
    expect(
      e
        .legalActions()
        .some((c) => c.kind === 'slash' && c.cards?.includes(weapon) && c.targets?.[0] === 1),
    ).toBe(true);
  });
  it('龙胆闪转杀，杀转闪', () => {
    const e = fixture(2, ['赵云', '赵云']);
    give(e, 0, '闪');
    give(e, 1, '杀');
    act(e, 'slash');
    act(e, 'respond');
    expect(e.p(1).hp).toBe(4);
  });
  it('丈八蛇矛两张牌转杀，方天画戟最后一张杀可选3目标', () => {
    const e = fixture();
    give(e, 0, '丈八蛇矛', 'weapon');
    give(e, 0, '闪');
    give(e, 0, '桃');
    expect(e.legalActions().some((c) => c.kind === 'slash' && c.cards?.length === 2)).toBe(true);
    const f = fixture();
    give(f, 0, '方天画戟', 'weapon');
    give(f, 0, '杀');
    expect(f.legalActions().some((c) => c.kind === 'slash' && c.targets?.length === 3)).toBe(true);
  });
  it('寒冰剑依次弃两张，防止伤害', () => {
    const e = fixture(2);
    give(e, 0, '寒冰剑', 'weapon');
    give(e, 0, '杀');
    give(e, 1, '桃');
    give(e, 1, '杀');
    act(e, 'slash');
    act(e, 'pass');
    act(e, 'ice');
    act(e, 'pick');
    act(e, 'pick');
    expect(e.p(1).hp).toBe(4);
    expect(e.p(1).hand).toHaveLength(0);
  });
  it('贯石斧付出两张代价后命中', () => {
    const e = fixture(2);
    give(e, 0, '贯石斧', 'weapon');
    give(e, 0, '杀');
    give(e, 0, '桃');
    give(e, 0, '闪');
    give(e, 1, '闪');
    act(e, 'slash');
    act(e, 'respond');
    act(e, 'axe');
    act(e, 'hit');
    expect(e.p(1).hp).toBe(3);
    expect(e.p(0).hand).toHaveLength(0);
  });
  it('青龙偃月刀可在被闪后追杀', () => {
    const e = fixture(2);
    give(e, 0, '青龙偃月刀', 'weapon');
    give(e, 0, '杀');
    give(e, 0, '杀');
    give(e, 1, '闪');
    act(e, 'slash');
    act(e, 'respond');
    expect(e.pending.type).toBe('chase');
    act(e, 'respond');
    act(e, 'pass');
    act(e, 'hit');
    expect(e.p(1).hp).toBe(3);
  });
  it('借刀中的武圣不能转化掉提供必需射程的武器', () => {
    const e = fixture(4, ['张辽', '关羽']);
    give(e, 0, '借刀杀人');
    const id = give(e, 1, '麒麟弓', 'weapon');
    act(e, 'trick', (c) => c.targets?.[0] === 1 && c.targets[1] === 3);
    counters(e);
    expect(e.legalActions().some((c) => c.kind === 'respond' && c.cards?.includes(id))).toBe(false);
  });
  it('麒麟弓造成伤害后可弃马', () => {
    const e = fixture(2);
    give(e, 0, '麒麟弓', 'weapon');
    give(e, 0, '杀');
    give(e, 1, '绝影', 'defense');
    act(e, 'slash');
    act(e, 'pass');
    act(e, 'hit');
    act(e, 'bow');
    expect(e.p(1).equipment.defense).toBeUndefined();
  });
  it('雌雄双股剑允许对方弃牌或让攻击者摸牌', () => {
    const e = fixture(2, ['张辽', '黄月英']);
    give(e, 0, '雌雄双股剑', 'weapon');
    give(e, 0, '杀');
    give(e, 1, '桃');
    act(e, 'slash');
    act(e, 'activate');
    act(e, 'pass');
    expect(e.p(0).hand).toHaveLength(1);
    expect(e.pending.type).toBe('slashResponse');
  });
});
describe('信息隔离与运行守恒', () => {
  it('其他手牌、隐藏身份、摸牌详情不进入玩家输入', () => {
    const e = new Engine('private', agents(), 55);
    e.start();
    const view = e.view(1);
    expect(view.players[0].hand).toBeUndefined();
    expect(view.players[2].role).toBe('未知');
    expect(view.players[1].role).not.toBe('未知');
    expect((view as any).seed).toBeUndefined();
    expect((view as any).deck).toBeUndefined();
    const draws = e.visibleHistory(1).filter((e) => e.type === 'draw' && e.actor !== 1);
    expect(draws.every((e) => !e.data && !!e.text)).toBe(true);
  });
  it('顺手牵羊盲选不暴露卡牌ID，获取后仅持有者看到', () => {
    const e = fixture(3);
    give(e, 0, '顺手牵羊');
    const hidden = give(e, 1, '桃');
    act(e, 'trick', (c) => c.targets?.[0] === 1);
    counters(e);
    expect(JSON.stringify(e.legalActions())).not.toContain(hidden);
    act(e, 'pick');
    expect(e.p(0).hand).toContain(hidden);
    const event = e.visibleHistory(2).at(-2);
    expect(
      e
        .visibleHistory(2)
        .filter((e) => e.type === 'move')
        .every((e) => !e.data),
    ).toBe(true);
  });
  it('结算中的牌不能在集智摸牌时被洗回牌堆', () => {
    const e = fixture(2, ['黄月英', '张辽']);
    const id = give(e, 0, '无中生有');
    act(e, 'trick');
    expect(e.s.resolving).toContain(id);
    expect(e.s.discard).not.toContain(id);
    act(e, 'activate');
    counters(e);
    expect(e.s.discard).toContain(id);
    e.assertInvariants();
  });
  it('2–8人不同种子完整对局，每一步检查卡牌守恒', () => {
    for (let n = 2; n <= 8; n++)
      for (let seed = 1; seed <= 3; seed++) {
        const e = new Engine(`sim-${n}-${seed}`, agents(n), seed);
        e.start();
        for (let i = 0; i < 2000 && e.s.status === 'playing'; i++) {
          const input = agentInput(e.view(e.actor), e.visibleHistory(e.actor), [], {
            contextEvents: 20,
          });
          const decision = heuristic(input);
          e.apply(decision.actionId, e.s.revision, decision.cardIds);
          e.assertInvariants();
        }
        expect(e.s.status, `${n} players seed ${seed}`).toBe('finished');
      }
  }, 30000);
});
