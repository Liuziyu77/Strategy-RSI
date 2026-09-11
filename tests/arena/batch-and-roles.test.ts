import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Engine, ROLES } from '../../src/engine';
import { Arena } from '../../server/arena';
import { Store } from '../../server/store';
import { MatchSchema } from '../../server/config';
import { heuristic } from '../../server/agents';
import { createApp } from '../../server/app';
import { agents, fixture, give } from '../helpers';

const arenas: Arena[] = [],
  dirs: string[] = [];
function setup(kind: 'llm' | 'external' | 'heuristic' = 'llm', extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sgs-batch-'));
  dirs.push(dir);
  const arena = new Arena(new Store(dir), {
    dataDir: dir,
    host: '127.0.0.1',
    port: 0,
    adminToken: '',
    providers: [
      {
        id: 'default',
        name: 'Mock',
        apiKey: 'test-key',
        baseUrl: 'http://test.invalid/v1',
        models: ['test-model'],
      },
    ],
  });
  arenas.push(arena);
  const match = arena.create({
    agents: agents(2, kind).map((a) => ({ ...a, hero: '张飞' })),
    autoStart: false,
    paceMs: 0,
    ...extra,
  });
  const engine = arena.engine(arena.current(match.id).id);
  const seat = engine.s.active;
  engine.p(seat).hp = 2;
  engine.s.tasks = [{ type: 'discard', actor: seat }];
  engine.s.phase = '弃牌';
  arena.store.checkpoint(engine.s);
  return { arena, engine, match, seat };
}
afterEach(async () => {
  for (const arena of arenas.splice(0)) await arena.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it('一次模型请求弃完四张牌，只有一条接受决策，记录和恢复保存实际选牌', async () => {
  const { arena, engine, match, seat } = setup();
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    expect(input.observation.legalActions).toHaveLength(1);
    expect(input.observation.legalActions[0].selectCards.count).toBe(4);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(heuristic(input)) } }] }),
    );
  });
  await arena.step(match.id);
  expect(mock).toHaveBeenCalledTimes(1);
  expect(engine.p(seat).hand).toHaveLength(2);
  expect(engine.s.active).not.toBe(seat);
  const decisions = arena.store.decisions(engine.s.id);
  expect(decisions).toHaveLength(1);
  expect(decisions[0].source).toBe('llm');
  expect(decisions[0].decision.cardIds).toHaveLength(4);
  expect(decisions[0].action.cards).toEqual(decisions[0].decision.cardIds);
  const restored = new Engine(engine.s.id, [], 0, arena.store.game(engine.s.id).state);
  expect(restored.p(seat).hand).toHaveLength(2);
  expect(engine.events.filter((e) => e.type === 'discard' && e.actor === seat)).toHaveLength(1);
  restored.assertInvariants();
});

it('数量错误、重复、非手牌和过期的批量弃牌在改动状态之前被拒绝', () => {
  const e = fixture(2);
  const cards = [give(e, 0, '杀'), give(e, 0, '闪'), give(e, 0, '桃')];
  const weapon = give(e, 0, '诸葛连弩', 'weapon'),
    foreign = give(e, 1, '杀');
  e.p(0).hp = 1;
  e.s.tasks = [{ type: 'discard', actor: 0 }];
  const action = e.legalActions()[0],
    before = structuredClone(e.s);
  for (const selection of [
    undefined,
    [],
    [cards[0]],
    cards,
    [cards[0], cards[0]],
    [cards[0], weapon],
    [cards[0], foreign],
  ]) {
    expect(() => e.apply(action.id, e.s.revision, selection)).toThrow('不同的牌');
    expect(e.s).toEqual(before);
  }
  expect(() => e.apply(action.id, e.s.revision + 1, cards.slice(0, 2))).toThrow('过期');
  e.apply(action.id, e.s.revision, cards.slice(0, 2));
  expect(e.p(0).hand).toEqual([cards[2]]);
  e.assertInvariants();
});

it('大手牌仅提供选择数量与候选牌，不枚举所有弃牌组合', () => {
  const e = fixture(2);
  e.p(0).hand.push(...e.s.deck.splice(0, 40));
  e.p(0).hp = 3;
  e.s.tasks = [{ type: 'discard', actor: 0 }];
  expect(e.legalActions()).toHaveLength(1);
  expect(e.legalActions()[0].selectCards).toEqual({ count: 37, from: e.p(0).hand });
  e.apply(e.legalActions()[0].id, e.s.revision, e.p(0).hand.slice(0, 37));
  expect(e.p(0).hand).toHaveLength(3);
  e.assertInvariants();
});

it('模型无效批量选牌重试后仍无效才兜底，兜底也一次完成', async () => {
  const { arena, engine, match, seat } = setup();
  const before = structuredClone(engine.s);
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    expect(engine.s).toEqual(before);
    const input = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                actionId: input.observation.legalActions[0].id,
                cardIds: [],
              }),
            },
          },
        ],
      }),
    );
  });
  await arena.step(match.id);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(engine.p(seat).hand).toHaveLength(2);
  expect(arena.store.decisions(engine.s.id)).toHaveLength(1);
  expect(arena.store.decisions(engine.s.id)[0].fallback).toContain('4 张不同的牌');
});

