import type { ArenaState } from './games/core';
import { createDeck, EQUIPMENT, HEROES, red } from './cards';
import { ROLES, validRoles } from './roles';
import { normalizeSpeech } from './chat';
export { ROLES } from './roles';
import type {
  AgentConfig,
  Card,
  Choice,
  GameEvent,
  GameState,
  Observation,
  Player,
  Role,
  Slot,
  Task,
} from './types';

export function winningSide(players: Player[]): string | null {
  const alive = players.filter((p) => p.alive),
    lord = players.find((p) => p.role === '主公');
  if (!lord?.alive) return alive.length === 1 && alive[0].role === '内奸' ? '内奸' : '反贼';
  if (alive.every((p) => p.role === '主公' || p.role === '忠臣')) return '主忠';
  return null;
}
export function combinations<T>(items: T[], n: number): T[][] {
  if (n === 0) return [[]];
  return items.flatMap((item, i) =>
    combinations(items.slice(i + 1), n - 1).map((tail) => [item, ...tail]),
  );
}

/** A synchronous, serializable rules machine. Only apply() accepts player input. */
export class Engine {
  state: GameState;
  events: GameEvent[] = [];
  onEvent?: (event: GameEvent, state: ArenaState) => void;
  constructor(
    id: string,
    agents: AgentConfig[],
    seed = 1,
    restored?: GameState,
    assignedRoles?: Role[],
  ) {
    if (restored) {
      this.state = structuredClone(restored);
      return;
    }
    if (!ROLES[agents.length]) throw new Error('玩家数量必须为 2–8 人');
    if (assignedRoles && !validRoles(assignedRoles, agents.length))
      throw new Error('身份配比不符合玩家人数');
    const cards = createDeck();
    this.state = {
      version: 1,
      id,
      seed,
      rng: seed >>> 0 || 1,
      revision: 0,
      round: 1,
      turn: 1,
      active: 0,
      phase: '准备',
      status: 'playing',
      winner: null,
      reason: null,
      cards: Object.fromEntries(cards.map((c) => [c.id, c])),
      players: [],
      deck: cards.map((c) => c.id),
      discard: [],
      pool: [],
      resolving: [],
      tasks: [],
      slashUsed: 0,
      skipPlay: false,
      naked: false,
      skillUsed: false,
    };
    const roles = assignedRoles ?? this.shuffle(ROLES[agents.length]);
    this.state.active = roles.indexOf('主公');
    this.state.players = agents.map((a, seat) => {
      const hero = HEROES.find((h) => h.name === a.hero) ?? HEROES[seat % HEROES.length];
      const hp = hero.hp + (roles[seat] === '主公' && agents.length >= 5 ? 1 : 0);
      return {
        seat,
        agentId: a.id,
        name: a.name,
        hero: hero.name,
        role: roles[seat],
        hp,
        maxHp: hp,
        alive: true,
        hand: [],
        equipment: {},
        judge: [],
      };
    });
    this.state.deck = this.shuffle(this.state.deck);
  }
  get s() {
    return this.state;
  }
  get pending() {
    return this.s.tasks[0];
  }
  get actor() {
    return this.pending?.actor ?? -1;
  }
  card(id: string) {
    return this.s.cards[id];
  }
  p(seat: number) {
    return this.s.players[seat];
  }
  has(seat: number, skill: string) {
    return HEROES.find((h) => h.name === this.p(seat).hero)!.skills.includes(skill);
  }
  equip(seat: number, slot: Slot) {
    const id = this.p(seat).equipment[slot];
    return id ? this.card(id).name : '';
  }
  random() {
    let t = (this.s.rng += 0x6d2b79f5);
    this.s.rng >>>= 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  shuffle<T>(input: T[]): T[] {
    const a = [...input];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  order(start = this.s.active) {
    return Array.from(
      { length: this.s.players.length },
      (_, i) => (start + i) % this.s.players.length,
    ).filter((i) => this.p(i).alive);
  }
  front(...tasks: Task[]) {
    this.s.tasks.unshift(...tasks);
  }
  emit(
    type: string,
    text: string,
    actor?: number,
    data?: Record<string, unknown>,
    privateTo?: number,
    publicText?: string,
  ) {
    const event: GameEvent = {
      seq: ++this.s.revision,
      time: new Date().toISOString(),
      type,
      text,
      actor,
      data,
      privateTo,
      publicText,
    };
    this.events.push(event);
    this.onEvent?.(event, this.s);
  }
  start() {
    const lord = this.s.players.find((p) => p.role === '主公')!;
    this.emit('start', `${this.s.players.length} 人对局开始，${lord.name}为主公`);
    for (const p of this.s.players) this.draw(p.seat, 4);
    this.front({ type: 'turnStart', actor: lord.seat });
    this.advance();
    this.emit('ready', '等待玩家行动', this.actor);
  }
  distance(from: number, to: number, excluding: string[] = []): number {
    if (from === to) return 0;
    const seats = this.order(0),
      a = seats.indexOf(from),
      b = seats.indexOf(to);
    let n = Math.min(Math.abs(a - b), seats.length - Math.abs(a - b));
    const off = this.p(from).equipment.offense;
    if (off && !excluding.includes(off)) n--;
    if (this.p(to).equipment.defense) n++;
    if (this.has(from, '马术')) n--;
    return Math.max(1, n);
  }
  range(seat: number, excluding: string[] = []): number {
    const id = this.p(seat).equipment.weapon;
    return id && !excluding.includes(id) ? (this.card(id).range ?? 1) : 1;
  }
  takeTop(): string | undefined {
    if (!this.s.deck.length && this.s.discard.length) {
      this.s.deck = this.shuffle(this.s.discard);
      this.s.discard = [];
      this.emit('shuffle', '弃牌堆洗入牌堆');
    }
    return this.s.deck.shift();
  }
  draw(seat: number, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = this.takeTop();
      if (!id) break;
      this.p(seat).hand.push(id);
      ids.push(id);
    }
    this.emit(
      'draw',
      `${this.p(seat).name}摸牌：${ids.map((c) => this.card(c).name).join('、')}`,
      seat,
      { cards: ids },
      seat,
      `${this.p(seat).name}摸了 ${ids.length} 张牌`,
    );
  }
  remove(seat: number, id: string) {
    const p = this.p(seat),
      h = p.hand.indexOf(id);
    if (h >= 0) {
      p.hand.splice(h, 1);
      return;
    }
    for (const slot of Object.keys(p.equipment) as Slot[])
      if (p.equipment[slot] === id) {
        delete p.equipment[slot];
        return;
      }
    const j = p.judge.indexOf(id);
    if (j >= 0) {
      p.judge.splice(j, 1);
      return;
    }
    throw new Error('牌不在玩家区域');
  }
  discardCards(seat: number, ids: string[]) {
    for (const id of ids) {
      this.remove(seat, id);
      this.s.discard.push(id);
    }
    this.emit(
      'discard',
      `${this.p(seat).name}弃置 ${ids.map((id) => this.card(id).name).join('、')}`,
      seat,
      { cards: ids },
    );
  }
  heal(seat: number) {
    const p = this.p(seat);
    if (p.hp < p.maxHp) {
      p.hp++;
      this.emit('heal', `${p.name}回复 1 点体力`, seat);
    }
  }
  damage(target: number, source: number | undefined, amount: number, name: string) {
    if (!this.p(target).alive) return;
    this.p(target).hp -= amount;
    this.emit('damage', `${this.p(target).name}受到 ${amount} 点${name}伤害`, source, {
      target,
      amount,
    });
    if (this.p(target).hp <= 0)
      this.front({ type: 'rescue', actor: this.order()[0], target, source, cursor: 0, name });
  }
  finish(winner: string, reason: string) {
    this.s.discard.push(...this.s.resolving, ...this.s.pool);
    this.s.resolving = [];
    this.s.pool = [];
    this.s.status = 'finished';
    this.s.winner = winner;
    this.s.reason = reason;
    this.s.tasks = [];
    this.emit('finish', `对局结束：${winner}（${reason}）`);
  }
  die(seat: number, source?: number) {
    const p = this.p(seat);
    p.alive = false;
    const ids = [...p.hand, ...Object.values(p.equipment), ...p.judge] as string[];
    for (const id of ids) this.remove(seat, id);
    this.s.discard.push(...ids);
    this.emit('death', `${p.name}阵亡，身份为${p.role}`, seat, { role: p.role, cards: ids });
    const winner = winningSide(this.s.players);
    if (winner) {
      this.finish(winner, '身份胜负条件达成');
      return;
    }
    if (source !== undefined && this.p(source).alive) {
      if (p.role === '反贼') this.draw(source, 3);
      if (p.role === '忠臣' && this.p(source).role === '主公')
        this.discardCards(source, [
          ...this.p(source).hand,
          ...Object.values(this.p(source).equipment),
        ] as string[]);
    }
  }
  judge(): Card | undefined {
    const id = this.takeTop();
    if (!id) return;
    this.s.discard.push(id);
    this.emit(
      'judgment',
      `判定牌：${this.card(id).suit}${this.card(id).rank} ${this.card(id).name}`,
      undefined,
      { card: id },
    );
    return this.card(id);
  }
  slashCards(seat: number, response = false): string[][] {
    const p = this.p(seat),
      result: string[][] = [];
    for (const id of [
      ...p.hand,
      ...(this.has(seat, '武圣') ? (Object.values(p.equipment) as string[]) : []),
    ]) {
      const c = this.card(id);
      if (
        c.name === '杀' ||
        (this.has(seat, '武圣') && red(c)) ||
        (this.has(seat, '龙胆') && c.name === '闪')
      )
        result.push([id]);
    }
    if (this.equip(seat, 'weapon') === '丈八蛇矛') result.push(...combinations(p.hand, 2));
    return result;
  }
  dodgeCards(seat: number) {
    return this.p(seat).hand.filter(
      (id) =>
        this.card(id).name === '闪' || (this.has(seat, '龙胆') && this.card(id).name === '杀'),
    );
  }
  zoneChoices(target: number, includeJudge = true): Omit<Choice, 'id'>[] {
    const p = this.p(target),
      out: Omit<Choice, 'id'>[] = [];
    // No hidden card IDs in another player's hand choices.
    for (let index = 0; index < p.hand.length; index++)
      out.push({
        kind: 'pick',
        label: `${p.name}的第 ${index + 1} 张手牌（暗牌）`,
        zone: 'hand',
        index,
      });
    for (const [slot, id] of Object.entries(p.equipment))
      out.push({
        kind: 'pick',
        label: `${p.name}的${this.card(id!).name}`,
        zone: slot as Slot,
        cards: [id!],
      });
    if (includeJudge)
      for (const id of p.judge)
        out.push({
          kind: 'pick',
          label: `${p.name}判定区的${this.card(id).name}`,
          zone: 'judge',
          cards: [id],
        });
    return out;
  }
  legalActions(): Choice[] {
    if (this.s.status !== 'playing' || !this.pending) return [];
    const t = this.pending,
      a = t.actor,
      p = this.p(a),
      choices: Omit<Choice, 'id'>[] = [];
    const add = (kind: string, label: string, extra: Partial<Choice> = {}) =>
      choices.push({ kind, label, ...extra });
    const pass = (label = '放弃响应') => add('pass', label);
    if (t.type === 'play') {
      for (const id of p.hand) {
        const c = this.card(id);
        if (c.slot) add('equip', `装备【${c.name}】`, { cards: [id] });
        else if (c.name === '桃' && p.hp < p.maxHp)
          add('peach', '使用【桃】回复体力', { cards: [id] });
        else if (c.type === 'trick' && c.name !== '无懈可击') {
          if (['无中生有', '桃园结义', '五谷丰登', '南蛮入侵', '万箭齐发'].includes(c.name))
            add('trick', `使用【${c.name}】`, { cards: [id] });
          else if (c.name === '闪电' && !p.judge.some((j) => this.card(j).name === '闪电'))
            add('delay', '放置【闪电】', { cards: [id], targets: [a] });
          else
            for (const target of this.order().filter((i) => i !== a)) {
              if (['过河拆桥', '顺手牵羊'].includes(c.name) && !this.zoneChoices(target).length)
                continue;
              if (c.name === '顺手牵羊' && !this.has(a, '奇才') && this.distance(a, target) > 1)
                continue;
              if (
                c.name === '乐不思蜀' &&
                this.p(target).judge.some((j) => this.card(j).name === c.name)
              )
                continue;
              if (c.name === '借刀杀人') {
                if (!this.p(target).equipment.weapon) continue;
                for (const victim of this.order().filter(
                  (i) => i !== target && this.distance(target, i) <= this.range(target),
                ))
                  add('trick', `借刀：${this.p(target).name} → ${this.p(victim).name}`, {
                    cards: [id],
                    targets: [target, victim],
                  });
              } else if (c.name !== '闪电')
                add(
                  c.name === '乐不思蜀' ? 'delay' : 'trick',
                  `【${c.name}】→ ${this.p(target).name}`,
                  { cards: [id], targets: [target] },
                );
            }
        }
      }
      for (const cards of this.slashCards(a)) {
        // A crossbow converted into Slash no longer supplies its unlimited quota.
        const weapon = p.equipment.weapon;
        if (
          this.s.slashUsed &&
          !this.has(a, '咆哮') &&
          !(this.equip(a, 'weapon') === '诸葛连弩' && !cards.includes(weapon!))
        )
          continue;
        const targets = this.order().filter(
          (i) => i !== a && this.distance(a, i, cards) <= this.range(a, cards),
        );
        const halberd =
          this.equip(a, 'weapon') === '方天画戟' &&
          p.hand.length === 1 &&
          cards.length === 1 &&
          p.hand.includes(cards[0]);
        for (let n = 1; n <= (halberd ? 3 : 1); n++)
          for (const group of combinations(targets, n))
            add(
              'slash',
              `【杀】${cards.map((id) => (this.card(id).name !== '杀' ? `(${this.card(id).name}转化)` : '')).join('')} → ${group.map((i) => this.p(i).name).join('、')}`,
              { cards, targets: group },
            );
      }
      add('end', '结束出牌阶段');
    } else if (t.type === 'counter') {
      for (const id of p.hand.filter((id) => this.card(id).name === '无懈可击'))
        add(
          'counter',
          `无懈可击：${t.cancelled ? '恢复' : '抵消'}【${t.effect?.name}】对${this.p(t.effect!.target!).name}的效果`,
          { cards: [id] },
        );
      pass('不使用无懈可击');
    } else if (
      ['slashResponse', 'massResponse', 'duelResponse', 'borrowResponse', 'chase'].includes(t.type)
    ) {
      let cards = t.name === '闪' ? this.dodgeCards(a).map((id) => [id]) : this.slashCards(a, true);
      if (t.type === 'borrowResponse' || t.type === 'chase')
        cards = cards.filter(
          (ids) =>
            this.p(t.target!).alive && this.distance(a, t.target!, ids) <= this.range(a, ids),
        );
      for (const ids of cards)
        add(
          'respond',
          `打出【${t.name}】${ids.map((id) => this.card(id).name).join('+') !== t.name ? `（${ids.map((id) => this.card(id).name).join('+')}转化）` : ''}`,
          { cards: ids },
        );
      if (t.name === '闪' && !t.ignoreArmor && !t.usedArmor && this.equip(a, 'armor') === '八卦阵')
        add('bagua', '发动八卦阵判定');
      pass(t.type === 'borrowResponse' ? '交出武器' : '放弃响应');
    } else if (t.type === 'rescue') {
      for (const id of p.hand.filter((id) => this.card(id).name === '桃'))
        add('save', `使用桃救援 ${this.p(t.target!).name}`, { cards: [id] });
      pass('不救援');
    } else if (t.type === 'discard') {
      const count = Math.max(0, p.hand.length - Math.max(0, p.hp));
      if (count)
        add('discard', `选择并一次弃置 ${count} 张手牌`, {
          selectCards: { count, from: [...p.hand] },
        });
    } else if (t.type === 'pick' || t.type === 'icePick')
      choices.push(...this.zoneChoices(t.target!, t.type !== 'icePick'));
    else if (t.type === 'harvest')
      for (const id of this.s.pool)
        add('harvest', `获得【${this.card(id).name} ${this.card(id).suit}${this.card(id).rank}】`, {
          cards: [id],
        });
    else if (t.type === 'drawChoice') {
      add('normalDraw', '正常摸两张牌');
      if (this.has(a, '裸衣')) add('naked', '发动裸衣，摸一张牌');
      if (this.has(a, '突袭')) {
        const targets = this.order().filter((i) => i !== a && this.p(i).hand.length);
        for (let n = 1; n <= 2; n++)
          for (const group of combinations(targets, n))
            add('raid', `突袭 ${group.map((i) => this.p(i).name).join('、')}`, { targets: group });
      }
    } else if (['jizhi', 'iron', 'doubleSword'].includes(t.type)) {
      add('activate', `发动${{ jizhi: '集智', iron: '铁骑', doubleSword: '雌雄双股剑' }[t.type]}`);
      pass('不发动');
    } else if (t.type === 'swordDiscard') {
      for (const id of p.hand) add('discard', `弃置【${this.card(id).name}】`, { cards: [id] });
      pass('让对方摸一张牌');
    } else if (t.type === 'slashHit') {
      add('hit', '结算杀的伤害');
      if (this.equip(a, 'weapon') === '寒冰剑' && this.zoneChoices(t.target!, false).length)
        add('ice', '发动寒冰剑：防止伤害，弃置对方两张牌');
    } else if (t.type === 'axe') {
      const ids = [
        ...p.hand,
        ...Object.values(p.equipment).filter((id) => id !== p.equipment.weapon),
      ] as string[];
      for (const cards of combinations(ids, 2))
        add('axe', `贯石斧：弃置${cards.map((id) => this.card(id).name).join('、')}，强制命中`, {
          cards,
        });
      pass('不发动贯石斧');
    } else if (t.type === 'bow') {
      for (const slot of ['offense', 'defense'] as Slot[]) {
        const id = this.p(t.target!).equipment[slot];
        if (id) add('bow', `麒麟弓：弃置${this.card(id).name}`, { cards: [id] });
      }
      pass('不发动麒麟弓');
    }
    return choices.map((c, i) => ({ ...c, id: `r${this.s.revision}-a${i}` }));
  }
  resolveAction(id: string, cardIds?: string[]): Choice {
    const c = this.legalActions().find((c) => c.id === id);
    if (!c) throw new Error('非法行动');
    if (!c.selectCards) {
      if (cardIds?.length) throw new Error('此行动不接受额外选牌');
      return c;
    }
    const { count, from } = c.selectCards;
    const selected = cardIds ?? (from.length === count ? from : []);
    if (
      selected.length !== count ||
      new Set(selected).size !== count ||
      selected.some((card) => !from.includes(card))
    )
      throw new Error(`必须从可选手牌中选择 ${count} 张不同的牌`);
    return {
      ...c,
      cards: [...selected],
      label: `弃置 ${count} 张手牌：${selected
        .map((card) => {
          const v = this.card(card);
          return `【${v.name} ${v.suit}${v.rank}】`;
        })
        .join('、')}`,
    };
  }
  apply(id: string, revision = this.s.revision, cardIds?: string[], speech?: string) {
    if (revision !== this.s.revision) throw new Error('过期决策：请获取最新状态');
    const c = this.resolveAction(id, cardIds);
    const message = normalizeSpeech(speech),
      speaker = this.p(this.actor);
    // Validate the action first, then publish before execution so responses can use the speech.
    // Keep the pending task in this frame: replay/restoration must retain the full rules state.
    if (message && speaker.alive)
      this.emit('chat', `${speaker.name}：${message}`, speaker.seat, {
        message,
        agentId: speaker.agentId,
        name: speaker.name,
        round: this.s.round,
        turn: this.s.turn,
        phase: this.s.phase,
      });
    const t = this.s.tasks.shift()!,
      a = t.actor;
    const showCards =
      ['slash', 'trick', 'equip', 'delay', 'peach', 'respond', 'counter', 'save'].includes(
        c.kind,
      ) && c.cards?.length;
    this.emit('action', `${this.p(a).name}：${c.label}`, a, {
      kind: c.kind,
      targets: c.targets,
      ...(showCards
        ? {
            visual: {
              cards: c.cards!.map((id) => this.card(id)),
              label: c.label,
              name:
                c.kind === 'slash'
                  ? '杀'
                  : c.kind === 'respond'
                    ? (t.name ?? (t.type === 'slashResponse' ? '闪' : '杀'))
                    : this.card(c.cards![0]).name,
              targets:
                c.targets ??
                (c.kind === 'save' || c.kind === 'delay'
                  ? [t.target!]
                  : c.kind === 'respond' && t.source !== undefined
                    ? [t.source]
                    : []),
            },
          }
        : {}),
    });
    if (t.type === 'play') this.play(a, c);
    else if (t.type === 'counter') {
      if (c.kind === 'counter') {
        this.discardCards(a, c.cards!);
        if (this.has(a, '集智')) this.front({ type: 'jizhi', actor: a });
        t.cancelled = !t.cancelled;
        t.passes = 0;
      } else t.passes = (t.passes ?? 0) + 1;
      const order = this.order();
      t.actor = order[(order.indexOf(a) + 1) % order.length];
      // The decision chain is resumed after any 集智 prompt.
      if (this.pending?.type === 'jizhi') this.s.tasks.splice(1, 0, t);
      else this.front(t);
    } else if (
      ['slashResponse', 'massResponse', 'duelResponse', 'borrowResponse', 'chase'].includes(t.type)
    )
      this.respond(t, c);
    else if (t.type === 'rescue') {
      if (c.kind === 'save') {
        this.discardCards(a, c.cards!);
        this.heal(t.target!);
        if (this.p(t.target!).hp <= 0) this.front(t);
      } else {
        t.cursor = (t.cursor ?? 0) + 1;
        this.front(t);
      }
    } else if (t.type === 'discard') {
      this.discardCards(a, c.cards!);
      this.front(t);
    } else if (t.type === 'pick' || t.type === 'icePick') {
      const target = t.target!,
        id = c.zone === 'hand' ? this.p(target).hand[c.index!] : c.cards![0];
      this.remove(target, id);
      const obtain = t.name === '顺手牵羊' || t.name === '突袭';
      if (obtain) this.p(a).hand.push(id);
      else this.s.discard.push(id);
      const secret = obtain && c.zone === 'hand';
      this.emit(
        'move',
        `${this.p(a).name}${obtain ? '获得' : '弃置'}了${this.p(target).name}的${this.card(id).name}`,
        a,
        { card: id, target },
        secret ? a : undefined,
        secret ? `${this.p(a).name}获得了${this.p(target).name}的一张手牌` : undefined,
      );
      if (t.type === 'icePick' && (t.remaining ?? 2) > 1 && this.zoneChoices(target, false).length)
        this.front({ ...t, remaining: (t.remaining ?? 2) - 1 });
    } else if (t.type === 'harvest') {
      const id = c.cards![0];
      this.s.pool.splice(this.s.pool.indexOf(id), 1);
      this.p(a).hand.push(id);
      this.emit('obtain', `${this.p(a).name}获得${this.card(id).name}`, a, { card: id });
    } else if (t.type === 'drawChoice') {
      if (c.kind === 'raid')
        this.front(
          ...c.targets!.map((target) => ({ type: 'pick', actor: a, target, name: '突袭' })),
        );
      else {
        if (c.kind === 'naked') this.s.naked = true;
        this.draw(a, c.kind === 'naked' ? 1 : 2);
      }
    } else if (t.type === 'jizhi') {
      if (c.kind === 'activate') this.draw(a, 1);
    } else if (t.type === 'iron') {
      const j = c.kind === 'activate' ? this.judge() : undefined;
      if (j && red(j)) this.front({ ...t.effect!, need: 0 });
      else this.front(t.effect!);
    } else if (t.type === 'doubleSword') {
      if (c.kind === 'activate') this.front({ type: 'swordDiscard', actor: t.target!, source: a });
    } else if (t.type === 'swordDiscard') {
      if (c.kind === 'discard') this.discardCards(a, c.cards!);
      else this.draw(t.source!, 1);
    } else if (t.type === 'slashHit') {
      if (c.kind === 'ice')
        this.front({ type: 'icePick', actor: a, target: t.target, remaining: 2, name: '寒冰剑' });
      else {
        if (this.equip(a, 'weapon') === '麒麟弓')
          this.front({ type: 'bow', actor: a, target: t.target });
        this.damage(t.target!, a, 1 + (a === this.s.active && this.s.naked ? 1 : 0), '杀');
      }
    } else if (t.type === 'axe') {
      if (c.kind === 'axe') {
        this.discardCards(a, c.cards!);
        this.front({ type: 'slashHit', actor: a, target: t.target });
      }
    } else if (t.type === 'bow') {
      if (c.kind === 'bow') this.discardCards(t.target!, c.cards!);
    }
    this.advance();
    this.assertInvariants();
    if (this.s.status === 'playing') this.emit('ready', '等待玩家行动', this.actor);
  }
  play(a: number, c: Choice) {
    if (c.kind === 'end') {
      this.front({ type: 'discard', actor: a });
      return;
    }
    this.front({ type: 'play', actor: a });
    const ids = c.cards!,
      card = this.card(ids[0]);
    if (c.kind === 'equip') {
      const old = this.p(a).equipment[card.slot!];
      if (old) this.discardCards(a, [old]);
      this.remove(a, card.id);
      this.p(a).equipment[card.slot!] = card.id;
      this.emit('equip', `${this.p(a).name}装备${card.name}`, a, { card: card.id });
    } else if (c.kind === 'delay') {
      this.remove(a, card.id);
      this.p(c.targets![0]).judge.push(card.id);
      this.emit('delay', `${card.name}进入${this.p(c.targets![0]).name}的判定区`, a, {
        card: card.id,
        target: c.targets![0],
      });
    } else {
      for (const id of ids) {
        this.remove(a, id);
        this.s.resolving.push(id);
      }
      this.emit('use', `${this.p(a).name}使用${c.kind === 'slash' ? '杀' : card.name}`, a, {
        cards: ids,
        targets: c.targets,
      });
      this.front({ type: 'release', actor: a, cards: ids });
      if (c.kind === 'peach') this.heal(a);
      else if (c.kind === 'slash') {
        this.s.slashUsed++;
        this.front(
          ...c.targets!.map((target) => ({
            type: 'slash',
            actor: a,
            target,
            card: card.id,
            cards: ids,
          })),
        );
      } else if (c.kind === 'trick') {
        const targets = ['桃园结义', '五谷丰登'].includes(card.name)
          ? this.order(a)
          : ['南蛮入侵', '万箭齐发'].includes(card.name)
            ? this.order(a).filter((i) => i !== a)
            : c.targets
              ? [c.targets[0]]
              : [a];
        if (card.name === '五谷丰登') {
          for (let i = 0; i < targets.length; i++) {
            const id = this.takeTop();
            if (id) this.s.pool.push(id);
          }
          this.emit('reveal', `五谷丰登亮出 ${this.s.pool.length} 张牌`, a, {
            cards: [...this.s.pool],
          });
        }
        const effects = targets.map((target) => ({
          type: 'trickEffect',
          actor: a,
          source: a,
          target,
          name: card.name,
          victim: c.targets?.[1],
        }));
        this.front(
          ...effects.map((effect) => ({
            type: 'counter',
            actor: this.order()[0],
            effect,
            passes: 0,
            cancelled: false,
          })),
          ...(card.name === '五谷丰登' ? [{ type: 'poolClear', actor: a }] : []),
        );
        if (this.has(a, '集智')) this.front({ type: 'jizhi', actor: a });
      }
    }
  }
  respond(t: Task, c: Choice) {
    const a = t.actor;
    if (c.kind === 'bagua') {
      const card = this.judge();
      if (!card || !red(card)) {
        this.front({ ...t, usedArmor: true });
        return;
      }
    } else if (c.kind === 'respond') this.discardCards(a, c.cards!);
    if (c.kind === 'pass') {
      if (t.type === 'borrowResponse') {
        const id = this.p(a).equipment.weapon;
        if (id) {
          this.remove(a, id);
          this.p(t.source!).hand.push(id);
          this.emit('move', `${this.p(t.source!).name}获得${this.card(id).name}`, t.source, {
            card: id,
          });
        }
      } else if (t.type === 'slashResponse')
        this.front({ type: 'slashHit', actor: t.source!, target: a });
      else if (t.type !== 'chase')
        this.damage(
          a,
          t.source,
          1 + (t.type === 'duelResponse' && t.source === this.s.active && this.s.naked ? 1 : 0),
          t.type === 'duelResponse' ? '决斗' : t.name === '闪' ? '万箭齐发' : '南蛮入侵',
        );
      return;
    }
    if ((t.need ?? 1) > 1) {
      this.front({ ...t, need: t.need! - 1, usedArmor: false });
      return;
    }
    if (t.type === 'duelResponse')
      this.front({
        type: 'duelResponse',
        actor: t.source!,
        source: a,
        name: '杀',
        need: this.has(a, '无双') ? 2 : 1,
      });
    if (t.type === 'borrowResponse' || t.type === 'chase')
      this.front({ type: 'slash', actor: a, target: t.target, card: c.cards![0], cards: c.cards });
    if (t.type === 'slashResponse' && this.p(t.source!).alive) {
      const weapon = this.equip(t.source!, 'weapon');
      if (weapon === '贯石斧') this.front({ type: 'axe', actor: t.source!, target: a });
      if (weapon === '青龙偃月刀')
        this.front({ type: 'chase', actor: t.source!, target: a, name: '杀' });
    }
  }
  advance() {
    for (let guard = 0; guard < 1000 && this.s.status === 'playing'; guard++) {
      const t = this.pending;
      if (!t) throw new Error('规则队列意外为空');
      const a = t.actor;
      if (t.type === 'turnStart') {
        this.s.tasks.shift();
        this.s.active = a;
        this.s.phase = '准备';
        this.s.slashUsed = 0;
        this.s.skipPlay = false;
        this.s.naked = false;
        this.front(
          ...[...this.p(a).judge].reverse().map((card) => ({ type: 'delayed', actor: a, card })),
          { type: 'drawStage', actor: a },
          { type: 'play', actor: a },
        );
        this.emit('turn', `第 ${this.s.round} 轮 · ${this.p(a).name}的回合`, a);
        continue;
      }
      if (t.type === 'delayed') {
        this.s.tasks.shift();
        if (!this.p(a).judge.includes(t.card!)) continue;
        this.s.phase = '判定';
        this.front({
          type: 'counter',
          actor: this.order()[0],
          passes: 0,
          cancelled: false,
          effect: {
            type: 'judgeEffect',
            actor: a,
            target: a,
            card: t.card,
            name: this.card(t.card!).name,
          },
        });
        this.emit('phase', '判定阶段', a);
        continue;
      }
      if (t.type === 'counter') {
        if (!this.p(t.effect!.target!).alive || (t.passes ?? 0) >= this.order().length) {
          this.s.tasks.shift();
          if (!t.cancelled && this.p(t.effect!.target!).alive) this.front(t.effect!);
          else {
            if (t.effect!.type === 'judgeEffect')
              this.clearDelayed(t.effect!, t.effect!.name === '闪电');
            this.emit('cancel', `【${t.effect!.name}】的本次效果被抵消或目标已离场`);
          }
          continue;
        }
        return;
      }
      if (t.type === 'judgeEffect') {
        this.s.tasks.shift();
        const card = this.judge();
        if (t.name === '乐不思蜀') {
          if (card?.suit !== '♥') this.s.skipPlay = true;
          this.clearDelayed(t, false);
        } else {
          const hit = card?.suit === '♠' && card.rank >= 2 && card.rank <= 9;
          this.clearDelayed(t, !hit);
          if (hit) this.damage(a, undefined, 3, '闪电');
        }
        continue;
      }
      if (t.type === 'drawStage') {
        this.s.tasks.shift();
        if (!this.p(a).alive) continue;
        this.s.phase = '摸牌';
        this.emit('phase', '摸牌阶段', a);
        if (this.has(a, '裸衣') || this.has(a, '突袭'))
          this.front({ type: 'drawChoice', actor: a });
        else this.draw(a, 2);
        continue;
      }
      if (t.type === 'play') {
        if (!this.p(a).alive || this.s.skipPlay) {
          this.s.tasks.shift();
          this.front({ type: 'discard', actor: a });
          continue;
        }
        if (this.s.phase !== '出牌') {
          this.s.phase = '出牌';
          this.emit('phase', '出牌阶段', a);
        }
        return;
      }
      if (t.type === 'discard') {
        if (this.s.phase !== '弃牌') {
          this.s.phase = '弃牌';
          this.emit('phase', '弃牌阶段', a);
        }
        if (this.p(a).alive && this.p(a).hand.length > Math.max(0, this.p(a).hp)) return;
        this.s.tasks.shift();
        this.s.phase = '结束';
        this.emit('phase', '回合结束', a);
        const next = this.order((a + 1) % this.s.players.length)[0];
        if (this.p(next).role === '主公') this.s.round++;
        this.s.turn++;
        this.front({ type: 'turnStart', actor: next });
        continue;
      }
      if (t.type === 'trickEffect') {
        this.s.tasks.shift();
        this.resolveTrick(t);
        continue;
      }
      if (t.type === 'release') {
        this.s.tasks.shift();
        for (const id of t.cards!) {
          const i = this.s.resolving.indexOf(id);
          if (i >= 0) {
            this.s.resolving.splice(i, 1);
            this.s.discard.push(id);
          }
        }
        this.emit('resolved', '卡牌结算完成', a, { cards: t.cards });
        continue;
      }
      if (t.type === 'poolClear') {
        this.s.tasks.shift();
        this.s.discard.push(...this.s.pool);
        this.s.pool = [];
        this.emit('poolClear', '五谷丰登剩余牌进入弃牌堆');
        continue;
      }
      if (t.type === 'slash') {
        this.s.tasks.shift();
        if (!this.p(a).alive || !this.p(t.target!).alive) continue;
        const effect = {
          ...t,
          type: 'slashDefend',
          ignoreArmor: this.equip(a, 'weapon') === '青釭剑',
        };
        this.front(
          this.has(a, '铁骑') ? { type: 'iron', actor: a, target: t.target, effect } : effect,
        );
        const ga = HEROES.find((h) => h.name === this.p(a).hero)!.gender,
          gb = HEROES.find((h) => h.name === this.p(t.target!).hero)!.gender;
        if (this.equip(a, 'weapon') === '雌雄双股剑' && ga !== gb)
          this.front({ type: 'doubleSword', actor: a, target: t.target });
        continue;
      }
      if (t.type === 'slashDefend') {
        this.s.tasks.shift();
        const black = (t.cards ?? [t.card!]).every((id) => !red(this.card(id)));
        if (!t.ignoreArmor && this.equip(t.target!, 'armor') === '仁王盾' && black) {
          this.emit('armor', '仁王盾抵消黑色杀', t.target);
          continue;
        }
        if (t.need === 0) {
          this.front({ type: 'slashHit', actor: a, target: t.target });
          continue;
        }
        this.front({
          type: 'slashResponse',
          actor: t.target!,
          source: a,
          name: '闪',
          need: this.has(a, '无双') ? 2 : 1,
          ignoreArmor: t.ignoreArmor,
        });
        continue;
      }
      if (t.type === 'rescue') {
        if (this.p(t.target!).hp > 0) {
          this.s.tasks.shift();
          continue;
        }
        const order = this.order();
        if ((t.cursor ?? 0) >= order.length) {
          this.s.tasks.shift();
          this.die(t.target!, t.source);
          continue;
        }
        t.actor = order[t.cursor ?? 0];
        return;
      }
      if (['pick', 'icePick', 'harvest', 'bow', 'axe'].includes(t.type)) {
        if (
          (t.target !== undefined && !this.p(t.target).alive) ||
          !this.p(a).alive ||
          !this.legalActions().length
        ) {
          this.s.tasks.shift();
          continue;
        }
      }
      if (!this.p(a).alive) {
        this.s.tasks.shift();
        continue;
      }
      return;
    }
    if (this.s.status === 'playing') throw new Error('规则自动推进超出上限');
  }
  clearDelayed(t: Task, pass: boolean) {
    const p = this.p(t.target ?? t.actor),
      id = t.card!;
    if (!p.judge.includes(id)) return;
    this.remove(p.seat, id);
    const next = pass
      ? this.order((p.seat + 1) % this.s.players.length).find(
          (i) => i !== p.seat && !this.p(i).judge.some((j) => this.card(j).name === '闪电'),
        )
      : undefined;
    if (next !== undefined) this.p(next).judge.push(id);
    else this.s.discard.push(id);
    this.emit(
      'delayResolved',
      next === undefined ? `${this.card(id).name}进入弃牌堆` : `闪电传至${this.p(next).name}`,
      p.seat,
      { card: id, target: next },
    );
  }
  resolveTrick(t: Task) {
    const a = t.actor,
      target = t.target!;
    if (!this.p(target).alive) return;
    switch (t.name) {
      case '无中生有':
        this.draw(target, 2);
        break;
      case '桃园结义':
        this.heal(target);
        break;
      case '五谷丰登':
        if (this.s.pool.length) this.front({ type: 'harvest', actor: target });
        break;
      case '过河拆桥':
      case '顺手牵羊':
        this.front({ type: 'pick', actor: a, target, name: t.name });
        break;
      case '决斗':
        this.front({
          type: 'duelResponse',
          actor: target,
          source: a,
          name: '杀',
          need: this.has(a, '无双') ? 2 : 1,
        });
        break;
      case '南蛮入侵':
      case '万箭齐发':
        this.front({
          type: 'massResponse',
          actor: target,
          source: a,
          name: t.name === '南蛮入侵' ? '杀' : '闪',
        });
        break;
      case '借刀杀人':
        this.front({
          type: 'borrowResponse',
          actor: target,
          source: a,
          target: t.victim,
          name: '杀',
        });
        break;
    }
  }
  view(viewer = -1): Observation {
    const publicCards: Record<string, Card> = {};
    for (const p of this.s.players)
      for (const id of [...Object.values(p.equipment), ...p.judge])
        if (id) publicCards[id] = this.card(id);
    const t = this.pending;
    return {
      gameId: this.s.id,
      revision: this.s.revision,
      round: this.s.round,
      turn: this.s.turn,
      active: this.s.active,
      phase: this.s.phase,
      status: this.s.status,
      winner: this.s.winner,
      reason: this.s.reason,
      viewer,
      players: this.s.players.map((p) => ({
        ...p,
        role:
          viewer === -1 ||
          viewer === p.seat ||
          p.role === '主公' ||
          !p.alive ||
          this.s.status === 'finished'
            ? p.role
            : '未知',
        handCount: p.hand.length,
        hand: viewer === -1 || viewer === p.seat ? p.hand.map((id) => this.card(id)) : undefined,
      })),
      deckCount: this.s.deck.length,
      discardCount: this.s.discard.length,
      pool: this.s.pool.map((id) => this.card(id)),
      equipmentCards: publicCards,
      pending: t
        ? {
            type: t.type,
            actor: t.actor,
            source: t.source,
            target: t.target ?? t.effect?.target,
            name: t.name ?? t.effect?.name,
            need: t.need,
          }
        : null,
      legalActions: viewer === this.actor ? this.legalActions() : [],
    };
  }
  visibleHistory(viewer: number): GameEvent[] {
    return this.events.map((e) =>
      e.privateTo === undefined || e.privateTo === viewer
        ? e
        : {
            seq: e.seq,
            time: e.time,
            type: e.type,
            text: e.publicText ?? '私有事件',
            actor: e.actor,
          },
    );
  }
  assertInvariants() {
    const zones = [
      ...this.s.deck,
      ...this.s.discard,
      ...this.s.pool,
      ...this.s.resolving,
      ...this.s.players.flatMap((p) => [...p.hand, ...Object.values(p.equipment), ...p.judge]),
    ] as string[];
    if (zones.length !== 108 || new Set(zones).size !== 108 || zones.some((id) => !this.card(id)))
      throw new Error('卡牌守恒失败');
    for (const p of this.s.players) {
      if (p.hp > p.maxHp) throw new Error('体力超上限');
      if (!p.alive && (p.hand.length || Object.keys(p.equipment).length || p.judge.length))
        throw new Error('死亡区域未清理');
    }
  }
}
