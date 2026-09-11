import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arena } from '../../server/arena';
import { Store } from '../../server/store';
import { createApp } from '../../server/app';
import { heuristic } from '../../server/agents';
import { MatchSchema } from '../../server/config';
import { agents, give } from '../helpers';

const arenas: Arena[] = [],
  dirs: string[] = [];
function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'sgs-parallel-'));
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
        apiKey: 'parallel-private-key',
        baseUrl: 'http://test.invalid/v1',
        models: ['test-model'],
      },
    ],
  };
  const arena = new Arena(new Store(dataDir), config);
  arenas.push(arena);
  return { arena, store: arena.store, config, app: createApp(arena) };
}
const config = (extra: Record<string, unknown> = {}) => ({
  agents: agents(2, 'llm').map((a) => ({ ...a, hero: '张飞', rsi: 'both' })),
  games: 4,
  concurrency: 2,
  paceMs: 0,
  maxDecisions: 20,
  autoStart: false,
  ...extra,
});
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new Error('aborted'));
    };
    const timer = setTimeout(done, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
function mock(delay = 2) {
  let active = 0,
    peak = 0;
  const gameActive = new Map<string, number>(),
    seen = new Set<string>();
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body)),
      input = JSON.parse(body.messages[1].content),
      id = input.observation.gameId;
    seen.add(id);
    active++;
    peak = Math.max(peak, active);
    gameActive.set(id, (gameActive.get(id) ?? 0) + 1);
    expect(gameActive.get(id)).toBe(1);
    try {
      await wait(delay, init?.signal as AbortSignal);
      const content = body.messages[0].content.includes('shouldRemember')
        ? { shouldRemember: true, memory: '保留闪和桃，依据当前局面判断身份。', reason: '共享策略' }
        : heuristic(input);
      return new Response(
        JSON.stringify({
          model: body.model,
          choices: [{ message: { content: JSON.stringify(content) } }],
        }),
      );
    } finally {
      active--;
      gameActive.set(id, gameActive.get(id)! - 1);
    }
  });
  return { spy, peak: () => peak, active: () => active, seen };
}
afterEach(async () => {
  for (const a of arenas.splice(0)) await a.close();
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it.each([1, 2, 3])(
  '并行上限 %i 生效，每局顺序决策、共用玩家经验且完整完成赛后RSI',
  async (concurrency) => {
    const { arena, store } = setup(),
      p = mock();
    const match = arena.create(config({ concurrency }));
    arena.resume(match.id);
    await arena.workers.get(match.id);
    expect(store.match(match.id).status).toBe('finished');
    expect(p.peak()).toBe(concurrency);
    expect(store.games(match.id)).toHaveLength(4);
    expect(store.gameRuns(match.id).every((g) => g.runStatus === 'finished')).toBe(true);
    for (const game of store.games(match.id)) {
      expect(store.calls(game.id).filter((c) => c.kind === 'rsi-round')).toHaveLength(2);
      expect(store.allEvents(game.id).at(-1)?.type).toBe('finish');
      for (const decision of store.decisions(game.id))
        expect(decision.input.memory.every((m: any) => m.agentId === decision.agentId)).toBe(true);
    }
    for (const agent of match.config.agents) {
      const memories = store.memory(agent.id);
      expect(new Set(memories.map((m) => m.gameId)).size).toBe(4);
      expect(memories.filter((m) => m.mode === 'round')).toHaveLength(4);
      expect(memories.filter((m) => m.mode === 'immediate').length).toBeGreaterThanOrEqual(1);
      expect(
        memories.every(
          (m) => m.matchId === match.id && m.matchName === match.config.name && m.gameNumber,
        ),
      ).toBe(true);
    }
    expect(arena.gameWorkers.size).toBe(0);
  },
);

it('并行默认1，拒绝零、非整数、超出总局数的并行数量', () => {
  expect(MatchSchema.parse({ agents: agents(2) }).concurrency).toBe(1);
  for (const concurrency of [0, -1, 1.5, 3, 101])
    expect(MatchSchema.safeParse({ agents: agents(2), games: 2, concurrency }).success).toBe(false);
});

it('暂停取消所有局的模型请求，重启后保留原局ID并从检查点补齐全部局', async () => {
  const { arena, store, config: runtime } = setup(),
    p = mock(80);
  const match = arena.create(config());
  arena.resume(match.id);
  await vi.waitFor(() => expect(p.active()).toBe(2));
  await arena.pause(match.id);
  const ids = store.games(match.id).map((g) => g.id),
    revisions = ids.map((id) => store.game(id).state.revision);
  expect(store.match(match.id).status).toBe('paused');
  expect(store.gameRuns(match.id).every((g) => g.runStatus === 'paused')).toBe(true);
  expect(ids.every((id) => store.decisionCount(id) === 0)).toBe(true);
  await arena.close();
  arenas.splice(arenas.indexOf(arena), 1);
  p.spy.mockRestore();
  const reloaded = new Arena(new Store(runtime.dataDir), runtime);
  arenas.push(reloaded);
  mock();
  expect(reloaded.store.games(match.id).map((g) => g.id)).toEqual(ids);
  expect(ids.map((id) => reloaded.store.game(id).state.revision)).toEqual(revisions);
  reloaded.resume(match.id);
  await reloaded.workers.get(match.id);
  expect(reloaded.store.match(match.id).status).toBe('finished');
  expect(reloaded.store.games(match.id)).toHaveLength(4);
  expect(
    reloaded.store
      .games(match.id)
      .slice(0, 2)
      .map((g) => g.id),
  ).toEqual(ids);
});

it('一个对局异常时其他局继续，恢复仅重试未完成局', async () => {
  const { arena, store } = setup();
  mock();
  const match = arena.create(config()),
    first = arena.current(match.id).id,
    original = arena.makeDecision.bind(arena);
  let fail = true;
  vi.spyOn(arena, 'makeDecision').mockImplementation(async (id, engine, signal, external) => {
    if (engine.s.id === first && fail) throw new Error('单局异常测试');
    return original(id, engine, signal, external);
  });
  arena.resume(match.id);
  await arena.workers.get(match.id);
  expect(store.match(match.id).status).toBe('error');
  expect(store.gameRuns(match.id).filter((g) => g.runStatus === 'finished')).toHaveLength(3);
  const completed = store
    .gameRuns(match.id)
    .filter((g) => g.runStatus === 'finished')
    .map((g) => [g.id, store.calls(g.id).length]);
  fail = false;
  arena.resume(match.id);
  await arena.workers.get(match.id);
  expect(store.match(match.id).status).toBe('finished');
  for (const [id, count] of completed) expect(store.calls(String(id))).toHaveLength(Number(count));
});

it('外部Agent等待不阻塞另一局，可在其他局请求模型时提交本局操作', async () => {
  const { arena, store } = setup();
  mock(100);
  const aa = agents(2, 'llm').map((a, i) => ({ ...a, hero: '张飞', kind: i ? 'llm' : 'external' }));
  const match = arena.create(
    config({
      agents: aa,
      games: 2,
      roleMode: 'random',
      roleAssignments: { 'agent-1': '主公', 'agent-2': '反贼' },
    }),
  );
  const first = arena.current(match.id).id;
  const second = arena.newGame(match.id, match.config, 2);
  const modelSeat = second.s.players.find((p) => p.agentId === 'agent-2')!.seat;
  second.s.active = modelSeat;
  give(second, modelSeat, '杀');
  second.s.tasks = [{ type: 'play', actor: modelSeat }];
  store.checkpoint(second.s);
  arena.resume(match.id);
  await vi.waitFor(() => {
    expect(store.game(first).runStatus).toBe('waiting');
    expect(arena.thinking.has(second.s.id)).toBe(true);
  });
  const input = arena.context(first, 0);
  await arena.externalAction(first, 'agent-1', {
    ...heuristic(input),
    revision: input.observation.revision,
  });
  expect(store.decisionCount(first)).toBeGreaterThanOrEqual(1);
  await arena.pause(match.id);
  expect(arena.gameWorkers.size).toBe(0);
});

it('单步操作只推进选中局，拒绝跨对战的gameId；停止整场不再开启排队局', async () => {
  const { arena, store } = setup();
  mock();
  const match = arena.create(config()),
    first = arena.current(match.id).id;
  const second = arena.newGame(match.id, match.config, 2);
  await arena.step(match.id, first);
  expect(store.decisionCount(first)).toBe(1);
  expect(store.decisionCount(second.s.id)).toBe(0);
  const other = arena.create(config({ games: 1, concurrency: 1 }));
  await expect(arena.step(match.id, arena.current(other.id).id)).rejects.toThrow('不属于');
  await arena.stop(match.id);
  expect(store.games(match.id)).toHaveLength(2);
  expect(store.gameRuns(match.id).every((g) => g.runStatus === 'stopped')).toBe(true);
  expect(() => arena.resume(match.id)).toThrow('结束');
});
