import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Arena } from '../../server/arena';
import { Store } from '../../server/store';
import { createApp } from '../../server/app';
import { consolidationPolicy } from '../../server/consolidation';
import { agents } from '../helpers';

const arenas: Arena[] = [],
  dirs: string[] = [];
function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'sgs-consolidation-'));
  dirs.push(dataDir);
  const config = {
    dataDir,
    port: 0,
    host: '127.0.0.1',
    adminToken: '',
    providers: [
      {
        id: 'default',
        name: 'Test',
        apiKey: 'test-key',
        baseUrl: 'http://default.invalid/v1',
        models: ['test-model'],
      },
    ],
  };
  const arena = new Arena(new Store(dataDir), config);
  arenas.push(arena);
  const match = arena.create({ agents: agents(2, 'llm'), autoStart: false, games: 2 });
  return {
    arena,
    store: arena.store,
    match,
    gameId: arena.current(match.id).id,
    app: createApp(arena),
    config,
  };
}
const output = (
  content = {
    immediate: '保留防御牌，结合已知信息选择响应。',
    round: '跨局归纳身份判断，避免把猜测记作事实。',
    shared: '根据收益与风险取舍。',
  },
) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }));
const request = (app: ReturnType<typeof createApp>, agentId: string, matchId: string) =>
  app.request(`/api/players/${agentId}/memories/consolidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchId }),
  });
afterEach(async () => {
  for (const a of arenas.splice(0)) await a.close();
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it('归纳使用玩家当前专属API，分开即时与轮次，保存来源原文并让后续决策使用摘要', async () => {
  const { arena, store, match, gameId, app } = setup();
  store.savePlayerProvider({
    id: 'personal',
    name: 'Private',
    apiKey: 'personal-secret',
    baseUrl: 'http://personal.invalid/v1',
    models: ['personal-model'],
  });
  store.savePlayer({ ...store.player('agent-1')!, provider: 'personal', model: 'personal-model' });
  const first = store.addMemory('agent-1', '保留闪', 'immediate', gameId),
    second = store.addMemory('agent-1', '综合多轮行动判断身份', 'round', gameId);
  store.addMemory('agent-2', '另一位玩家的私有经验', 'round', gameId);
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(String(url)).toBe('http://personal.invalid/v1/chat/completions');
    expect((init?.headers as any).Authorization).toBe('Bearer personal-secret');
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('personal-model');
    expect(String(init?.body)).not.toContain('另一位玩家');
    expect(body.messages[1].content).toContain('immediate');
    expect(body.messages[1].content).toContain('round');
    return output();
  });
  const response = await request(app, 'agent-1', match.id);
  expect(response.status).toBe(202);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy).toHaveBeenCalledTimes(1);
  const memories = store.memory('agent-1'),
    summary = memories.find((m) => m.mode === 'consolidated')!;
  expect(memories).toHaveLength(3);
  expect(summary.matchId).toBe(match.id);
  expect(summary.gameId).toBeNull();
  expect(summary.sourceIds).toEqual([first.id, second.id]);
  expect(summary.text).toContain('即时 RSI 归纳');
  expect(summary.text).toContain('轮次 RSI 归纳');
  expect(memories.filter((m) => m.mode !== 'consolidated').every((m) => m.active === false)).toBe(
    true,
  );
  expect(store.activeMemory('agent-1').map((m) => m.id)).toEqual([summary.id]);
  expect(arena.context(gameId, 0).memory.map((m) => m.id)).toEqual([summary.id]);
  expect(arena.context(gameId, 0).memory[0].sourceIds).toBeUndefined();
  const detail = await (await app.request('/api/players/agent-1')).json();
  expect(detail.consolidations[0].status).toBe('completed');
  expect(JSON.stringify(detail)).not.toContain('personal-secret');
  store.deleteMemory(summary.id);
  expect(store.activeMemory('agent-1').map((m) => m.id)).toEqual([first.id, second.id]);
});

it('大量经验分批再合并，全部输入被覆盖，没有截掉后面的牌局经验', async () => {
  const { arena, store, match, gameId } = setup();
  const texts = Array.from(
    { length: 20 },
    (_, i) => `经验编号${i}：${'观察局势而不臆测身份。'.repeat(270)}`,
  );
  for (const [i, text] of texts.entries())
    store.addMemory('agent-1', text, i % 2 ? 'round' : 'immediate', gameId);
  const inputs: string[] = [];
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const content = JSON.parse(String(init?.body)).messages[1].content;
    const entries = JSON.parse(content).experience;
    expect(
      entries.reduce((total: number, entry: unknown) => total + JSON.stringify(entry).length, 0),
    ).toBeLessThanOrEqual(8000);
    inputs.push(content);
    return output();
  });
  const job = arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy.mock.calls.length).toBeGreaterThan(2);
  for (const text of texts) expect(inputs.some((input) => input.includes(text))).toBe(true);
  expect(inputs.at(-1)).toContain('合并本轮所有分块摘要');
  expect(store.consolidations('agent-1')[0]).toMatchObject({ id: job.id, status: 'completed' });
  expect(store.memory('agent-1').find((m) => m.mode === 'consolidated')!.sourceIds).toHaveLength(
    20,
  );
});

it('重复点击共享同一任务，归纳中新增的RSI独立保留且立即可用于后续决策', async () => {
  const { arena, store, match, gameId } = setup();
  const original = store.addMemory('agent-1', '原始经验', 'immediate', gameId);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    await gate;
    return output();
  });
  const first = arena.consolidator.start('agent-1', match.id),
    second = arena.consolidator.start('agent-1', match.id);
  expect(first.id).toBe(second.id);
  const fresh = store.addMemory('agent-1', '刚刚从并行局获得的新经验', 'round', gameId);
  release();
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy).toHaveBeenCalledTimes(1);
  const active = store.activeMemory('agent-1');
  expect(active.map((m) => m.id)).toContain(fresh.id);
  expect(active.map((m) => m.id)).not.toContain(original.id);
  expect(active.find((m) => m.mode === 'consolidated')!.sourceIds).toEqual([original.id]);
});

it.each(['http', 'invalid', 'deleted'])('%s 失败不产生半份归纳，不删除或覆盖原文', async (mode) => {
  const { arena, store, match, gameId } = setup();
  const original = store.addMemory('agent-1', '需要保留的原始经验', 'immediate', gameId);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (mode === 'http') return new Response('error', { status: 503 });
    if (mode === 'deleted') store.deleteMemory(original.id);
    return mode === 'invalid' ? output({ immediate: '', round: '', shared: '' }) : output();
  });
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(store.consolidations('agent-1')[0].status).toBe('error');
  expect(store.memory('agent-1').some((m) => m.mode === 'consolidated')).toBe(false);
  if (mode !== 'deleted') expect(store.activeMemory('agent-1')[0].text).toBe(original.text);
});

it('不同对战分别归纳，不读取另一场经验，历史版本可回退', async () => {
  const { arena, store, match, gameId } = setup();
  store.addMemory('agent-1', '第一场经验', 'immediate', gameId);
  const other = arena.create({ ...match.config, name: '另一场' });
  const separate = store.addMemory(
    'agent-1',
    '另一场经验不应进入当前归纳',
    'round',
    arena.current(other.id).id,
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    expect(String(init?.body)).not.toContain('另一场经验');
    return output();
  });
  for (let i = 0; i < 2; i++) {
    arena.consolidator.start('agent-1', match.id);
    await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  }
  const summaries = store.memory('agent-1').filter((m) => m.consolidationId);
  expect(summaries).toHaveLength(2);
  expect(summaries[0].active).toBe(false);
  expect(summaries[1].active).toBe(true);
  expect(store.activeMemory('agent-1').map((m) => m.id)).toContain(separate.id);
  store.deleteMemory(summaries[1].id);
  expect(store.activeMemory('agent-1').map((m) => m.id)).toContain(summaries[0].id);
});

it('无经验、未配置API及跨玩家请求不会调用模型', async () => {
  const { arena, store, match, gameId, app } = setup();
  store.addMemory('agent-1', '只属于玩家一', 'round', gameId);
  const spy = vi.spyOn(globalThis, 'fetch');
  expect((await request(app, 'agent-2', match.id)).status).toBe(400);
  store.savePlayer({ ...store.player('agent-1')!, model: 'not-configured' });
  expect(() => arena.consolidator.start('agent-1', match.id)).toThrow('配置');
  expect(spy).not.toHaveBeenCalled();
});

it('分块中途失败不保存局部摘要，所有原文继续生效', async () => {
  const { arena, store, match, gameId } = setup();
  for (let i = 0; i < 15; i++)
    store.addMemory(
      'agent-1',
      `${i}：${'保留事实，修正推测。'.repeat(300)}`,
      i % 2 ? 'round' : 'immediate',
      gameId,
    );
  let calls = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    ++calls === 1 ? output() : new Response('failure', { status: 503 }),
  );
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(store.consolidations('agent-1')[0]).toMatchObject({ status: 'error', completedCalls: 1 });
  expect(store.memory('agent-1')).toHaveLength(15);
  expect(store.activeMemory('agent-1')).toHaveLength(15);
});

it('关闭服务中断归纳，重启后可查看中断记录并重新归纳', async () => {
  const { arena, store, match, gameId, config } = setup();
  const original = store.addMemory('agent-1', '关机前的原始经验', 'round', gameId);
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(new Error('aborted'));
        else
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
      }),
  );
  arena.consolidator.start('agent-1', match.id);
  await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  await arena.close();
  arenas.splice(arenas.indexOf(arena), 1);
  spy.mockRestore();
  const restored = new Arena(new Store(config.dataDir), config);
  arenas.push(restored);
  expect(restored.store.consolidations('agent-1')[0].status).toBe('interrupted');
  expect(restored.store.activeMemory('agent-1').map((m) => m.id)).toEqual([original.id]);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => output());
  restored.consolidator.start('agent-1', match.id);
  await restored.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(restored.store.consolidations('agent-1')[0].status).toBe('completed');
});

it('归纳采用独立180秒超时，不沿用开局时的45秒决策超时', async () => {
  const { arena, store, match, gameId } = setup();
  expect(match.config.apiTimeoutMs).toBe(45000);
  store.addMemory('agent-1', '需要充分时间归纳的经验', 'round', gameId);
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => output());
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(timeout).toHaveBeenCalledWith(180000);
  expect(timeout).not.toHaveBeenCalledWith(45000);
  expect(store.consolidations('agent-1')[0]).toMatchObject({
    status: 'completed',
    timeoutMs: 180000,
  });
  expect(store.match(match.id).config.apiTimeoutMs).toBe(45000);
});

it.each(['timeout', 'network', 'rate-limit'])('%s 暂时失败只重试当前批次一次', async (failure) => {
  const { arena, store, match, gameId } = setup();
  arena.consolidator.policy = { ...consolidationPolicy, retryDelayMs: 1 };
  const original = store.addMemory('agent-1', '请求恢复后仍应保留的经验', 'round', gameId);
  let attempts = 0;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (++attempts > 1) return output();
    if (failure === 'rate-limit') return new Response('busy', { status: 429 });
    throw failure === 'timeout'
      ? new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      : new TypeError('fetch failed');
  });
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy).toHaveBeenCalledTimes(2);
  expect(store.consolidations('agent-1')[0]).toMatchObject({
    status: 'completed',
    completedCalls: 1,
    retryCount: 1,
  });
  expect(store.memory('agent-1').find((m) => m.consolidationId)!.sourceIds).toEqual([original.id]);
});

it('持续超时最多尝试两次，显示中文原因，随后可手动重试且原文保留', async () => {
  const { arena, store, match, gameId } = setup();
  arena.consolidator.policy = { ...consolidationPolicy, retryDelayMs: 1 };
  const original = store.addMemory('agent-1', '超时不丢失原始经验', 'immediate', gameId);
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy).toHaveBeenCalledTimes(2);
  const job = store.consolidations('agent-1')[0];
  expect(job).toMatchObject({ status: 'error', completedCalls: 0, retryCount: 1 });
  expect(job.error).toContain('180 秒');
  expect(job.error).toContain('原始经验保留');
  expect(store.consolidationCheckpoint('agent-1', match.id)!.calls).toHaveLength(2);
  expect(store.activeMemory('agent-1').map((m) => m.id)).toEqual([original.id]);
  spy.mockImplementation(async () => output());
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(store.consolidations('agent-1')[0]).toMatchObject({ status: 'completed', reusedCalls: 0 });
});

it('鉴权失败不自动重试', async () => {
  const { arena, store, match, gameId } = setup();
  store.addMemory('agent-1', '等待修正API的经验', 'round', gameId);
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response('denied', { status: 401 }));
  arena.consolidator.start('agent-1', match.id);
  await arena.consolidator.jobs.get(`agent-1:${match.id}`);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(store.consolidations('agent-1')[0]).toMatchObject({ status: 'error', retryCount: 0 });
});

it.each(['restart', 'source-changed', 'model-changed'])(
  '%s：重试复用匹配的成功批次，变更输入或模型则重新调用',
  async (change) => {
    const { arena, store, match, gameId, config } = setup();
    arena.consolidator.policy = { ...consolidationPolicy, retryDelayMs: 1 };
    const originals = Array.from({ length: 6 }, (_, i) =>
      store.addMemory(
        'agent-1',
        `批次来源${i}：${'保留经验。'.repeat(600)}`,
        i % 2 ? 'round' : 'immediate',
        gameId,
      ),
    );
    let requests = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (++requests === 1) return output();
      throw new DOMException('timeout', 'TimeoutError');
    });
    const previous = arena.consolidator.start('agent-1', match.id);
    await arena.consolidator.jobs.get(`agent-1:${match.id}`);
    expect(store.consolidations('agent-1')[0]).toMatchObject({
      status: 'error',
      completedCalls: 1,
    });
    expect(store.activeMemory('agent-1')).toHaveLength(6);
    expect(spy).toHaveBeenCalledTimes(3);
    let active = arena;
    if (change === 'restart') {
      await arena.close();
      arenas.splice(arenas.indexOf(arena), 1);
      active = new Arena(new Store(config.dataDir), config);
      arenas.push(active);
    } else if (change === 'source-changed') {
      store.db
        .prepare('UPDATE memories SET text=? WHERE id=?')
        .run('已修改的第一条经验', originals[0].id);
    } else {
      config.providers[0].models.push('another-model');
      store.savePlayer({ ...store.player('agent-1')!, model: 'another-model' });
    }
    const contents: string[] = [];
    spy.mockImplementation(async (_url, init) => {
      contents.push(JSON.parse(String(init?.body)).messages[1].content);
      return output();
    });
    const next = active.consolidator.start('agent-1', match.id);
    await active.consolidator.jobs.get(`agent-1:${match.id}`);
    const finished = active.store.consolidations('agent-1')[0];
    expect(finished.id).not.toBe(previous.id);
    expect(finished.id).toBe(next.id);
    expect(finished.status).toBe('completed');
    expect(finished.reusedCalls).toBe(change === 'restart' ? 1 : 0);
    expect(contents.some((text) => text.includes('批次来源1'))).toBe(change !== 'restart');
    expect(active.store.memory('agent-1').find((m) => m.consolidationId)!.sourceIds).toEqual(
      originals.map((m) => m.id),
    );
  },
);

it('重试等待期间关闭服务立即取消，不发出迟到重试', async () => {
  const { arena, store, match, gameId, config } = setup();
  arena.consolidator.policy = { ...consolidationPolicy, retryDelayMs: 60000 };
  store.addMemory('agent-1', '等待期间安全中断', 'round', gameId);
  const spy = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
  arena.consolidator.start('agent-1', match.id);
  await vi.waitFor(() => expect(store.consolidations('agent-1')[0].retryCount).toBe(1));
  await arena.close();
  arenas.splice(arenas.indexOf(arena), 1);
  expect(spy).toHaveBeenCalledTimes(1);
  const restored = new Arena(new Store(config.dataDir), config);
  arenas.push(restored);
  expect(restored.store.consolidations('agent-1')[0].status).toBe('interrupted');
});
