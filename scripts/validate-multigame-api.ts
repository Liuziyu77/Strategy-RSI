import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Arena } from '../server/arena';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { restoreEngine } from '../src/games/registry';
import type { GameType, Locale } from '../src/games/core';
import type { MatchConfig } from '../src/types';
import {
  atomicJSON,
  experimentProvider,
  experimentRoot,
  gameTrace,
  instrumentProvider,
  modelLabels,
  redact,
} from './experiment-support';

const original = process.argv.includes('--original');
assert(!original || process.argv.includes('--audit'), '--original only supports offline audit.');
const validationRoot = original ? experimentRoot : join(experimentRoot, 'validation-8192');
const provider = experimentProvider();
const config = {
  providers: [provider],
  dataDir: join(validationRoot, original ? 'validation-db' : 'data'),
  host: '127.0.0.1',
  port: 0,
  adminToken: '',
};
const store = new Store(config.dataDir);
const arena = new Arena(store, config);
const app = createApp(arena);
const meter = instrumentProvider(provider, 4);
const requestFile = join(validationRoot, 'validation-requests.json');
if (existsSync(requestFile)) meter.records.push(...JSON.parse(readFileSync(requestFile, 'utf8')));
const reportPath = join(validationRoot, 'validation.json');
const report: any = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, 'utf8'))
  : {
      startedAt: new Date().toISOString(),
      plannedGames: 10,
      modelOutputLimit: 8192,
      credentialField: 'api_key_env_yh',
      models: provider.models,
      checks: [],
    };
