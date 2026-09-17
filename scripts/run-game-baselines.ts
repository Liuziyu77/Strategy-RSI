/** Resumable per-game expansion. Frozen decision protocol; prior attempts count against each cap. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  agentInput,
  callModel,
  decisionMessages,
  DecisionSchema,
  ModelOutputError,
} from '../server/agents';
import { gamePlugin, restoreEngine } from '../src/games/registry';
import { GAME_CATALOG } from '../src/games/catalog';
import type { GameType, Locale, GameEngine } from '../src/games/core';
import type { AgentConfig, Decision } from '../src/types';
import {
  atomicJSON,
  expectedModels,
  experimentProvider,
  gameTrace,
  instrumentProvider,
  modelLabels,
  redact,
  sha256,
} from './experiment-support';

type Job = {
  id: string;
  gameType: GameType;
  locale: Locale;
  seed: number;
  block: number;
  rotation: number;
  models: number[];
};
const jobs: Job[] = [];
for (let i = 0; i < 4; i++)
  for (let j = i + 1; j < 4; j++) {
    for (let block = 1; block < 7; block++)
      for (const locale of ['zh', 'en'] as const)
        for (let mirror = 0; mirror < 2; mirror++)
          jobs.push({
            id: `chess-${locale}-${i}${j}-b${block}-m${mirror}`,
            gameType: 'chess',
            locale,
            seed: 42,
            block,
            rotation: mirror,
            models: mirror ? [j, i] : [i, j],
          });
    for (let block = 2; block < 14; block++)
      for (let mirror = 0; mirror < 2; mirror++)
        jobs.push({
          id: `xiangqi-zh-${i}${j}-b${block}-m${mirror}`,
          gameType: 'xiangqi',
          locale: 'zh',
          seed: 42,
          block,
          rotation: mirror,
          models: mirror ? [j, i] : [i, j],
        });
  }
for (let block = 3; block < 21; block++)
  for (const locale of ['zh', 'en'] as const)
    for (let rotation = 0; rotation < 4; rotation++)
      jobs.push({
        id: `werewolf-${locale}-b${block}-r${rotation}`,
        gameType: 'werewolf',
        locale,
        seed: 930001 + 997 * block,
        block,
        rotation,
        models: [0, 1, 2, 3, 0, 1, 2, 3].map((m) => (m + rotation) % 4),
      });
// Randomize execution order independently of model identities and results.
let rng = 20260917;
for (let i = jobs.length - 1; i > 0; i--) {
  rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
  const j = rng % (i + 1);
  [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
}
const settings = {
  rsi: 'off',
  memoryEntries: 0,
  chatEnabled: true,
  contextEvents: 80,
  contextChatMessages: 40,
  temperature: 0.6,
  outputLimit: 8192,
  apiTimeoutMs: 180000,
  maxAttemptsPerDecision: 2,
  maxDecisions: { chess: 160, xiangqi: 160, werewolf: 200 },
  gameConcurrency: 96,
  perModelConcurrency: 24,
  heuristicFallback: false,
  protocolAdapter: 'none',
};
const sources = [
  'scripts/run-game-baselines.ts',
  'scripts/experiment-support.ts',
  'server/agents.ts',
  'server/config.ts',
  'src/types.ts',
  'src/chat.ts',
  'src/games/core.ts',
  'src/games/catalog.ts',
  'src/games/registry.ts',
  'src/games/base.ts',
  'src/games/chess.ts',
  'src/games/werewolf.ts',
  'src/games/werewolf-labels.ts',
  'src/games/xiangqi.ts',
];
const gameTypes = ['chess', 'xiangqi', 'werewolf'] as const;
const experimentRoot = resolve('artifacts/game-baselines-20260917');
// The original campaign is immutable historical evidence, not the new report location.
const original = JSON.parse(
  readFileSync('artifacts/multigame-20260916/public-archive/plan.json', 'utf8'),
);
const previous = JSON.parse(
  readFileSync('artifacts/multigame-20260916/public-archive/results.json', 'utf8'),
);
for (const [file, hash] of Object.entries(original.sourceHashes)) assert.equal(sha256(file), hash);
const {
  gameConcurrency: _oldGames,
  perModelConcurrency: _oldModels,
  ...oldProtocol
} = original.settings;
const { gameConcurrency: _newGames, perModelConcurrency: _newModels, ...protocol } = settings;
assert.deepEqual(protocol, oldProtocol, 'Keep the completed baseline decision protocol.');
const plans = Object.fromEntries(
  gameTypes.map((gameType) => {
    const prior = original.jobs.filter((j: Job) => j.gameType === gameType);
    const added = jobs.filter((j) => j.gameType === gameType);
    const pilot = previous.pilot.games.filter((j: any) => j.gameType === gameType);
    const validation = previous.validation.checks.filter((j: any) => j.gameType === gameType);
    const originalValidation = previous.originalValidation.checks.filter(
      (j: any) => j.gameType === gameType,
    );
    const auxiliary = pilot.length + validation.length + originalValidation.length;
    assert.equal(prior.length, 24);
    assert.equal(added.length, 144);
    assert(168 + auxiliary <= 200);
    return [
      gameType,
      {
        campaign: `${gameType}-20260917`,
        gameType,
        createdAt: new Date().toISOString(),
        models: expectedModels,
        modelLabels,
        baselineGames: 168,
        addedGames: 144,
        hardGameLimit: 200,
        budget: {
          baseline: 168,
          pilot: pilot.length,
          validation4096: originalValidation.length,
          validation8192: validation.length,
          totalGames: 168 + auxiliary,
          unused: 200 - 168 - auxiliary,
        },
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        sourceHashes: Object.fromEntries(sources.map((file) => [file, sha256(file)])),
        rule: GAME_CATALOG[gameType].rulesVersion,
        settings,
        cohorts: [
          { id: 'initial-20260916', settings: original.settings, games: 24 },
          { id: 'extension-20260917', settings, games: 144 },
        ],
        jobs: [
          ...prior.map((j: Job) => ({ ...j, cohort: 'initial-20260916' })),
          ...added.map((j) => ({ ...j, cohort: 'extension-20260917' })),
        ],
        auxiliaryGames: { pilot, validation, originalValidation },
        notes: [
          'Failed and interrupted attempts count toward the per-game cap.',
          'Board games repeat the standard initial position; seeds do not randomize openings.',
          'Decision protocol unchanged; extension uses a shared 96-game / 24-per-model request pool.',
          'Original roles/languages and new blocks are analyzed with cohort-specific counts.',
        ],
      },
    ];
  }),
);
const agentsFor = (job: Job): AgentConfig[] =>
  job.models.map((m, seat) => ({
    id: `${job.id}-seat${seat}`,
    name: `${modelLabels[m]} ${seat + 1}`,
    hero: '张飞',
    kind: 'llm',
    provider: 'experiment-yh',
    model: expectedModels[m],
    rsi: 'off',
  }));
assert.equal(jobs.length, 432);
assert.equal(new Set(jobs.map((j) => j.id)).size, 432);
for (const type of ['chess', 'xiangqi', 'werewolf'])
  assert.equal(jobs.filter((j) => j.gameType === type).length, 144);
for (const type of ['chess', 'xiangqi'])
  for (let model = 0; model < 4; model++)
    for (let seat = 0; seat < 2; seat++)
      assert.equal(jobs.filter((j) => j.gameType === type && j.models[seat] === model).length, 36);
const wolfCounts = Array.from({ length: 4 }, () => ({}) as Record<string, number>);
for (const job of jobs.filter((j) => j.gameType === 'werewolf')) {
  const e = gamePlugin('werewolf').create(job.id, agentsFor(job), job.seed, job.locale);
  for (const p of e.s.players)
    wolfCounts[job.models[p.seat]][p.role] = (wolfCounts[job.models[p.seat]][p.role] ?? 0) + 1;
}
for (const count of wolfCounts)
  for (const [role, n] of Object.entries(wolfCounts[0])) assert.equal(count[role], n);
for (const gameType of gameTypes) {
  const planFile = resolve(`exp/${gameType}/plan.json`);
  const plan = plans[gameType];
  if (existsSync(planFile)) {
    const saved = JSON.parse(readFileSync(planFile, 'utf8'));
    assert.deepEqual(saved.sourceHashes, plan.sourceHashes, 'Experiment sources changed.');
    assert.deepEqual(saved.settings, plan.settings);
    assert.deepEqual(saved.jobs, plan.jobs);
    assert.deepEqual(saved.budget, plan.budget);
  } else atomicJSON(planFile, plan);
}
if (process.argv.includes('--check')) {
  for (const job of jobs) {
    let e = gamePlugin(job.gameType).create(job.id, agentsFor(job), job.seed, job.locale);
    e.start();
    for (let step = 0; step < 12 && e.s.status === 'playing'; step++) {
      const input = agentInput(e.view(e.actor), e.visibleHistory(e.actor), [], settings);
      const d = gamePlugin(job.gameType).heuristic(input.observation);
      e.apply(d.actionId, e.s.revision, d.cardIds, d.speech);
      const restored = restoreEngine(structuredClone(e.s));
      restored.events = structuredClone(e.events);
      assert.deepEqual(restored.view(restored.actor), e.view(e.actor));
      e = restored;
    }
  }
  console.log(
    JSON.stringify({
      checked: true,
      baselineGames: jobs.length,
      budgets: Object.fromEntries(gameTypes.map((t) => [t, plans[t].budget])),
      wolfRolesPerModel: wolfCounts[0],
    }),
  );
  process.exit(0);
}
const provider = experimentProvider();
const meter = instrumentProvider(provider, settings.perModelConcurrency);
const output = experimentRoot;
for (const folder of ['games', 'checkpoints']) mkdirSync(join(output, folder), { recursive: true });
const requestFile = join(output, 'requests.json');
if (existsSync(requestFile)) meter.records.push(...JSON.parse(readFileSync(requestFile, 'utf8')));
const controller = new AbortController();
let stopping = false;
const active = new Map<string, any>();
const completed = new Map<string, any>();
let nextJob = 0;
for (const job of jobs) {
  const file = join(output, 'games', `${job.id}.json.gz`);
  if (existsSync(file))
    completed.set(job.id, JSON.parse(gunzipSync(readFileSync(file)).toString()));
}
const packed = (file: string, record: unknown) => {
  writeFileSync(`${file}.tmp`, gzipSync(JSON.stringify(record), { level: 1 }));
  renameSync(`${file}.tmp`, file);
};
function progress() {
  const rows = [...completed.values()];
  const data = {
    at: new Date().toISOString(),
    planned: jobs.length,
    completed: rows.length,
    normal: rows.filter((r) => r.status === 'finished').length,
    errors: rows.filter((r) => r.status === 'error').length,
    requests: meter.records.length,
    byGame: Object.fromEntries(
      gameTypes.map((type) => [
        type,
        {
          planned: 144,
          recorded: rows.filter((r) => r.job.gameType === type).length,
          finished: rows.filter((r) => r.job.gameType === type && r.status === 'finished').length,
          errors: rows.filter((r) => r.job.gameType === type && r.status === 'error').length,
          active: [...active.values()].filter((r) => r.job.gameType === type).length,
        },
      ]),
    ),
    active: [...active.values()].map((r) => ({
      id: r.job.id,
      decisions: r.actions.length,
      model: r.actorModel,
      round: r.round,
    })),
  };
  atomicJSON(join(output, 'progress.json'), data);
  atomicJSON(requestFile, meter.records);
  console.log(JSON.stringify({ ...data, active: data.active.length }));
}
const timer = setInterval(progress, 30000);
const stop = () => {
  stopping = true;
  controller.abort();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
async function run(job: Job) {
  if (completed.has(job.id) || stopping) return;
  const checkpoint = join(output, 'checkpoints', `${job.id}.json.gz`);
  const prior = existsSync(checkpoint)
    ? JSON.parse(gunzipSync(readFileSync(checkpoint)).toString())
    : null;
  const engine: GameEngine = prior
    ? restoreEngine(prior.state)
    : gamePlugin(job.gameType).create(job.id, agentsFor(job), job.seed, job.locale);
  if (prior) engine.events = prior.events;
  else engine.start();
  const record: any = prior ?? {
    job,
    startedAt: new Date().toISOString(),
    status: 'running',
    actions: [],
    calls: [],
    runMs: 0,
  };
  delete record.state;
  delete record.events;
  const segmentStart = Date.now();
  active.set(job.id, record);
  const save = () =>
    packed(checkpoint, {
      ...record,
      runMs: record.runMs + Date.now() - segmentStart,
      state: engine.s,
      events: engine.events,
    });
  save();
  try {
    while (engine.s.status === 'playing' && !stopping) {
      if (existsSync(join(output, 'STOP'))) {
        stop();
        break;
      }
      if (
        record.actions.length >=
        settings.maxDecisions[job.gameType as keyof typeof settings.maxDecisions]
      ) {
        engine.finish(
          job.locale === 'en' ? 'draw' : '平局',
          job.locale === 'en' ? 'Decision limit reached' : '达到配置的决策上限',
        );
        break;
      }
      const seat = engine.actor,
        model = expectedModels[job.models[seat]];
      record.actorModel = model;
      record.round = engine.s.round;
      const input = agentInput(engine.view(seat), engine.visibleHistory(seat), [], settings);
      assert.equal(input.memory.length, 0);
      const actions = input.observation.legalActions;
      assert(actions.length > 0);
      const forced = !engine.requiresDecision && actions.length === 1;
      let decision: Decision | undefined;
      if (forced) decision = { actionId: actions[0].id, reason: 'Only legal action', speech: '' };
      else {
        const earlier = record.calls.filter((c: any) => c.revision === engine.s.revision);
        let lastError = earlier.at(-1)?.error ?? '';
        if (earlier.at(-1)?.ok) {
          decision = DecisionSchema.parse(earlier.at(-1).content);
          engine.resolveAction(decision.actionId, decision.cardIds);
        }
        for (
          let attempt = earlier.length;
          !decision && attempt < settings.maxAttemptsPerDecision && !stopping;
          attempt++
        ) {
          const messages = decisionMessages(input);
          if (attempt)
            messages.push({
              role: 'user',
              content:
                job.locale === 'en'
                  ? 'Invalid response. Choose an exact legalActions actionId and return valid JSON.'
                  : '上次响应无效。请仅选择本次 legalActions 中存在的 actionId，返回正确 JSON。',
            });
          let output: Awaited<ReturnType<typeof callModel>> | undefined;
          const started = Date.now();
          try {
            output = await callModel(
              provider,
              model,
              messages,
              settings.apiTimeoutMs,
              controller.signal,
              settings.outputLimit,
            );
            decision = DecisionSchema.parse(output.content);
            engine.resolveAction(decision.actionId, decision.cardIds);
            record.calls.push({
              seat,
              revision: engine.s.revision,
              attempt,
              input: messages,
              ...output,
              model,
              ok: true,
            });
            save();
            break;
          } catch (error) {
            if (stopping) break;
            lastError = redact(error, provider);
            record.calls.push({
              seat,
              revision: engine.s.revision,
              attempt,
              input: messages,
              ...(output ?? (error instanceof ModelOutputError ? error.output : {})),
              model,
              latencyMs: output?.latencyMs ?? Date.now() - started,
              ok: false,
              error: lastError,
            });
            decision = undefined;
            save();
            if (/HTTP (401|403)/.test(lastError)) {
              atomicJSON(join(experimentRoot, 'STOP'), {
                at: new Date().toISOString(),
                reason: lastError,
              });
              stop();
              break;
            }
          }
        }
        if (stopping) break;
        if (!decision) throw new Error(`Model decision failed: ${model}: ${lastError}`);
      }
      if (!decision) break;
      const revision = engine.s.revision;
      const action = engine.resolveAction(decision.actionId, decision.cardIds);
      engine.apply(decision.actionId, revision, decision.cardIds, decision.speech);
      record.actions.push({
        seat,
        model,
        revision,
        afterRevision: engine.s.revision,
        source: forced ? 'forced' : 'llm',
        action,
        decision,
      });
      save();
    }
    record.status = engine.s.status === 'finished' ? 'finished' : 'interrupted';
  } catch (error) {
    record.status = 'error';
    record.error = redact(error, provider);
  }
  record.runMs += Date.now() - segmentStart;
  record.state = engine.s;
  record.events = engine.events;
  record.winner = engine.s.winner;
  record.reason = engine.s.reason;
  record.players = engine.s.players.map((p) => ({
    ...p,
    model: expectedModels[job.models[p.seat]],
    won: engine.s.outcome?.winners.includes(p.agentId) ?? false,
  }));
  if (record.status === 'interrupted') {
    packed(checkpoint, record);
  } else {
    record.endedAt = new Date().toISOString();
    packed(join(output, 'games', `${job.id}.json.gz`), record);
    completed.set(job.id, record);
    console.log(
      JSON.stringify({
        gameDone: job.id,
        status: record.status,
        decisions: record.actions.length,
        winner: record.winner,
        error: record.error,
      }),
    );
  }
  active.delete(job.id);
}
try {
  await Promise.all(
    Array.from({ length: settings.gameConcurrency }, async () => {
      while (nextJob < jobs.length && !stopping) {
        const job = jobs[nextJob++];
        await gameTrace.run(job.id, () => run(job));
      }
    }),
  );
} finally {
  clearInterval(timer);
  progress();
  meter.restore();
}
if (stopping) process.exitCode = 130;
