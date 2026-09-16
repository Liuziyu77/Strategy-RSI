import { mkdirSync, writeFileSync } from 'node:fs';
import { loadConfig, safeError } from '../server/config';
import { callModel } from '../server/agents';
import { Store } from '../server/store';
import { Arena } from '../server/arena';
import { createApp } from '../server/app';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

const config = loadConfig(),
  provider = config.providers[0];
if (!provider?.apiKey || !provider.models.length) throw new Error('请先配置 .env 中的模型 API');
mkdirSync('artifacts', { recursive: true });
const report: any = { date: new Date().toISOString(), probes: [] };
if (!process.argv.includes('--game-only')) {
  report.probes = await Promise.all(
    provider.models.map(async (model) => {
      try {
        const result = await callModel(
          provider,
          model,
          [
            { role: 'system', content: 'You are a JSON API. Return only {"ok":true}.' },
            { role: 'user', content: '连接测试。请返回指定 JSON。' },
          ],
          60000,
        );
        const row = {
          model,
          ok: (result.content as any)?.ok === true,
          latencyMs: result.latencyMs,
          usage: result.usage,
        };
        console.log(JSON.stringify(row));
        return row;
      } catch (error) {
        const row = { model, ok: false, error: safeError(error) };
        console.log(JSON.stringify(row));
        return row;
      }
    }),
  );
  writeFileSync('artifacts/api-probes.json', JSON.stringify(report, null, 2));
}
if (process.argv.includes('--probe-only')) {
  if (!report.probes.every((r: any) => r.ok)) process.exitCode = 1;
} else {
  const store = new Store(config.dataDir),
    arena = new Arena(store, config);
  let webServer: ReturnType<typeof serve> | undefined;
  if (process.argv.includes('--serve')) {
    const app = createApp(arena);
    app.get('/*', serveStatic({ root: './dist' }));
    app.get('/*', serveStatic({ path: './dist/index.html' }));
    webServer = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () =>
      console.log(`观战：http://localhost:${config.port}`),
    );
  }
  const resumeIndex = process.argv.indexOf('--resume');
  const resumeId = resumeIndex >= 0 ? process.argv[resumeIndex + 1] : undefined;
  const baseline: Record<string, number> = {};
  if (resumeId) {
    if (!store.match(resumeId)) throw new Error('待恢复的比赛不存在');
    for (const g of store.games(resumeId)) baseline[g.id] = store.decisionCount(g.id);
  }
  const match = resumeId
    ? store.match(resumeId)
    : arena.create({
        name: 'API 实测 · 双模型 RSI',
        agents: [
          {
            id: 'smoke-api-a',
            name: '观澜 · API',
            kind: 'llm',
            provider: provider.id,
            model: provider.models[0],
            rsi: 'both',
            hero: '张飞',
          },
          {
            id: 'smoke-api-b',
            name: '长风 · API',
            kind: 'llm',
            provider: provider.id,
            model: provider.models[1] ?? provider.models[0],
            rsi: 'round',
            hero: '关羽',
          },
        ],
        games: Number(process.env.API_SMOKE_GAMES ?? 2),
        seed: 39,
        paceMs: 0,
        apiTimeoutMs: 60000,
        maxDecisions: 1000,
      });
  report.matchId = match.id;
  report.resumeBaseline = baseline;
  if (resumeId) arena.resume(resumeId);
  console.log(`API smoke match: ${match.id}`);
  let last = '';
  const timer = setInterval(() => {
    const game = arena.current(match.id);
    if (game) {
      const count = store.decisionCount(game.id);
      const key = `${game.id}:${count}`;
      if (key !== last) {
        last = key;
        const state = arena.engine(game.id).s;
        const progress = {
          game: game.number,
          decisions: count,
          status: store.match(match.id).status,
          round: state.round,
          players: state.players.map((p) => ({ seat: p.seat, alive: p.alive })),
          fallbackCount: store.decisions(game.id).filter((d) => d.fallback).length,
          memories: store.memory().length,
        };
        writeFileSync('artifacts/api-progress.json', JSON.stringify(progress, null, 2));
        console.log(JSON.stringify(progress));
      }
    }
  }, 10000);
  const shutdown = async () => {
    clearInterval(timer);
    webServer?.close();
    if (webServer && 'closeAllConnections' in webServer) webServer.closeAllConnections();
    await arena.pause(match.id);
    await arena.close();
    process.exit(130);
  };
  process.once('SIGINT', shutdown);
  await arena.workers.get(match.id);
  clearInterval(timer);
  report.status = store.match(match.id).status;
  report.games = store.games(match.id).map((g) => {
    const decisions = store.decisions(g.id),
      calls = store.calls(g.id);
    return {
      ...g,
      decisions: decisions.length,
      llmDecisions: decisions.filter((d) => d.source === 'llm').length,
      fallbacks: decisions.filter((d) => d.fallback).length,
      sinceResume: {
        decisions: decisions.slice(baseline[g.id] ?? 0).length,
        fallbacks: decisions.slice(baseline[g.id] ?? 0).filter((d) => d.fallback).length,
      },
      calls: calls.map((c) => ({
        agentId: c.agentId,
        kind: c.kind,
        latencyMs: c.latencyMs,
        usage: c.usage,
        reflection: c.reflection,
        error: c.error,
        finishReason: c.finishReason,
        outputLimit: c.outputLimit,
        jsonMode: c.jsonMode,
      })),
      memoryConsumed: decisions.filter((d) => d.input?.memory?.length > 0).length,
    };
  });
  report.memory = store.memory().filter((m) => m.agentId.startsWith('smoke-api-'));
  writeFileSync('artifacts/api-games.json', JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      status: report.status,
      games: report.games.map((g: any) => ({
        number: g.number,
        winner: g.winner,
        llmDecisions: g.llmDecisions,
        fallbacks: g.fallbacks,
        memoryConsumed: g.memoryConsumed,
      })),
      memories: report.memory.length,
    }),
  );
  if (!webServer) await arena.close();
  if (report.status !== 'finished' || report.games.some((g: any) => g.sinceResume.fallbacks))
    process.exitCode = 1;
}