const variants: [GameType, Locale][] = [
  ['chess', 'zh'],
  ['chess', 'en'],
  ['xiangqi', 'zh'],
  ['werewolf', 'zh'],
  ['werewolf', 'en'],
];
const progress = () => {
  atomicJSON(join(validationRoot, 'validation-progress.json'), {
    at: new Date().toISOString(),
    completed: report.checks.length,
    planned: 10,
    requests: meter.records.length,
    games: store
      .games()
      .map((g) => ({ id: g.id, status: g.runStatus, decisions: store.decisionCount(g.id) })),
  });
  atomicJSON(join(validationRoot, 'validation-requests.json'), meter.records);
};
const timer = setInterval(progress, 15000);
try {
  // Language groups are sequential so the English games can verify persisted same-game memory.
  for (const group of process.argv.includes('--audit')
    ? []
    : [
        variants.filter(([, locale]) => locale === 'zh'),
        variants.filter(([, locale]) => locale === 'en'),
      ]) {
    await Promise.all(
      group.flatMap(([gameType, locale]) =>
        [0, 1].map((pair) =>
          gameTrace.run(`validation-${gameType}-${locale}-${pair}`, async () => {
            const id = `validation-${gameType}-${locale}-${pair}`;
            if (report.checks.some((row: any) => row.id === id)) return;
            const indices =
              gameType === 'werewolf'
                ? [0, 1, 2, 3, 0, 1, 2, 3].map((i) => (i + pair) % 4)
                : [pair * 2, pair * 2 + 1];
            const agents = indices.map((m, seat) => ({
              id: `validation-m${m}${seat >= 4 ? '-copy1' : ''}`,
              name: `${modelLabels[m]} ${seat + 1}`,
              kind: 'llm',
              model: provider.models[m],
              provider: provider.id,
              rsi: 'both',
            }));
            const match =
              store.matches().find((m) => m.config.name === id) ??
              arena.create({
                name: id,
                gameType,
                locale,
                agents,
                games: 1,
                autoStart: false,
                paceMs: 0,
                seed: 20260916 + pair,
                maxDecisions: gameType === 'werewolf' ? 32 : 20,
                contextEvents: 80,
                contextChatMessages: 40,
                apiTimeoutMs: 180000,
                modelOutputLimit: 8192,
                chatEnabled: true,
              });
            const gameId = store.games(match.id)[0].id;
            const checks: Record<string, unknown> = {};
            try {
              for (const agent of agents)
                assert(
                  store.activeMemory(agent.id, gameType).every((m) => m.gameType === gameType),
                );
              const startMemory = agents.reduce(
                (n, a) => n + store.activeMemory(a.id, gameType).length,
                0,
              );
              if (store.match(match.id).status !== 'finished') {
                arena.resume(match.id);
                await arena.workers.get(match.id);
              }
              assert.equal(store.match(match.id).status, 'finished');
              const engine = arena.engine(gameId);
              const decisions = store.decisions(gameId);
              const calls = store.calls(gameId);
              checks.decisions = decisions.length;
              checks.fallbacks = decisions.filter((d) => d.fallback).length;
              checks.callErrors = calls
                .filter((c) => c.kind.endsWith('error'))
                .map((c) => ({ kind: c.kind, error: c.error }));
              checks.immediateReflections = calls.filter((c) => c.kind === 'rsi-immediate').length;
              checks.roundReflections = calls.filter((c) => c.kind === 'rsi-round').length;
              checks.memoryConsumed = decisions.filter((d) => d.input.memory.length > 0).length;
              checks.startMemory = startMemory;
              checks.memoryScope = decisions.every((d) =>
                d.input.memory.every(
                  (m: any) => m.gameType === gameType && m.agentId === d.agentId,
                ),
              );
              checks.promptsMatchLocale = calls
                .filter((c) => c.kind === 'decision')
                .every((c) =>
                  c.input[0].content.includes(locale === 'en' ? 'Respond in English' : '使用中文'),
                );
              checks.publicChat = store.chat(gameId, undefined, 1000).messages.length;
              checks.teamChat = store
                .allEvents(gameId)
                .filter((e) => e.type === 'chat' && e.visibleTo).length;
              checks.hiddenMessagesFiltered = decisions.every((d) =>
                d.input.chat.every((message: any) => {
                  const event = store.allEvents(gameId).find((e) => e.seq === message.seq);
                  return !!event && (!event.visibleTo || event.visibleTo.includes(d.seat));
                }),
              );
              const first = store.allEvents(gameId).find((e) => e.type === 'ready')!;
              const replay = (await (
                await app.request(`/api/games/${gameId}?seq=${first.seq}`)
              ).json()) as any;
              assert.equal(replay.view.revision, first.seq);
              checks.replay = true;
              const before = JSON.stringify(engine.view(-1));
              const restored = restoreEngine(structuredClone(store.game(gameId).state));
              assert.equal(JSON.stringify(restored.view(-1)), before);
              checks.checkpointRestore = true;
              const consolidations = [];
              for (const agent of agents.filter((a, i) => indices.indexOf(indices[i]) === i)) {
                try {
                  const job = arena.consolidator.start(agent.id, match.id);
                  await arena.consolidator.jobs.get(`${agent.id}:${match.id}`);
                  const result = store.consolidations(agent.id).find((j) => j.id === job.id)!;
                  consolidations.push({
                    model: agent.model,
                    status: result.status,
                    error: result.error,
                    sourceCount: result.sourceIds.length,
                  });
                } catch (error) {
                  consolidations.push({
                    model: agent.model,
                    status: 'error',
                    error: redact(error, provider),
                  });
                }
              }
              checks.consolidations = consolidations;
              checks.gameStatus = engine.s.status;
              checks.winner = engine.s.winner;
              checks.terminalReason = engine.s.reason;
              checks.ok =
                checks.fallbacks === 0 &&
                (checks.callErrors as unknown[]).length === 0 &&
                checks.memoryScope &&
                checks.promptsMatchLocale &&
                checks.hiddenMessagesFiltered &&
                Number(checks.immediateReflections) > 0 &&
                checks.roundReflections === agents.length &&
                Number(checks.memoryConsumed) > 0 &&
                consolidations.every((c) => c.status === 'completed');
            } catch (error) {
              checks.ok = false;
              checks.error = redact(error, provider);
            }
            report.checks.push({
              id,
              gameType,
              locale,
              pair,
              matchId: match.id,
              gameId,
              ...checks,
            });
            atomicJSON(reportPath, report);
            progress();
            console.log(
              JSON.stringify({
                id,
                ok: checks.ok,
                decisions: checks.decisions,
                fallbacks: checks.fallbacks,
                errors: checks.callErrors,
                consolidations: checks.consolidations,
              }),
            );
          }),
        ),
      ),
    );
  }
  if (original && existsSync(join(experimentRoot, 'validation-stop.json'))) {
    report.stop = JSON.parse(readFileSync(join(experimentRoot, 'validation-stop.json'), 'utf8'));
    report.status = 'stopped';
    report.finishedAt = report.stop.stoppedAt;
    report.requestUsageIncomplete = true;
    for (const match of store.matches()) {
      if (report.checks.some((row: any) => row.matchId === match.id)) continue;
      const game = store.games(match.id)[0];
      const decisions = store.decisions(game.id);
      const calls = store.calls(game.id);
      const engine = arena.engine(game.id);
      const first = store.allEvents(game.id).find((e) => e.type === 'ready')!;
      const replay = (await (
        await app.request(`/api/games/${game.id}?seq=${first.seq}`)
      ).json()) as any;
      assert.equal(replay.view.revision, first.seq);
      assert.deepEqual(
        restoreEngine(structuredClone(store.game(game.id).state)).view(-1),
        engine.view(-1),
      );
      report.checks.push({
        id: match.config.name,
        matchId: match.id,
        gameId: game.id,
        gameType: match.config.gameType,
        locale: match.config.locale,
        interrupted: true,
        ok: false,
        gameStatus: engine.s.status,
        error:
          'Stopped superseded configuration; no winner assigned and no replacement game started.',
        decisions: decisions.length,
        fallbacks: decisions.filter((d) => d.fallback).length,
        callErrors: calls
          .filter((c) => c.kind.endsWith('error'))
          .map((c) => ({ kind: c.kind, error: c.error })),
        immediateReflections: calls.filter((c) => c.kind === 'rsi-immediate').length,
        roundReflections: calls.filter((c) => c.kind === 'rsi-round').length,
        memoryConsumed: decisions.filter((d) => d.input.memory.length).length,
        publicChat: store.chat(game.id, undefined, 1000).messages.length,
        teamChat: store.allEvents(game.id).filter((e) => e.type === 'chat' && e.visibleTo).length,
        replay: true,
        checkpointRestore: true,
        consolidations: [],
      });
    }
    report.unstartedGames = 10 - store.games().length;
  }
  // Re-audit persisted contexts, including reflection calls, without further model requests.
  for (const row of report.checks) {
    const matchConfig: MatchConfig = store.match(row.matchId).config;
    const calls = store.calls(row.gameId);
    const decisions = store.decisions(row.gameId);
    row.consolidatedMemoryConsumed = decisions.filter((d) =>
      d.input.memory.some((m: any) => m.consolidationId),
    ).length;
    row.models = provider.models.map((model) => {
      const ids = new Set(matchConfig.agents.filter((a) => a.model === model).map((a) => a.id));
      const own = calls.filter((c) => ids.has(c.agentId));
      return {
        model,
        decisions: own.filter((c) => c.kind === 'decision').length,
        immediate: own.filter((c) => c.kind === 'rsi-immediate').length,
        round: own.filter((c) => c.kind === 'rsi-round').length,
        errors: own
          .filter((c) => c.kind.endsWith('error'))
          .map((c) => ({ kind: c.kind, error: c.error })),
        fallbacks: decisions.filter((d) => ids.has(d.agentId) && d.fallback).length,
      };
    });
    const events = new Map(store.allEvents(row.gameId).map((e) => [e.seq, e]));
    row.errorCallsWithoutStoredInput = calls.filter(
      (call) => call.kind.endsWith('error') && !call.input,
    ).length;
    const contexts = calls.flatMap((call) => {
      if (!call.input || call.kind.endsWith('error')) return [];
      const input = JSON.parse(call.input[1].content);
      return input.observation ? [input] : [];
    });
    row.auditedContexts = contexts.length;
    row.hiddenMessagesFiltered =
      contexts.length > 0 &&
      contexts.every((input) => {
        const seat = input.observation.viewer;
        const visible = (seq: number) => {
          const event = events.get(seq);
          return (
            !!event &&
            (!event.visibleTo || event.visibleTo.includes(seat)) &&
            (event.privateTo === undefined || event.privateTo === seat)
          );
        };
        return (
          input.chat.every((message: any) => visible(message.seq)) &&
          input.history.every((event: any) => visible(event.seq))
        );
      });
    row.ok = row.ok && row.hiddenMessagesFiltered;
  }
  report.finishedAt ??= new Date().toISOString();
  report.auditedAt = new Date().toISOString();
  report.actualGames = store.games().length;
  report.modelOutputLimit = original ? 4096 : 8192;
  report.ok = report.checks.length === 10 && report.checks.every((r: any) => r.ok);
  atomicJSON(reportPath, report);
  console.log(JSON.stringify({ validationDone: true, ok: report.ok, games: report.actualGames }));
} finally {
  clearInterval(timer);
  progress();
  await arena.close();
  meter.restore();
}
