import { Engine, ROLES } from '../src/engine';
import { HEROES } from '../src/cards';
import type { AgentConfig, Choice, Slot } from '../src/types';
export const agents = (n = 4, kind: AgentConfig['kind'] = 'heuristic'): AgentConfig[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `agent-${i + 1}`,
    name: `Agent ${i + 1}`,
    kind,
    provider: 'default',
    model: kind === 'llm' ? 'test-model' : '',
    rsi: 'off',
    hero: HEROES[i % HEROES.length].name,
  }));
export function fixture(n = 4, heroes = ['张辽', '许褚', '赵云', '关羽']) {
  const e = new Engine(
    'fixture',
    agents(n).map((a, i) => ({ ...a, hero: heroes[i % heroes.length] })),
    17,
    undefined,
    ROLES[n],
  );
  e.s.tasks = [{ type: 'play', actor: 0 }];
  e.s.phase = '出牌';
  e.s.players.forEach((p) => {
    p.role = p.seat === 0 ? '主公' : '反贼';
  });
  return e;
}
export function give(e: Engine, seat: number, name: string, slot?: Slot, suit?: string) {
  const id = e.s.deck.find((id) => e.card(id).name === name && (!suit || e.card(id).suit === suit));
  if (!id) throw new Error(`没有牌 ${name}`);
  e.s.deck.splice(e.s.deck.indexOf(id), 1);
  if (slot) e.p(seat).equipment[slot] = id;
  else e.p(seat).hand.push(id);
  return id;
}
export function top(e: Engine, suit: string, rank?: number) {
  const id = e.s.deck.find(
    (id) => e.card(id).suit === suit && (!rank || e.card(id).rank === rank),
  )!;
  e.s.deck.splice(e.s.deck.indexOf(id), 1);
  e.s.deck.unshift(id);
  return id;
}
export function act(e: Engine, kind: string, predicate: (c: Choice) => boolean = () => true) {
  const c = e.legalActions().find((c) => c.kind === kind && predicate(c));
  if (!c)
    throw new Error(
      `缺少 ${kind}：${JSON.stringify(e.pending)} ${JSON.stringify(e.legalActions())}`,
    );
  e.apply(c.id, e.s.revision, c.selectCards?.from.slice(0, c.selectCards.count));
  return c;
}
export function counters(e: Engine) {
  for (let i = 0; e.pending?.type === 'counter' && i < 100; i++) act(e, 'pass');
}
