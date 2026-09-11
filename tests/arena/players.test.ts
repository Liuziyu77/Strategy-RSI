import { afterEach, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store';
import { Arena } from '../../server/arena';
import { createApp } from '../../server/app';
import { heuristic } from '../../server/agents';
import { Engine } from '../../src/engine';
import { agents } from '../helpers';

const arenas: Arena[] = [],
  dirs: string[] = [],
  servers: Server[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sgs-players-'));
  dirs.push(dir);
  const config = { dataDir: dir, providers: [], port: 0, host: '127.0.0.1', adminToken: '' };
  const arena = new Arena(new Store(dir), config);
  arenas.push(arena);
  return { arena, store: arena.store, app: createApp(arena), dir, config };
}
const request = (app: ReturnType<typeof createApp>, path: string, method = 'GET', body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const profile = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: id,
  hero: '张飞',
  kind: 'heuristic',
  rsi: 'off',
  ...extra,
});
afterEach(async () => {
  vi.useRealTimers();
  for (const a of arenas.splice(0)) await a.close();
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it('玩家可创建和修改，固定ID、参数校验和重复检查生效', async () => {
  const { app } = setup();
  const created = await request(
    app,
    '/players',
    'POST',
    profile('alice', { name: '观澜', description: '长期实验', color: '#e2ba73' }),
  );
  expect(created.status).toBe(201);
  expect((await created.json()).name).toBe('观澜');
  expect((await request(app, '/players', 'POST', profile('alice'))).status).toBe(400);
  expect((await request(app, '/players/alice', 'PUT', profile('bob'))).status).toBe(400);
  expect((await request(app, '/players/no-such', 'PUT', profile('no-such'))).status).toBe(400);
  expect((await request(app, '/players', 'POST', profile('bad', { color: 'red' }))).status).toBe(
    400,
  );
  const updated = await request(
    app,
    '/players/alice',
    'PUT',
    profile('alice', { name: '观澜二号', hero: '关羽' }),
  );
  expect(updated.status).toBe(200);
  const data = await (await request(app, '/players/alice')).json();
  expect(data).toMatchObject({
    name: '观澜二号',
    hero: '关羽',
    stats: { games: 0, memories: 0 },
    memories: [],
    history: [],
  });
});

it('从玩家库创建牌局时保存配置快照，改名不改历史并能跨局读取经验', async () => {
  const { app, arena, store } = setup();
  for (const id of ['alice', 'bob']) await request(app, '/players', 'POST', profile(id));
  await request(app, '/players/alice/memories', 'POST', { text: '保存独立经验' });
  const match = await (
    await request(app, '/matches', 'POST', {
      playerIds: ['alice', 'bob'],
      autoStart: false,
      games: 2,
      paceMs: 0,
      maxDecisions: 20,
    })
  ).json();
  await request(app, '/players/alice', 'PUT', profile('alice', { name: '后来改名', hero: '关羽' }));
  expect(store.match(match.id).config.agents[0].name).toBe('alice');
  expect(arena.context(arena.current(match.id).id, 0).memory[0].text).toBe('保存独立经验');
  arena.resume(match.id);
  await arena.workers.get(match.id);
  const detail = await (await request(app, '/players/alice')).json();
  expect(detail.stats.games).toBe(2);
  expect(detail.history).toHaveLength(2);
  expect(detail.history.every((g: any) => g.name === 'alice' && g.hero === '张飞')).toBe(true);
  expect(detail.history.map((g: any) => g.seat).sort()).toEqual([0, 1]);
  for (const history of detail.history) {
    const state = store.game(history.gameId).state;
    expect(history).toMatchObject({
      round: state.round,
      turn: state.turn,
      playerCount: 2,
      decisionCount: store.decisionCount(history.gameId),
    });
  }
  const later = await (
    await request(app, '/matches', 'POST', { playerIds: ['alice', 'bob'], autoStart: false })
  ).json();
  expect(later.config.agents[0]).toMatchObject({ name: '后来改名', hero: '关羽' });
  expect((await request(app, '/matches', 'POST', { playerIds: ['alice', 'alice'] })).status).toBe(
    400,
  );
  expect((await request(app, '/matches', 'POST', { playerIds: ['alice', 'unknown'] })).status).toBe(
    400,
  );
});

it('历史时长从首末游戏事件计算，旧牌局无需新增时间字段且赛后RSI不延长时长', async () => {
  const { app, arena, store } = setup();
  const match = arena.create({ agents: agents(2), autoStart: false });
  await arena.step(match.id);
  await arena.step(match.id);
  const gameId = arena.current(match.id).id,
    engine = arena.engine(gameId);
  const startedAt = '2026-09-09T01:00:00.000Z',
    endedAt = '2026-09-09T02:02:03.000Z';
  store.db.prepare("UPDATE games SET created_at='2026-09-08T00:00:00.000Z' WHERE id=?").run(gameId);
  store.db
    .prepare("UPDATE events SET event=json_set(event,'$.time',?) WHERE game_id=?")
    .run(startedAt, gameId);
  engine.finish('反贼', '验证存档时长');
  store.checkpoint(engine.s);
  store.db
    .prepare("UPDATE events SET event=json_set(event,'$.time',?) WHERE game_id=? AND seq=?")
    .run(endedAt, gameId, engine.s.revision);
  store.call(gameId, agents(2)[0].id, 'rsi-round', { reflection: { shouldRemember: false } });
  const detail = await (await request(app, `/players/${agents(2)[0].id}`)).json();
  expect(detail.history[0]).toMatchObject({
    startedAt,
    endedAt,
    lastEventAt: endedAt,
    durationMs: 3723000,
    round: engine.s.round,
    turn: engine.s.turn,
    decisionCount: 2,
    playerCount: 2,
  });
  expect(store.players().find((p) => p.id === agents(2)[1].id)?.stats).toMatchObject({
    games: 1,
    finished: 1,
    wins: 1,
  });
  expect(store.players().find((p) => p.id === agents(2)[0].id)?.stats.wins).toBe(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
  expect(store.playerHistory(agents(2)[0].id)[0].durationMs).toBe(3723000);
});

it('暂停或停止的牌局以最近游戏事件为截止，未结束牌局不伪造结束时间', async () => {
  const { arena, store } = setup();
  const match = arena.create({ agents: agents(2), autoStart: false });
  const gameId = arena.current(match.id).id;
  store.db
    .prepare(
      "UPDATE events SET event=json_set(event,'$.time','2026-09-09T01:00:00.000Z') WHERE game_id=?",
    )
    .run(gameId);
  store.db
    .prepare(
      "UPDATE events SET event=json_set(event,'$.time','2026-09-09T01:04:05.000Z') WHERE game_id=? AND seq=?",
    )
    .run(gameId, arena.engine(gameId).s.revision);
  for (const status of ['paused', 'stopped']) {
    store.setStatus(match.id, status);
    const history = store.playerHistory(agents(2)[0].id)[0];
    expect(history).toMatchObject({
      status: 'playing',
      matchStatus: status,
      endedAt: null,
      durationMs: 245000,
      decisionCount: 0,
    });
  }
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
  expect(store.playerHistory(agents(2)[0].id)[0].durationMs).toBe(245000);
});

it('按对战ID聚合胜率，同名对战分开，全部胜率按局数加权且排除未结束局', async () => {
  const { arena, store, app } = setup();
  const first = arena.create({
    name: '同名对战',
    agents: agents(2),
    games: 3,
    autoStart: false,
    roleMode: 'fixed',
    roleAssignments: { 'agent-1': '主公', 'agent-2': '反贼' },
  });
  const firstGameId = arena.current(first.id).id;
  for (const [i, winner] of ['主忠', '反贼', '平局'].entries()) {
    const e = i === 0 ? arena.engine(firstGameId) : arena.newGame(first.id, first.config, i + 1);
    e.finish(winner, '统计验证');
    store.checkpoint(e.s);
  }
  store.setStatus(first.id, 'finished');
  const second = arena.create({ ...first.config, games: 5 });
  const secondGameId = arena.current(second.id).id;
  for (let i = 0; i < 3; i++) {
    const e = i === 0 ? arena.engine(secondGameId) : arena.newGame(second.id, second.config, i + 1);
    if (i < 2) {
      e.finish('主忠', '统计验证');
      store.checkpoint(e.s);
    }
  }
  const detail = await (await request(app, '/players/agent-1')).json();
  expect(detail.stats).toMatchObject({
    matches: 2,
    games: 6,
    finished: 5,
    wins: 3,
    losses: 1,
    draws: 1,
    winRate: 0.6,
  });
  expect(detail.matchHistory).toHaveLength(2);
  expect(detail.matchHistory.find((m: any) => m.matchId === first.id)).toMatchObject({
    matchName: '同名对战',
    plannedGames: 3,
    stats: { games: 3, finished: 3, wins: 1, losses: 1, draws: 1, winRate: 1 / 3 },
  });
  expect(detail.matchHistory.find((m: any) => m.matchId === second.id)).toMatchObject({
    matchName: '同名对战',
    plannedGames: 5,
    stats: { games: 3, finished: 2, wins: 2, losses: 0, draws: 0, winRate: 1 },
  });
  expect(detail.history).toHaveLength(6);
  await request(app, '/players', 'POST', profile('no-games'));
  const empty = await (await request(app, '/players/no-games')).json();
  expect(empty.stats.winRate).toBeNull();
  expect(empty.matchHistory).toEqual([]);
});

it('个人经验导入明确绑定当前玩家，拒绝跨玩家删除且无效批次不部分写入', async () => {
  const { app, store } = setup();
  for (const id of ['alice', 'bob']) await request(app, '/players', 'POST', profile(id));
  const own = await (
    await request(app, '/players/alice/memories', 'POST', { text: '甲的经验' })
  ).json();
  expect((await request(app, `/players/bob/memories/${own.id}`, 'DELETE')).status).toBe(404);
  await request(app, '/players/bob/memories/import', 'POST', {
    memories: [{ agentId: 'alice', text: '从甲导入到乙' }],
  });
  expect(store.memory('alice').map((m) => m.text)).toEqual(['甲的经验']);
  expect(store.memory('bob').map((m) => m.text)).toEqual(['从甲导入到乙']);
  expect(
    (await request(app, '/players/bob/memories/import', 'POST', [{ text: '有效' }, { text: '' }]))
      .status,
  ).toBe(400);
  expect(store.memory('bob')).toHaveLength(1);
  expect((await request(app, '/players/unknown/memories', 'POST', { text: 'x' })).status).toBe(404);
});

it('旧比赛及孤立经验自动迁移到玩家库，重启不覆盖后来编辑的资料', async () => {
  const { arena, store, dir, config } = setup();
  const match = arena.create({ agents: agents(2), autoStart: false });
  store.addMemory('only-memory', '旧档案经验');
  store.db.exec('DELETE FROM player_profiles; DELETE FROM game_players;');
  await arena.close();
  arenas.splice(arenas.indexOf(arena), 1);
  const reloaded = new Arena(new Store(dir), config);
  arenas.push(reloaded);
  expect(reloaded.store.players()).toHaveLength(3);
  expect(reloaded.store.playerHistory(agents(2)[0].id)[0].matchId).toBe(match.id);
  expect(reloaded.store.player('only-memory')).not.toBeNull();
  const app = createApp(reloaded),
    id = agents(2)[0].id;
  await request(app, `/players/${id}`, 'PUT', profile(id, { name: '已编辑' }));
  await reloaded.close();
  arenas.splice(arenas.indexOf(reloaded), 1);
  const third = new Arena(new Store(dir), config);
  arenas.push(third);
  expect(third.store.player(id)?.name).toBe('已编辑');
  expect(third.store.playerHistory(id)).toHaveLength(1);
});

it('专属API版本独立保存，更新密钥不影响已建牌局；决策和RSI调用正确的连接', async () => {
  const calls: { key: string | undefined; model: string; reflection: boolean }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw),
      input = JSON.parse(body.messages[1].content),
      reflection = body.messages[0].content.includes('返回 JSON：{"shouldRemember"');
    calls.push({ key: req.headers.authorization, model: body.model, reflection });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify(
                reflection
                  ? {
                      shouldRemember: true,
                      memory: `${input.observation.gameId} 独立经验`,
                      reason: '复盘',
                    }
                  : heuristic(input),
              ),
            },
          },
        ],
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}/v1`;
  const { app, arena, store, config, dir } = setup();
  for (const id of ['alice', 'bob'])
    expect(
      (
        await request(
          app,
          '/players',
          'POST',
          profile(id, {
            kind: 'llm',
            rsi: id === 'alice' ? 'both' : 'round',
            apiMode: 'custom',
            baseUrl,
            apiKey: `original-${id}-secret`,
            model: `model-${id}`,
          }),
        )
      ).status,
    ).toBe(201);
  const m = arena.create({
    playerIds: ['alice', 'bob'],
    autoStart: false,
    maxDecisions: 20,
    paceMs: 0,
    games: 2,
  });
  const oldProvider = m.config.agents[0].provider;
  await request(
    app,
    '/players/alice',
    'PUT',
    profile('alice', {
      kind: 'llm',
      rsi: 'both',
      apiMode: 'custom',
      baseUrl,
      apiKey: 'updated-alice-secret',
      model: 'new-model',
    }),
  );
  const update = await (
    await request(
      app,
      '/players/alice',
      'PUT',
      profile('alice', {
        kind: 'llm',
        rsi: 'both',
        apiMode: 'custom',
        baseUrl,
        apiKey: '',
        model: 'new-model',
      }),
    )
  ).json();
  expect(store.playerProvider(update.provider)?.apiKey).toBe('updated-alice-secret');
  expect(store.playerProvider(oldProvider)?.apiKey).toBe('original-alice-secret');
  // Exercise persisted credential lookup after a process-style restart.
  await arena.close();
  arenas.splice(arenas.indexOf(arena), 1);
  const restarted = new Arena(new Store(dir), config);
  arenas.push(restarted);
  restarted.resume(m.id);
  await restarted.workers.get(m.id);
  expect(restarted.store.match(m.id).status).toBe('finished');
  expect(
    calls.some((c) => c.key === 'Bearer original-alice-secret' && c.model === 'model-alice'),
  ).toBe(true);
  expect(calls.some((c) => c.key === 'Bearer original-bob-secret' && c.model === 'model-bob')).toBe(
    true,
  );
  expect(calls.some((c) => c.key === 'Bearer updated-alice-secret')).toBe(false);
  expect(calls.some((c) => c.reflection)).toBe(true);
  const game = restarted.store.games(m.id)[1];
  expect(restarted.store.decisions(game.id).some((d) => d.input.memory.length)).toBe(true);
  const finalApp = createApp(restarted);
  for (const path of ['/players', '/players/alice', '/matches', `/games/${game.id}/export`]) {
    const raw = await (await request(finalApp, path)).text();
    expect(raw).not.toContain('original-alice-secret');
    expect(raw).not.toContain('updated-alice-secret');
    expect(raw).not.toContain('original-bob-secret');
  }
});

it('自定义API不接受带密码或查询密钥的地址，缺少连接信息不会创建残缺玩家', async () => {
  const { app, store } = setup();
  for (const baseUrl of [
    'file:///tmp/file',
    'https://user:password@example.com/v1',
    'https://example.com/v1?key=hidden',
    'not-a-url',
  ])
    expect(
      (
        await request(
          app,
          '/players',
          'POST',
          profile('alice', { apiMode: 'custom', baseUrl, apiKey: 'secret', model: 'x' }),
        )
      ).status,
    ).toBe(400);
  expect(
    (
      await request(
        app,
        '/players',
        'POST',
        profile('alice', { apiMode: 'custom', baseUrl: 'https://example.com/v1', model: 'x' }),
      )
    ).status,
  ).toBe(400);
  expect(store.players()).toHaveLength(0);
});

it('出牌视觉事件只包含已公开打出的牌，跳过与隐藏手牌选择不产生卡牌动画', () => {
  const e = new Engine('effects', agents(4), 42);
  e.start();
  let visuals = 0,
    quiet = 0;
  for (let i = 0; i < 200 && e.s.status === 'playing'; i++) {
    const input = {
      observation: e.view(e.actor),
      history: e.visibleHistory(e.actor),
      historyInfo: { total: 0, included: 0, omitted: 0 },
      memory: [],
      memoryInfo: { total: 0, included: 0 },
    };
    const decision = heuristic(input),
      action = e.legalActions().find((a) => a.id === decision.actionId)!;
    const count = e.events.length;
    e.apply(decision.actionId, e.s.revision, decision.cardIds);
    const event = e.events.slice(count).find((event) => event.type === 'action')!;
    if (
      ['slash', 'trick', 'equip', 'delay', 'peach', 'respond', 'counter', 'save'].includes(
        action.kind,
      ) &&
      action.cards?.length
    ) {
      visuals++;
      const visual = event.data?.visual as any;
      expect(visual.cards.map((c: any) => c.id)).toEqual(action.cards);
      expect(visual.cards.every((c: any) => c.name && c.suit && c.rank)).toBe(true);
    } else {
      quiet++;
      expect(event.data?.visual).toBeUndefined();
    }
  }
  expect(visuals).toBeGreaterThan(10);
  expect(quiet).toBeGreaterThan(10);
});
