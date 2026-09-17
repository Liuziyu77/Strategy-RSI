import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Arena } from '../../server/arena';
import { Store } from '../../server/store';
import { createApp } from '../../server/app';
import { decisionMessages, reflectionMessages, heuristic } from '../../server/agents';
import { MatchSchema } from '../../server/config';
import { gamePlugin } from '../../src/games/registry';
import type { GameType, Locale } from '../../src/games/core';
const arenas: Arena[] = [],
  dirs: string[] = [];
const agents = (n: number, kind = 'heuristic', rsi = 'off') =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    kind,
    rsi,
    provider: 'test',
    model: 'mock',
  }));
function setup(dir = mkdtempSync(join(tmpdir(), 'multigame-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const store = new Store(dir),
    config = {
      dataDir: dir,
      host: '127.0.0.1',
      port: 0,
      adminToken: '',
      providers: [
        {
          id: 'test',
          name: 'Test',
          apiKey: 'local-mock-only',
          baseUrl: 'http://mock.invalid/v1',
          models: ['mock'],
        },
      ],
    };
  const arena = new Arena(store, config);
  arenas.push(arena);
  return { arena, store, app: createApp(arena), dir };
}
afterEach(async () => {
  for (const a of arenas.splice(0)) if (!a.closed) await a.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function modelMock() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body)),
      system = body.messages[0].content,
      input = JSON.parse(body.messages[1].content);
    const content = system.includes('"shouldRemember"')
      ? {
          shouldRemember: true,
          memory: `lesson ${input.observation.gameType} ${input.observation.revision}`,
          reason: 'reusable',
        }
      : system.includes('Consolidate') || system.includes('归纳个人经验')
        ? {
            immediate: 'Use only legal actions and verify claims.',
            round: 'Review outcomes.',
            shared: '',
          }
        : {
            ...heuristic(input),
            speech:
              input.observation.locale === 'en'
                ? 'I will evaluate the visible position.'
                : '我会结合可见局势行动。',
          };
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    );
  });
}
it('validates game-specific player count, language and legacy defaults', () => {
  expect(MatchSchema.parse({ agents: agents(2) }).gameType).toBe('sanguosha');
  for (const [gameType, n, locale] of [
    ['chess', 3, 'en'],
    ['werewolf', 5, 'zh'],
    ['xiangqi', 2, 'en'],
    ['sanguosha', 9, 'zh'],
  ] as const)
    expect(() => MatchSchema.parse({ gameType, agents: agents(n), locale })).toThrow();
  expect(
    MatchSchema.parse({ gameType: 'werewolf', agents: agents(12), locale: 'en' }).agents,
  ).toHaveLength(12);
});

for (const [gameType, locale] of [
  ['chess', 'zh'],
  ['chess', 'en'],
  ['werewolf', 'zh'],
  ['werewolf', 'en'],
  ['xiangqi', 'zh'],
] as [GameType, Locale][]) {
  it(`${gameType}/${locale}: shared API, model conversation, immediate/round RSI, replay and consolidation`, async () => {
    const mock = modelMock(),
      { arena, store, app } = setup();
    const m = arena.create({
      gameType,
      locale,
      agents: agents(gameType === 'werewolf' ? 6 : 2, 'llm', 'both'),
      maxDecisions: 20,
      paceMs: 0,
      autoStart: false,
    });
    const game = arena.current(m.id);
    const input = arena.context(game.id, arena.engine(game.id).actor);
    expect(input.observation.gameType).toBe(gameType);
    const prompt = decisionMessages(input)[0].content;
    expect(prompt).toContain(locale === 'en' ? 'Respond in English' : '使用中文');
    expect(reflectionMessages(input, 'round')[0].content).toContain(
      locale === 'en' ? 'post-game review' : '整局结束后的复盘',
    );
    arena.resume(m.id);
    await arena.workers.get(m.id);
    expect(store.match(m.id).status).toBe('finished');
    expect(store.decisions(game.id).some((d) => d.fallback)).toBe(false);
    expect(store.calls(game.id).some((c) => c.kind === 'rsi-immediate')).toBe(true);
    expect(store.calls(game.id).filter((c) => c.kind === 'rsi-round')).toHaveLength(
      gameType === 'werewolf' ? 6 : 2,
    );
    expect(store.memory('p0').every((m) => m.gameType === gameType)).toBe(true);
    const accepted = store.decisions(game.id);
    expect(accepted.some((d) => d.input.memory.length > 0)).toBe(true);
    const firstFrame = store.allEvents(game.id).find((e) => e.type === 'ready')!;
    const replay = await (await app.request(`/api/games/${game.id}?seq=${firstFrame.seq}`)).json();
    expect(replay.view.gameType).toBe(gameType);
    expect(replay.view.revision).toBe(firstFrame.seq);
    const job = arena.consolidator.start('p0', m.id);
    await arena.consolidator.jobs.get(`p0:${m.id}`);
    expect(store.consolidations('p0')[0].status).toBe('completed');
    expect(store.activeMemory('p0', gameType).some((m) => m.mode === 'consolidated')).toBe(true);
    expect(store.activeMemory('p0', gameType === 'chess' ? 'werewolf' : 'chess')).toEqual([]);
    expect(store.chat(game.id).messages.length).toBeGreaterThan(0);
    expect(mock).toHaveBeenCalled();
  });
}
it('memory import/export retains game scope; legacy manual memory stays in Sanguosha', async () => {
  const { store, app } = setup();
  store.addMemory('p0', 'old manual');
  store.addMemory('p0', 'chess manual', 'manual', null, { gameType: 'chess' });
  expect(store.activeMemory('p0').map((m) => m.text)).toEqual(['old manual']);
  expect(store.activeMemory('p0', 'chess').map((m) => m.text)).toEqual(['chess manual']);
  const exported = await (await app.request('/api/memories/export?agentId=p0')).json();
  const response = await app.request('/api/memories/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(exported),
  });
  expect(response.status).toBe(201);
  expect(store.activeMemory('p0', 'chess')).toHaveLength(2);
});