it('外部Agent的选牌模板不会被误判为唯一动作，提交批量选牌后推进', async () => {
  const { arena, engine, match, seat } = setup('external');
  arena.resume(match.id);
  await arena.workers.get(match.id);
  expect(arena.store.match(match.id).status).toBe('waiting');
  expect(arena.store.decisions(engine.s.id)).toHaveLength(0);
  const agent = engine.p(seat).agentId,
    cards = engine.p(seat).hand.slice(0, 4);
  const response = await createApp(arena).request(`/api/agent/${engine.s.id}/${agent}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${match.agentTokens[agent]}`,
    },
    body: JSON.stringify({
      actionId: engine.legalActions()[0].id,
      revision: engine.s.revision,
      cardIds: cards,
    }),
  });
  expect(response.status).toBe(200);
  await arena.workers.get(match.id);
  expect(engine.p(seat).hand).toHaveLength(2);
  expect(arena.store.decisions(engine.s.id)[0].action.cards).toEqual(cards);
});

it('所有手牌都必须弃置时无需模型调用', async () => {
  const { arena, engine, match, seat } = setup();
  engine.p(seat).hp = 0;
  const mock = vi.spyOn(globalThis, 'fetch');
  await arena.step(match.id);
  expect(mock).not.toHaveBeenCalled();
  expect(engine.p(seat).hand).toHaveLength(0);
  expect(arena.store.decisions(engine.s.id)[0].source).toBe('forced');
});

it.each([2, 3, 4, 5, 6, 7, 8])('%i 人局的主公可随机出现在任一座位，身份配比保持合法', (n) => {
  const lords = new Set<number>();
  for (let seed = 1; seed <= 100; seed++) {
    const e = new Engine('random', agents(n), seed);
    expect(e.s.players.map((p) => p.role).sort()).toEqual([...ROLES[n]].sort());
    lords.add(e.s.players.find((p) => p.role === '主公')!.seat);
  }
  expect(lords.size).toBe(n);
});

it('非首座主公开局、体力加成、首轮顺序与隐藏身份正确', () => {
  const roles = ['反贼', '忠臣', '主公', '反贼', '内奸'] as const;
  const e = new Engine(
    'roles',
    agents(5).map((a) => ({ ...a, hero: '黄月英' })),
    4,
    undefined,
    [...roles],
  );
  e.start();
  expect(e.p(2).maxHp).toBe(4);
  expect(e.p(0).maxHp).toBe(3);
  expect(e.s.active).toBe(2);
  expect(e.p(2).hand).toHaveLength(6);
  expect(e.view(0).players.map((p) => p.role)).toEqual(['反贼', '未知', '主公', '未知', '未知']);
  for (const [seat, next, round] of [
    [2, 3, 1],
    [3, 4, 1],
    [4, 0, 1],
    [0, 1, 1],
    [1, 2, 2],
  ]) {
    e.discardCards(seat, [...e.p(seat).hand]);
    e.s.tasks = [{ type: 'discard', actor: seat }];
    e.advance();
    expect(e.s.active).toBe(next);
    expect(e.s.round).toBe(round);
  }
  e.assertInvariants();
});

it('固定身份覆盖所有局并跟随玩家轮换座位，随机模式只固定首局预览', () => {
  const assignment = { 'agent-1': '反贼', 'agent-2': '主公' };
  const { arena, match } = setup('heuristic', {
    games: 5,
    roleMode: 'fixed',
    roleAssignments: assignment,
  });
  for (let number = 1; number <= 5; number++) {
    const e =
      number === 1
        ? arena.engine(arena.current(match.id).id)
        : arena.newGame(match.id, match.config, number);
    expect(Object.fromEntries(e.s.players.map((p) => [p.agentId, p.role]))).toEqual(assignment);
    expect(e.p(0).agentId).toBe(number % 2 ? 'agent-1' : 'agent-2');
  }
  const { arena: randomArena, match: randomMatch } = setup('heuristic', {
    games: 20,
    roleMode: 'random',
    roleAssignments: assignment,
  });
  expect(randomArena.engine(randomArena.current(randomMatch.id).id).p(1).role).toBe('主公');
  const seen = new Set<string>();
  for (let number = 2; number <= 20; number++) {
    const e = randomArena.newGame(randomMatch.id, randomMatch.config, number);
    seen.add(e.s.players.find((p) => p.agentId === 'agent-1')!.role);
  }
  expect(seen).toEqual(new Set(['主公', '反贼']));
});

it('服务端拒绝人数配比、缺少玩家、额外玩家和缺少固定身份配置', () => {
  for (const config of [
    { roleMode: 'fixed' },
    { roleAssignments: { 'agent-1': '主公', 'agent-2': '主公' } },
    { roleAssignments: { 'agent-1': '主公' } },
    { roleAssignments: { 'agent-1': '主公', stranger: '反贼' } },
    { roleAssignments: { 'agent-1': '主公', 'agent-2': '反贼', stranger: '内奸' } },
  ])
    expect(MatchSchema.safeParse({ agents: agents(2), ...config }).success).toBe(false);
});
