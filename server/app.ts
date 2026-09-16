import { GAME_CATALOG } from '../src/games/catalog';
import { gamePlugin } from '../src/games/registry';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { bodyLimit } from 'hono/body-limit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HEROES, CARD_RULES, EQUIPMENT } from '../src/cards';
import { publicProviders, safeError } from './config';
import { Arena } from './arena';
import { saveProfile } from './players';
import { DecisionSchema } from './agents';

const int = (value: string | undefined, fallback: number, min = 0, max = 10000000) => {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('查询参数超出范围');
  return n;
};
const MemorySchema = z.object({
  agentId: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  text: z.string().trim().min(1).max(4000),
  gameType: z.enum(['sanguosha', 'werewolf', 'chess', 'xiangqi']).default('sanguosha'),
});
export function createApp(arena: Arena) {
  const app = new Hono();
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) => c.json({ error: '请求体不能超过 1 MB' }, 413),
    }),
  );
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET' && !c.req.path.startsWith('/api/agent/')) {
      const origin = c.req.header('origin');
      if (origin && new URL(origin).host !== new URL(c.req.url).host)
        return c.json({ error: '拒绝跨站控制请求' }, 403);
      const expected = arena.config.adminToken,
        actual = (c.req.header('Authorization') ?? '').replace(/^Bearer /, '');
      if (
        expected &&
        (Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(actual), Buffer.from(expected)))
      )
        return c.json({ error: '需要管理令牌' }, 401);
    }
    await next();
  });
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join('；')
            : safeError(error),
      },
      400,
    ),
  );
  app.get('/api/health', (c) => c.json({ ok: true, version: '1.0.0' }));
  app.get('/api/config', (c) =>
    c.json({
      providers: publicProviders(arena.config),
      games: Object.values(GAME_CATALOG),
      heroes: HEROES,
      cards: CARD_RULES,
      equipment: EQUIPMENT,
      adminRequired: !!arena.config.adminToken,
    }),
  );
  app.get('/api/game-types', (c) => c.json(Object.values(GAME_CATALOG)));
  app.get('/api/game-types/:id/rules', (c) => {
    const id = z.enum(['sanguosha', 'werewolf', 'chess', 'xiangqi']).parse(c.req.param('id'));
    const locale = z.enum(['zh', 'en']).parse(c.req.query('locale') ?? 'zh');
    if (!GAME_CATALOG[id].locales.includes(locale)) throw new Error('Unsupported game language');
    return c.json({ ...GAME_CATALOG[id], locale, rules: gamePlugin(id).rules(locale) });
  });
  app.get('/api/matches', (c) =>
    c.json(arena.store.matches().map((m) => ({ ...m, games: arena.store.games(m.id) }))),
  );
  app.get('/api/players', (c) => c.json(arena.store.players()));
  app.post('/api/players', async (c) => {
    const profile = saveProfile(arena.store, arena.config, await c.req.json());
    arena.signal('players');
    return c.json(profile, 201);
  });
  app.get('/api/players/:id', (c) => {
    const id = c.req.param('id'),
      player = arena.store.players().find((p) => p.id === id);
    if (!player) return c.json({ error: '玩家不存在' }, 404);
    return c.json({
      ...player,
      memories: arena.store.memory(id),
      history: arena.store.playerHistory(id),
      matchHistory: arena.store.playerMatchHistory(id),
      consolidations: arena.store.consolidations(id),
    });
  });
  app.put('/api/players/:id', async (c) => {
    const profile = saveProfile(arena.store, arena.config, await c.req.json(), c.req.param('id'));
    arena.signal('players');
    return c.json(profile);
  });
  app.post('/api/players/:id/memories', async (c) => {
    const id = c.req.param('id');
    if (!arena.store.player(id)) return c.json({ error: '玩家不存在' }, 404);
    const { text, gameType } = MemorySchema.omit({ agentId: true }).parse(await c.req.json());
    const memory = arena.store.addMemory(id, text, 'manual', null, { gameType });
    arena.signal('players');
    return c.json(memory, 201);
  });
  app.post('/api/players/:id/memories/consolidate', async (c) => {
    const { matchId } = z.object({ matchId: z.string().min(1) }).parse(await c.req.json());
    return c.json(arena.consolidator.start(c.req.param('id'), matchId), 202);
  });
  app.post('/api/players/:id/memories/import', async (c) => {
    const id = c.req.param('id');
    if (!arena.store.player(id)) return c.json({ error: '玩家不存在' }, 404);
    const body = await c.req.json();
    const rows = z
      .array(MemorySchema.omit({ agentId: true }))
      .min(1)
      .max(500)
      .parse(Array.isArray(body) ? body : body.memories);
    arena.store.transaction(() =>
      rows.forEach((row) =>
        arena.store.addMemory(id, row.text, 'import', null, { gameType: row.gameType }),
      ),
    );
    arena.signal('players');
    return c.json({ imported: rows.length }, 201);
  });
  app.delete('/api/players/:id/memories/:memoryId', (c) => {
    const id = c.req.param('id'),
      memoryId = c.req.param('memoryId');
    if (!arena.store.memory(id).some((m) => m.id === memoryId))
      return c.json({ error: '该玩家的记忆不存在' }, 404);
    arena.store.deleteMemory(memoryId);
    arena.signal('players');
    return c.json({ deleted: true });
  });
  app.post('/api/matches', async (c) => c.json(arena.create(await c.req.json()), 201));
  app.post('/api/matches/:id/:operation', async (c) => {
    const id = c.req.param('id'),
      op = c.req.param('operation');
    if (op === 'pause') await arena.pause(id);
    else if (op === 'resume') arena.resume(id);
    else if (op === 'step') {
      const body = await c.req.text();
      const input = z.object({ gameId: z.string().optional() }).parse(body ? JSON.parse(body) : {});
      await arena.step(id, input.gameId);
    } else if (op === 'stop') await arena.stop(id);
    else return c.json({ error: '未知操作' }, 404);
    return c.json(arena.store.match(id));
  });
  app.get('/api/games/:id', (c) =>
    c.json(
      arena.snapshot(
        c.req.param('id'),
        c.req.query('seq') === undefined ? undefined : int(c.req.query('seq'), 1, 1),
        int(c.req.query('viewer'), -1, -1, 11),
      ),
    ),
  );
  app.get('/api/games/:id/events', (c) =>
    c.json(
      c.req.query('tail')
        ? arena.store.recentEvents(
            c.req.param('id'),
            int(c.req.query('before'), 10000000),
            int(c.req.query('tail'), 300, 1, 5000),
          )
        : arena.store.events(
            c.req.param('id'),
            int(c.req.query('after'), 0),
            int(c.req.query('limit'), 500, 1, 5000),
          ),
    ),
  );
  app.get('/api/games/:id/decisions', (c) =>
    c.json(
      arena.store
        .decisions(
          c.req.param('id'),
          int(c.req.query('limit'), 100, 1, 5000),
          int(c.req.query('before'), 10000000),
        )
        .map(({ input, ...row }) => row),
    ),
  );
  app.get('/api/games/:id/chat', (c) => {
    const id = c.req.param('id');
    if (!arena.store.game(id)) return c.json({ error: '对局不存在' }, 404);
    return c.json(
      arena.store.chat(
        id,
        int(c.req.query('before'), 10000000),
        int(c.req.query('limit'), 100, 1, 5000),
      ),
    );
  });
  app.get('/api/games/:id/calls', (c) =>
    c.json(arena.store.calls(c.req.param('id')).map(({ input, raw, ...row }) => row)),
  );
  app.get('/api/games/:id/export', (c) => {
    const id = c.req.param('id'),
      game = arena.store.game(id);
    if (!game) return c.json({ error: '对局不存在' }, 404);
    const format = c.req.query('format');
    c.header(
      'Content-Disposition',
      `attachment; filename="game-${id}.${format === 'jsonl' ? 'jsonl' : 'json'}"`,
    );
    if (format === 'jsonl')
      return c.text(
        arena.store
          .allEvents(id)
          .map((e) => JSON.stringify({ event: e, state: arena.store.frame(id, e.seq) }))
          .join('\n'),
      );
    return c.json({
      schemaVersion: 1,
      game,
      config: arena.store.match(game.matchId).config,
      events: arena.store.allEvents(id),
      chat: arena.store.chat(id, 1000000000, 1000000).messages,
      decisions: arena.store.decisions(id),
      calls: arena.store.calls(id),
      memories: arena.store.memory().filter((m) => m.gameId === id),
    });
  });
  app.get('/api/memories', (c) => c.json(arena.store.memory(c.req.query('agentId'))));
  app.post('/api/memories', async (c) => {
    const m = MemorySchema.parse(await c.req.json());
    return c.json(
      arena.store.addMemory(m.agentId, m.text, 'manual', null, { gameType: m.gameType }),
      201,
    );
  });
  app.delete('/api/memories/:id', (c) =>
    c.json({ deleted: arena.store.deleteMemory(c.req.param('id')) }),
  );
  app.post('/api/memories/import', async (c) => {
    const data = await c.req.json();
    const rows = z
      .array(MemorySchema)
      .min(1)
      .max(500)
      .parse(Array.isArray(data) ? data : data.memories);
    const memories = arena.store.transaction(() =>
      rows.map((m) =>
        arena.store.addMemory(m.agentId, m.text, 'import', null, { gameType: m.gameType }),
      ),
    );
    return c.json({ imported: memories.length }, 201);
  });
  app.get('/api/memories/export', (c) => {
    c.header('Content-Disposition', 'attachment; filename="agent-memories.json"');
    return c.json({ schemaVersion: 1, memories: arena.store.memory(c.req.query('agentId')) });
  });
  app.get('/api/agent/:gameId/:agentId', (c) => {
    const { gameId, agentId } = c.req.param(),
      game = arena.store.game(gameId);
    if (!game) return c.json({ error: '对局不存在' }, 404);
    if (
      !arena.verifySeatToken(
        game.matchId,
        agentId,
        (c.req.header('Authorization') ?? '').replace(/^Bearer /, ''),
      )
    )
      return c.json({ error: 'Agent 令牌无效' }, 401);
    const seat = arena.engine(gameId).s.players.find((p) => p.agentId === agentId)?.seat;
    if (seat === undefined) return c.json({ error: 'Agent 不在本局' }, 404);
    return c.json(arena.context(gameId, seat));
  });
  app.post('/api/agent/:gameId/:agentId/actions', async (c) => {
    const { gameId, agentId } = c.req.param(),
      game = arena.store.game(gameId);
    if (!game) return c.json({ error: '对局不存在' }, 404);
    if (
      !arena.verifySeatToken(
        game.matchId,
        agentId,
        (c.req.header('Authorization') ?? '').replace(/^Bearer /, ''),
      )
    )
      return c.json({ error: 'Agent 令牌无效' }, 401);
    const action = DecisionSchema.extend({ revision: z.number().int().min(0) }).parse(
      await c.req.json(),
    );
    await arena.externalAction(gameId, agentId, action);
    return c.json({ ok: true });
  });
  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      let dirty = true,
        closed = false;
      const change = () => {
        dirty = true;
      };
      arena.on('change', change);
      stream.onAbort(() => {
        closed = true;
        arena.off('change', change);
      });
      try {
        let ticks = 0;
        while (!closed) {
          if (dirty) {
            dirty = false;
            await stream.writeSSE({ event: 'update', data: '{}' });
          } else if (++ticks % 60 === 0) await stream.writeSSE({ event: 'ping', data: '{}' });
          await stream.sleep(250);
        }
      } finally {
        arena.off('change', change);
      }
    }),
  );
  app.notFound((c) => c.json({ error: '接口不存在' }, 404));
  return app;
}