it('passes the configured output budget to decisions, both RSI modes and consolidation', async () => {
  const mock = modelMock();
  const { arena, store } = setup();
  expect(MatchSchema.parse({ agents: agents(2) }).modelOutputLimit).toBe(4096);
  for (const limit of [0, 511, 32769])
    expect(() => MatchSchema.parse({ agents: agents(2), modelOutputLimit: limit })).toThrow();
  const match = arena.create({
    gameType: 'chess',
    locale: 'en',
    agents: agents(2, 'llm', 'both'),
    modelOutputLimit: 8192,
    maxDecisions: 20,
    paceMs: 0,
    autoStart: false,
  });
  arena.resume(match.id);
  await arena.workers.get(match.id);
  const gameId = store.games(match.id)[0].id;
  for (const kind of ['decision', 'rsi-immediate', 'rsi-round'])
    expect(
      store.calls(gameId).some((call) => call.kind === kind && call.outputLimit === 8192),
    ).toBe(true);
  arena.consolidator.start('p0', match.id);
  await arena.consolidator.jobs.get(`p0:${match.id}`);
  expect(store.consolidations('p0')[0].status).toBe('completed');
  expect(
    mock.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).max_tokens === 8192),
  ).toBe(true);
});
it('wolf team messages stay out of public chat and another player’s token context', async () => {
  const { arena, store, app } = setup();
  const m = arena.create({
    gameType: 'werewolf',
    locale: 'en',
    agents: agents(6, 'external'),
    autoStart: false,
  });
  const game = arena.current(m.id),
    engine = arena.engine(game.id),
    wolf = engine.p(engine.actor),
    villager = engine.s.players.find((p) => p.role === 'villager')!;
  await arena.externalAction(game.id, wolf.agentId, {
    actionId: 'speak',
    reason: '',
    speech: 'private wolf plan',
    revision: engine.s.revision,
  });
  expect(store.chat(game.id).messages).toHaveLength(0);
  const response = await app.request(`/api/agent/${game.id}/${villager.agentId}`, {
    headers: { Authorization: `Bearer ${m.agentTokens[villager.agentId]}` },
  });
  const text = await response.text();
  expect(text).not.toContain('private wolf plan');
  expect(text).not.toContain('wolf_discussion');
  expect(arena.context(game.id, wolf.seat).chat.some((c) => c.text === 'private wolf plan')).toBe(
    true,
  );
  const e = store.allEvents(game.id).find((e) => e.type === 'chat')!;
  expect(e.visibleTo).toContain(wolf.seat);
});
it('restores each game from SQLite with the same choices, revision and language', async () => {
  const { arena, store, dir } = setup();
  const matches = (['werewolf', 'chess', 'xiangqi'] as GameType[]).map((gameType) =>
    arena.create({
      gameType,
      locale: gameType === 'xiangqi' ? 'zh' : 'en',
      agents: agents(gameType === 'werewolf' ? 8 : 2),
      autoStart: false,
    }),
  );
  const saved = [];
  for (const m of matches) {
    await arena.step(m.id);
    const e = arena.engine(arena.current(m.id).id);
    saved.push({ id: e.s.id, view: e.view(e.actor), choices: e.legalActions() });
  }
  await arena.close();
  const resumed = setup(dir);
  for (const before of saved) {
    const e = resumed.arena.engine(before.id);
    expect(e.view(e.actor)).toEqual(before.view);
    expect(e.legalActions()).toEqual(before.choices);
    expect(resumed.store.game(e.s.id).runStatus).toBe('paused');
  }
});
it('generic winner statistics include dead teammates and chess/xiangqi sides', () => {
  const { arena, store } = setup();
  for (const gameType of ['werewolf', 'chess', 'xiangqi'] as GameType[]) {
    const m = arena.create({
      gameType,
      agents: agents(gameType === 'werewolf' ? 6 : 2),
      autoStart: false,
    });
    const e = arena.engine(arena.current(m.id).id);
    e.s.players[0].alive = false;
    e.finish(
      gameType === 'werewolf' ? 'village' : gameType === 'chess' ? 'white' : '红方',
      'test outcome',
    );
    store.checkpoint(e.s);
    for (const p of e.s.players) {
      const won = e.s.outcome!.winners.includes(p.agentId);
      expect(store.playerMatchHistory(p.agentId).find((h) => h.matchId === m.id)?.stats.wins).toBe(
        won ? 1 : 0,
      );
      expect(store.playerHistory(p.agentId).find((h) => h.gameId === e.s.id)?.won).toBe(won);
    }
  }
});
it('new-engine transaction rollback discards speech, move and uncommitted checkpoint', async () => {
  const { arena, store } = setup();
  const m = arena.create({ gameType: 'chess', agents: agents(2, 'external'), autoStart: false });
  const e = arena.engine(arena.current(m.id).id),
    before = structuredClone(e.s),
    actor = e.p(e.actor).agentId;
  store.db.exec(
    "CREATE TRIGGER reject_move BEFORE INSERT ON events WHEN json_extract(NEW.event,'$.type')='move' BEGIN SELECT RAISE(ABORT,'test rollback'); END;",
  );
  await expect(
    arena.externalAction(e.s.id, actor, {
      actionId: 'e2e4',
      reason: '',
      speech: 'should roll back',
      revision: e.s.revision,
    }),
  ).rejects.toThrow();
  expect(arena.engine(e.s.id).s).toEqual(before);
  expect(store.chat(e.s.id).messages).toHaveLength(0);
  expect(store.decisions(e.s.id)).toHaveLength(0);
});

