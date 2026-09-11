import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store';
import { Arena } from '../../server/arena';
import { createApp } from '../../server/app';
import { loadConfig, type AppConfig } from '../../server/config';
import { heuristic, agentInput, parseObject, callModel } from '../../server/agents';
import { agents } from '../helpers';

const dirs: string[] = [],
  arenas: Arena[] = [],
  servers: Server[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'sgs-test-'));
  dirs.push(d);
  return d;
};
const setup = (extra: Partial<AppConfig> = {}) => {
  const config: AppConfig = {
    dataDir: temp(),
    providers: [],
    port: 0,
    host: '127.0.0.1',
    adminToken: '',
    ...extra,
  };
  const arena = new Arena(new Store(config.dataDir), config);
  arenas.push(arena);
  return { arena, store: arena.store, app: createApp(arena), config };
};
afterEach(async () => {
  for (const arena of arenas.splice(0)) await arena.close();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const request = (
  app: ReturnType<typeof createApp>,
  path: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function mockProvider(
  mode: 'normal' | 'invalid' | 'http-error' | 'slow' | 'decline' = 'normal',
) {
  let calls = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    calls++;
    if (mode === 'http-error') {
      res.writeHead(503).end('Unavailable');
      return;
    }
    if (mode === 'slow') {
      await new Promise((r) => setTimeout(r, 150));
      if (res.destroyed) return;
    }
    const body = JSON.parse(raw),
      input = JSON.parse(body.messages[1].content),
      isReflection = body.messages[0].content.includes('返回 JSON：{"shouldRemember"');
    const content =
      mode === 'invalid'
        ? { actionId: 'invented', reason: 'invalid' }
        : isReflection
          ? {
              shouldRemember: mode !== 'decline',
              memory:
                mode === 'decline'
                  ? ''
                  : `${input.observation.gameId} ${input.observation.players[input.observation.viewer].agentId} 的经验：保留闪和桃，判断身份需结合多次行为。`,
              reason: '测试复盘',
            }
          : heuristic(input);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        model: body.model,
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as any;
  return {
    provider: {
      id: 'default',
      name: 'Test API',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      apiKey: 'test-private-key',
      models: ['test-model', 'second-model'],
    },
    calls: () => calls,
  };
}
describe('配置、HTTP API 与安全边界', () => {
  it('兼容已有 YAML 和标准 dotenv，不修改原文件', () => {
    const dir = temp(),
      file = join(dir, '.env');
    writeFileSync(
      file,
      'base_url: https://example.invalid/v1\napi_key_env: private-literal\nmodels:\n - model-a\n - model-b\n',
    );
    const c = loadConfig(file, {});
    expect(c.providers[0].apiKey).toBe('private-literal');
    expect(c.providers[0].models).toEqual(['model-a', 'model-b']);
    writeFileSync(
      file,
      'API_BASE_URL=https://example.invalid/v1\nAPI_KEY=dotenv-key\nAPI_MODELS=a,b\n',
    );
    expect(loadConfig(file, {}).providers[0].apiKey).toBe('dotenv-key');
  });
  it('多个 provider 从环境变量引用密钥，前端不返回密钥', async () => {
    const file = join(temp(), '.env');
    writeFileSync(file, '');
    const multi = loadConfig(file, {
      API_BASE_URL: 'https://one.example/v1',
      API_KEY: 'private-one',
      API_MODELS: 'one',
      PROVIDERS_JSON: JSON.stringify([
        {
          id: 'other',
          name: 'Other',
          baseUrl: 'https://two.example/v1',
          apiKeyEnv: 'SECOND_KEY',
          models: ['two'],
        },
      ]),
      SECOND_KEY: 'private-two',
    });
    expect(multi.providers.map((p) => p.apiKey)).toEqual(['private-one', 'private-two']);
    const p = await mockProvider();
    const { app } = setup({ providers: [p.provider] });
    const res = await request(app, '/config');
    const text = await res.text();
    expect(text).not.toContain('test-private-key');
    expect(text).not.toContain('baseUrl');
    expect(text).toContain('test-model');
  });
  it('拒绝人数、重复 Agent ID、未知模型、过大参数', async () => {
    const { app } = setup();
    for (const body of [
      { agents: agents(1) },
      { agents: [agents()[0], agents()[0]] },
      { agents: agents(9) },
      { agents: agents(2), games: 101 },
      { agents: agents(2), paceMs: -1 },
      { agents: agents(2, 'llm') },
    ]) {
      const r = await request(app, '/matches', 'POST', body);
      expect(r.status).toBe(400);
    }
  });
  it('管理令牌、跨站控制保护', async () => {
    const { app } = setup({ adminToken: 'secret-admin' });
    expect((await request(app, '/matches', 'POST', { agents: agents(2) })).status).toBe(401);
    expect(
      (
        await request(
          app,
          '/matches',
          'POST',
          { agents: agents(2), autoStart: false },
          { Authorization: 'Bearer secret-admin' },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          app,
          '/memories',
          'POST',
          { agentId: 'a', text: 't' },
          { Authorization: 'Bearer secret-admin', Origin: 'http://evil.example' },
        )
      ).status,
    ).toBe(403);
  });
  it('玩家独立令牌、私有视角、过期动作校验', async () => {
    const { app, arena, store } = setup();
    const aa = agents(2, 'external');
    const match = arena.create({ agents: aa, autoStart: false });
    const game = arena.current(match.id)!;
    const token = match.agentTokens[aa[0].id];
    expect((await request(app, `/agent/${game.id}/${aa[0].id}`)).status).toBe(401);
    const res = await request(app, `/agent/${game.id}/${aa[0].id}`, 'GET', undefined, {
      Authorization: `Bearer ${token}`,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.observation.players[1].hand).toBeUndefined();
    expect(body.observation.players[0].hand.length).toBeGreaterThan(0);
    const action = heuristic(body);
    expect(
      (
        await request(
          app,
          `/agent/${game.id}/${aa[0].id}/actions`,
          'POST',
          { ...action, revision: -1 },
          { Authorization: `Bearer ${token}` },
        )
      ).status,
    ).toBe(400);
    const accepted = await request(
      app,
      `/agent/${game.id}/${aa[0].id}/actions`,
      'POST',
      { ...action, revision: body.observation.revision },
      { Authorization: `Bearer ${token}` },
    );
    expect(accepted.status).toBe(200);
    expect(store.decisionCount(game.id)).toBe(1);
  });
  it('外部座位等待而非被系统替代，并可恢复运行', async () => {
    const { arena, store } = setup();
    const aa = agents(2, 'external');
    const m = arena.create({ agents: aa, paceMs: 0 });
    await arena.workers.get(m.id);
    expect(store.match(m.id).status).toBe('waiting');
    const game = arena.current(m.id)!;
    const ctx = arena.context(game.id, 0);
    await arena.externalAction(game.id, aa[0].id, {
      ...heuristic(ctx),
      revision: ctx.observation.revision,
    });
    await arena.workers.get(m.id);
    expect(store.decisionCount(game.id)).toBeGreaterThanOrEqual(1);
    expect(store.match(m.id).status).toBe('waiting');
  });
});
describe('历史存档、恢复与文本记忆', () => {
  it('两局完整运行，记录每一帧并轮换座位', async () => {
    const { arena, store, app } = setup();
    const m = arena.create({ agents: agents(3), games: 2, paceMs: 0, seed: 20 });
    await arena.workers.get(m.id);
    expect(store.match(m.id).status).toBe('finished');
    const games = store.games(m.id);
    expect(games).toHaveLength(2);
    expect(store.game(games[0].id).state.players[0].agentId).toBe('agent-1');
    expect(store.game(games[1].id).state.players[0].agentId).toBe('agent-2');
    for (const game of games) {
      const events = store.allEvents(game.id);
      expect(events).toHaveLength(game.revision);
      for (const event of events) {
        const frame = store.frame(game.id, event.seq)!;
        expect(frame.revision).toBe(event.seq);
        expect(frame.id).toBe(game.id);
      }
      const exported = await (await request(app, `/games/${game.id}/export`)).json();
      expect(exported.events.length).toBe(game.revision);
      expect(exported.decisions.length).toBeGreaterThan(10);
      expect(exported.game.state.status).toBe('finished');
    }
    expect((await request(app, `/games/${games[0].id}?seq=1`)).status).toBe(200);
  }, 30000);
  it('重启恢复已暂停状态，可以继续同一局而不重开', async () => {
    const s = setup();
    const m = s.arena.create({ agents: agents(2), autoStart: false, paceMs: 0 });
    await s.arena.step(m.id);
    const g = s.arena.current(m.id)!,
      revision = s.store.game(g.id).state.revision;
    await s.arena.close();
    arenas.splice(arenas.indexOf(s.arena), 1);
    const arena = new Arena(new Store(s.config.dataDir), s.config);
    arenas.push(arena);
    expect(arena.engine(g.id).s.revision).toBe(revision);
    expect(arena.store.match(m.id).status).toBe('paused');
    arena.resume(m.id);
    await arena.workers.get(m.id);
    expect(arena.store.match(m.id).status).toBe('finished');
    expect(arena.store.games(m.id)).toHaveLength(1);
  });
  it('导入和导出按 Agent 隔离，非法批量导入不产生部分写入', async () => {
    const { app, store } = setup();
    expect(
      (
        await request(app, '/memories/import', 'POST', {
          memories: [
            { agentId: 'one', text: '保留桃' },
            { agentId: 'two', text: '慎重使用无懈' },
          ],
        })
      ).status,
    ).toBe(201);
    expect(store.memory('one')).toHaveLength(1);
    const data = await (await request(app, '/memories/export?agentId=one')).json();
    expect(data.memories).toHaveLength(1);
    expect(
      (
        await request(app, '/memories/import', 'POST', [
          { agentId: 'one', text: 'valid' },
          { agentId: '../../bad', text: 'bad' },
        ])
      ).status,
    ).toBe(400);
    expect(store.memory()).toHaveLength(2);
    await request(app, `/memories/${data.memories[0].id}`, 'DELETE');
    expect(store.memory('one')).toHaveLength(0);
  });
  it('上下文裁剪有明确信息，记忆只取该 Agent 且有总长度上限', () => {
    const { arena, store } = setup();
    const m = arena.create({ agents: agents(2), autoStart: false });
    store.addMemory('agent-1', '自己的经验');
    store.addMemory('agent-2', '另一名玩家的私有经验');
    const game = arena.current(m.id)!;
    const ctx = arena.context(game.id, 0);
    expect(ctx.memory.map((m) => m.text)).toEqual(['自己的经验']);
    expect(JSON.stringify(ctx)).not.toContain('另一名玩家的私有经验');
    expect(ctx.historyInfo.total).toBe(ctx.history.length);
  });
});
describe('模型协议、异常和 RSI', () => {
  it('不同座位可调用不同 API 服务', async () => {
    const first = await mockProvider(),
      second = await mockProvider();
    second.provider.id = 'second';
    const { arena, store } = setup({ providers: [first.provider, second.provider] });
    const aa = agents(2, 'llm');
    aa[1].provider = 'second';
    const m = arena.create({ agents: aa, paceMs: 0, seed: 9 });
    await arena.workers.get(m.id);
    expect(store.match(m.id).status).toBe('finished');
    expect(first.calls()).toBeGreaterThan(0);
    expect(second.calls()).toBeGreaterThan(0);
  });
  it('模型自主选择没有经验时不强制写记忆', async () => {
    const p = await mockProvider('decline');
    const { arena, store } = setup({ providers: [p.provider] });
    const aa = agents(2, 'llm');
    aa[0].rsi = 'immediate';
    const m = arena.create({ agents: aa, autoStart: false });
    await arena.step(m.id);
    const g = arena.current(m.id)!;
    expect(
      store
        .calls(g.id)
        .some((c) => c.kind === 'rsi-immediate' && c.reflection.shouldRemember === false),
    ).toBe(true);
    expect(store.memory()).toHaveLength(0);
  });
  it('取消后的即时反思会在继续前补齐，且不会重复总结', async () => {
    const p = await mockProvider();
    const { arena, store } = setup({ providers: [p.provider] });
    const aa = agents(2, 'llm');
    aa[0].rsi = 'immediate';
    const m = arena.create({ agents: aa, autoStart: false });
    const g = arena.current(m.id)!,
      e = arena.engine(g.id);
    const input = arena.context(g.id, 0),
      decision = heuristic(input),
      revision = e.s.revision;
    e.apply(decision.actionId, e.s.revision, decision.cardIds);
    store.checkpoint(e.s);
    store.decision(g.id, 0, revision, {
      agentId: aa[0].id,
      decision,
      afterRevision: e.s.revision,
      needsImmediateRsi: true,
    });
    expect(store.memory()).toHaveLength(0);
    await arena.recoverImmediate(m.id, e, new AbortController().signal);
    expect(store.memory(aa[0].id)).toHaveLength(1);
    const count = p.calls();
    await arena.recoverImmediate(m.id, e, new AbortController().signal);
    expect(p.calls()).toBe(count);
  });
  it('API 超时可中止连接', async () => {
    const p = await mockProvider('slow');
    await expect(
      callModel(
        p.provider,
        'test-model',
        [
          { role: 'system', content: 'test' },
          { role: 'user', content: '{}' },
        ],
        20,
      ),
    ).rejects.toThrow();
  });
  it('解析 JSON 代码块与前后解释', () => {
    expect(parseObject('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseObject('Result: {"ok":true}')).toEqual({ ok: true });
    expect(() => parseObject('not json')).toThrow();
  });
  it('真实HTTP模型协议驱动两局，即时与轮次 RSI 入档并在下一局复用', async () => {
    const p = await mockProvider();
    const { arena, store } = setup({ providers: [p.provider] });
    const aa = agents(2, 'llm');
    aa[0].rsi = 'both';
    aa[1].rsi = 'round';
    aa[1].model = 'second-model';
    const m = arena.create({ agents: aa, games: 2, paceMs: 0, seed: 9 });
    await arena.workers.get(m.id);
    expect(store.match(m.id).status).toBe('finished');
    const games = store.games(m.id);
    expect(games).toHaveLength(2);
    const calls = games.flatMap((g) => store.calls(g.id));
    expect(calls.some((c) => c.kind === 'rsi-immediate')).toBe(true);
    expect(calls.filter((c) => c.kind === 'rsi-round')).toHaveLength(4);
    expect(calls.some((c) => c.model === 'second-model')).toBe(true);
    expect(calls.some((c) => c.kind.endsWith('error'))).toBe(false);
    const decisions = store.decisions(games[1].id);
    expect(decisions.some((d) => d.input.memory.some((mm: any) => mm.gameId === games[0].id))).toBe(
      true,
    );
    for (const g of games)
      for (const d of store.decisions(g.id))
        expect(d.input.memory.every((m: any) => m.agentId === d.agentId)).toBe(true);
    expect(store.memory().some((m) => m.mode === 'immediate')).toBe(true);
    expect(store.memory().some((m) => m.mode === 'round')).toBe(true);
    expect(p.calls()).toBeGreaterThan(10);
  }, 30000);
  it.each(['invalid', 'http-error'] as const)(
    '%s 重试一次后透明回退，不执行非法动作',
    async (mode) => {
      const p = await mockProvider(mode);
      const { arena, store } = setup({ providers: [p.provider] });
      const m = arena.create({ agents: agents(2, 'llm'), autoStart: false });
      await arena.step(m.id);
      const g = arena.current(m.id)!;
      const d = store.decisions(g.id)[0];
      expect(d.fallback).toBeTruthy();
      expect(p.calls()).toBe(2);
      expect(store.calls(g.id).some((c) => c.kind === 'decision-error')).toBe(true);
      expect(arena.engine(g.id).s.status).toBe('playing');
    },
  );
  it('暂停取消正在进行的 API 请求，不提交迟到的决策', async () => {
    const p = await mockProvider('slow');
    const { arena, store } = setup({ providers: [p.provider] });
    const m = arena.create({ agents: agents(2, 'llm'), paceMs: 0 });
    await new Promise((r) => setTimeout(r, 25));
    await arena.pause(m.id);
    const g = arena.current(m.id)!;
    expect(store.match(m.id).status).toBe('paused');
    expect(store.decisionCount(g.id)).toBe(0);
    expect(arena.thinking.size).toBe(0);
  });
  it('关闭 RSI 不触发额外总结请求', async () => {
    const p = await mockProvider();
    const { arena, store } = setup({ providers: [p.provider] });
    const m = arena.create({ agents: agents(2, 'llm'), autoStart: false });
    await arena.step(m.id);
    const g = arena.current(m.id)!;
    expect(store.calls(g.id).map((c) => c.kind)).toEqual(['decision']);
    expect(store.memory()).toHaveLength(0);
  });
});