it('failed match initialization leaves no profiles, tokens, games or cached engine', () => {
  const { arena, store } = setup();
  store.db.exec(
    "CREATE TRIGGER reject_start BEFORE INSERT ON events WHEN json_extract(NEW.event,'$.type')='ready' BEGIN SELECT RAISE(ABORT,'initialization failed'); END;",
  );
  expect(() =>
    arena.create({ gameType: 'chess', agents: agents(2, 'external'), autoStart: false }),
  ).toThrow('initialization failed');
  for (const table of [
    'matches',
    'games',
    'events',
    'game_runs',
    'game_players',
    'seat_tokens',
    'player_profiles',
  ])
    expect(store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, table).toBe(0);
  expect(arena.engines.size).toBe(0);
});

it('Sanguosha exposes the terminal reason in live and replay observations', async () => {
  const { arena, store, app } = setup();
  const match = arena.create({ agents: agents(2), autoStart: false });
  const engine = arena.engine(arena.current(match.id).id);
  engine.finish('平局', '达到配置的决策上限');
  store.checkpoint(engine.s);
  for (const suffix of ['', `?seq=${engine.s.revision}`]) {
    const result = await (await app.request(`/api/games/${engine.s.id}${suffix}`)).json();
    expect(result.view.reason).toBe('达到配置的决策上限');
  }
  expect(arena.snapshot(engine.s.id, 1).view).toHaveProperty('reason', null);
});

it('failed later-round initialization can be retried without a partial round', async () => {
  const { arena, store } = setup();
  const match = arena.create({ gameType: 'chess', agents: agents(2), games: 2, autoStart: false });
  const first = arena.current(match.id);
  arena.engine(first.id).finish('draw', 'fixture');
  store.checkpoint(arena.engine(first.id).s);
  store.setGameStatus(first.id, 'finished');
  store.db.exec(
    "CREATE TRIGGER reject_start BEFORE INSERT ON events WHEN json_extract(NEW.event,'$.type')='ready' BEGIN SELECT RAISE(ABORT,'initialization failed'); END;",
  );
  arena.resume(match.id);
  await arena.workers.get(match.id);
  expect(store.match(match.id).status).toBe('error');
  expect(store.games(match.id)).toHaveLength(1);
  expect(arena.engines.size).toBe(1);
  store.db.exec('DROP TRIGGER reject_start');
  const second = arena.newGame(match.id, match.config, 2);
  expect(store.games(match.id).map((g) => g.number)).toEqual([1, 2]);
  expect(arena.snapshot(second.s.id).view.revision).toBe(second.s.revision);
});
