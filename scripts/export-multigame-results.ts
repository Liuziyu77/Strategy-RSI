/** Offline verification and publication of the fixed 72-game baseline. Never calls a model. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { agentInput, DecisionSchema } from '../server/agents';
import { gamePlugin } from '../src/games/registry';
import type { AgentConfig } from '../src/types';
import { atomicJSON, experimentRoot, modelLabels, sha256 } from './experiment-support';

const partial = process.argv.includes('--partial');
const output = resolve(partial ? 'artifacts/multigame-20260916/preview' : 'exp/multigame');
const rawRoot = join(experimentRoot, 'baseline');
const plan = JSON.parse(readFileSync('exp/multigame/plan.json', 'utf8'));
const validationFile = join(experimentRoot, 'validation-8192', 'validation.json');
const validation = existsSync(validationFile)
  ? JSON.parse(readFileSync(validationFile, 'utf8'))
  : null;
const readJSON = (file: string, fallback: any = null) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const originalValidation = readJSON(join(experimentRoot, 'validation.json'));
const consolidationRecovery = readJSON(join(experimentRoot, 'consolidation-recovery.json'));
const pilotRoot = join(experimentRoot, 'pilot-4096');
const pilotFiles = readdirSync(join(pilotRoot, 'checkpoints')).filter((f) =>
  f.endsWith('.json.gz'),
);
const pilot = pilotFiles.map((file) => {
  const final = join(pilotRoot, 'games', file);
  const row = JSON.parse(
    gunzipSync(
      readFileSync(existsSync(final) ? final : join(pilotRoot, 'checkpoints', file)),
    ).toString(),
  );
  return {
    id: row.job.id,
    gameType: row.job.gameType,
    locale: row.job.locale,
    status: row.status,
    decisions: row.actions.length,
    error: row.error ?? null,
    attempts: row.calls.length,
    rejectedAttempts: row.calls.filter((c: any) => !c.ok).length,
    sha256: sha256(existsSync(final) ? final : join(pilotRoot, 'checkpoints', file)),
  };
});
const requests = existsSync(join(rawRoot, 'requests.json'))
  ? JSON.parse(readFileSync(join(rawRoot, 'requests.json'), 'utf8'))
  : [];
const rows: any[] = [];
const labelAsId = (call: any) => {
  if (call.ok || typeof call.content?.actionId !== 'string') return false;
  const input = JSON.parse(call.input[1].content);
  return input.observation.legalActions.some(
    (a: any) => a.label === call.content.actionId && a.id !== call.content.actionId,
  );
};
for (const job of plan.jobs) {
  const file = join(rawRoot, 'games', `${job.id}.json.gz`);
  if (existsSync(file)) rows.push(JSON.parse(gunzipSync(readFileSync(file)).toString()));
}
if (!partial) {
  assert.equal(rows.length, 72, 'All scheduled baseline games must have final records.');
  assert.equal(validation?.checks.length, 10, 'All ten validation matches must be recorded.');
  assert(validation.auditedAt, 'Run the offline validation audit before exporting.');
  assert.equal(originalValidation?.checks.length, 6);
  assert(originalValidation.auditedAt, 'Audit the original validation too.');
  assert.equal(originalValidation.actualGames, 6);
  assert.equal(originalValidation.unstartedGames, 4);
  assert.equal(validation.actualGames, 10);
  assert(consolidationRecovery?.ok, 'The consolidation regression recovery must be recorded.');
  for (const [file, hash] of Object.entries(plan.sourceHashes)) assert.equal(sha256(file), hash);
}
assert.equal(plan.totalPlannedGames, 103);
assert.equal(pilot.length, 11);
assert(plan.totalPlannedGames <= 200);
const audits = [];
function audit(record: any) {
  const job = record.job;
  const agents: AgentConfig[] = job.models.map((m: number, seat: number) => ({
    id: `${job.id}-seat${seat}`,
    name: `${modelLabels[m]} ${seat + 1}`,
    hero: '张飞',
    kind: 'llm',
    provider: 'experiment-yh',
    model: plan.models[m],
    rsi: 'off',
  }));
  const engine = gamePlugin(job.gameType).create(job.id, agents, job.seed, job.locale);
  engine.start();
  let inputs = 0;
  const checkInputs = () => {
    engine.events = structuredClone(
      record.events.filter((event: any) => event.seq <= engine.s.revision),
    );
    const expected = agentInput(
      engine.view(engine.actor),
      engine.visibleHistory(engine.actor),
      [],
      plan.settings,
    );
    for (const call of record.calls.filter((c: any) => c.revision === engine.s.revision)) {
      assert.equal(call.seat, engine.actor);
      assert.equal(call.model, plan.models[job.models[call.seat]]);
      assert.deepEqual(
        JSON.parse(call.input[1].content),
        expected,
        `${job.id}: visible context mismatch at ${engine.s.revision}`,
      );
      inputs++;
    }
  };
  for (const step of record.actions) {
    assert.equal(step.revision, engine.s.revision);
    checkInputs();
    const legal = engine.legalActions();
    if (step.source === 'forced') assert(!engine.requiresDecision && legal.length === 1);
    else {
      assert.equal(step.source, 'llm');
      const accepted = record.calls.find((c: any) => c.ok && c.revision === step.revision);
      assert(accepted, 'Every model move needs an accepted response.');
      assert.deepEqual(DecisionSchema.parse(accepted.content), step.decision);
    }
    engine.apply(
      step.decision.actionId,
      engine.s.revision,
      step.decision.cardIds,
      step.decision.speech,
    );
    assert.equal(step.afterRevision, engine.s.revision);
  }
  if (engine.s.status === 'playing') checkInputs();
  if (engine.s.status === 'playing' && record.status === 'finished') {
    assert.equal(record.actions.length, plan.settings.maxDecisions[job.gameType]);
    assert(['达到配置的决策上限', 'Decision limit reached'].includes(record.reason));
    engine.finish(record.winner, record.reason);
  }
  assert.deepEqual(engine.s, record.state, `${job.id}: final state mismatch`);
  assert.equal(inputs, record.calls.length);
  return {
    id: job.id,
    actions: record.actions.length,
    modelInputs: inputs,
    legalReplay: true,
    visibleContext: true,
    emptyMemory: true,
    finalState: true,
  };
}
for (const row of rows) audits.push(audit(row));
const summaries = rows.map((r) => {
  const own = requests.filter((request: any) => request.job === r.job.id);
  return {
    id: r.job.id,
    gameType: r.job.gameType,
    locale: r.job.locale,
    block: r.job.block,
    seed: r.job.seed,
    rotation: r.job.rotation,
    status: r.status,
    winner: r.winner,
    reason: r.reason,
    error: r.error ?? null,
    draw: r.status === 'finished' && r.state.outcome?.draw === true,
    decisionLimit: ['达到配置的决策上限', 'Decision limit reached'].includes(r.reason),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationMs: r.runMs,
    decisions: r.actions.length,
    modelDecisions: r.actions.filter((a: any) => a.source === 'llm').length,
    forcedActions: r.actions.filter((a: any) => a.source === 'forced').length,
    modelAttempts: r.calls.length,
    rejectedAttempts: r.calls.filter((c: any) => !c.ok).length,
    rejections: r.calls
      .filter((c: any) => !c.ok)
      .map((c: any) => ({
        model: c.model,
        revision: c.revision,
        attempt: c.attempt,
        error: c.error,
        finishReason: c.finishReason ?? null,
        selectedActionId: c.content?.actionId ?? null,
        usedLabelAsId: labelAsId(c),
      })),
    httpRequests: own.length,
    httpErrors: own.filter((c: any) => c.status !== 200).length,
    publicMessages: r.events.filter((e: any) => e.type === 'chat' && !e.visibleTo).length,
    teamMessages: r.events.filter((e: any) => e.type === 'chat' && e.visibleTo).length,
    players: r.players.map((p: any) => ({
      seat: p.seat,
      model: p.model,
      role: p.role,
      alive: p.alive,
      won: p.won,
    })),
  };
});
function metrics(type: string, locale?: string) {
  const games = summaries.filter((g) => g.gameType === type && (!locale || g.locale === locale));
  const complete = games.filter((g) => g.status === 'finished');
  const byModel = plan.models.map((model: string) => {
    const seats = complete.flatMap((g) =>
      g.players
        .filter((p: any) => p.model === model)
        .map((p: any) => ({ ...p, draw: g.draw, gameId: g.id })),
    );
    const wins = seats.filter((p: any) => p.won).length,
      draws = seats.filter((p: any) => p.draw).length;
    const successIds = new Set(complete.map((g) => g.id));
    const plays = rows
      .filter((r) => successIds.has(r.job.id))
      .flatMap((r) =>
        r.actions
          .filter((a: any) => a.source === 'llm' && a.model === model)
          .map((a: any) => ({
            action: a,
            events: r.events.filter((e: any) => e.seq > a.revision && e.seq <= a.afterRevision),
          })),
      );
    const messages = plays.filter((p) => p.events.some((e: any) => e.type === 'chat')).length;
    return {
      model,
      participations: seats.length,
      distinctGames: new Set(seats.map((p: any) => p.gameId)).size,
      wins,
      draws,
      losses: seats.length - wins - draws,
      winRate: seats.length ? wins / seats.length : null,
      score: seats.length ? (wins + 0.5 * draws) / seats.length : null,
      modelDecisions: plays.length,
      speakingDecisions: messages,
      speechRate: plays.length ? messages / plays.length : null,
      roles: Object.fromEntries(
        [...new Set(seats.map((p: any) => p.role))].map((role) => {
          const subset = seats.filter((p: any) => p.role === role);
          return [
            role,
            {
              n: subset.length,
              wins: subset.filter((p: any) => p.won).length,
              draws: subset.filter((p: any) => p.draw).length,
            },
          ];
        }),
      ),
    };
  });
  const durations = complete.map((g) => g.durationMs).sort((a, b) => a - b);
  const n = durations.length;
  return {
    gameType: type,
    locale: locale ?? 'all',
    planned: plan.jobs.filter((g: any) => g.gameType === type && (!locale || g.locale === locale))
      .length,
    recorded: games.length,
    finished: complete.length,
    errors: games.length - complete.length,
    wins: complete.filter((g) => !g.draw).length,
    draws: complete.filter((g) => g.draw).length,
    decisionLimitDraws: complete.filter((g) => g.decisionLimit).length,
    ruleDraws: complete.filter((g) => g.draw && !g.decisionLimit).length,
    medianDurationMs: n
      ? (durations[Math.floor((n - 1) / 2)] + durations[Math.floor(n / 2)]) / 2
      : null,
    models: byModel,
  };
}
const totals = (records: any[]) => ({
  requests: records.length,
  httpErrors: records.filter((r) => r.status !== 200).length,
  usageReported: records.filter((r) => r.usage).length,
  promptTokens: records.reduce((n, r) => n + Number(r.usage?.prompt_tokens ?? 0), 0),
  completionTokens: records.reduce((n, r) => n + Number(r.usage?.completion_tokens ?? 0), 0),
  lengthLimited: records.filter((r) => r.finishReason === 'length').length,
});
const probes = readJSON(join(experimentRoot, 'probes.json'));
const diagnostics = readJSON(join(experimentRoot, 'output-limit-diagnostics.json'));
const usageGroups = {
  baseline: requests,
  validation8192: readJSON(join(experimentRoot, 'validation-8192', 'validation-requests.json'), []),
  validation4096: readJSON(join(experimentRoot, 'validation-requests.json'), []),
  pilot4096: readJSON(join(pilotRoot, 'requests.json'), []),
  connectivity: (probes?.rows ?? []).map((r: any) => ({ ...r, status: r.ok ? 200 : 0 })),
  outputDiagnostics: (diagnostics?.rows ?? []).map((r: any) => ({ ...r, status: r.ok ? 200 : 0 })),
  consolidationRecovery: readJSON(join(experimentRoot, 'consolidation-recovery-requests.json'), []),
};
const data = {
  campaign: plan.campaign,
  generatedAt: new Date().toISOString(),
  complete: !partial,
  models: plan.models,
  names: modelLabels,
  plannedBaseline: 72,
  recordedBaseline: rows.length,
  plannedValidation: 10,
  recordedValidation: validation?.checks.length ?? 0,
  totalPlannedGames: plan.totalPlannedGames,
  amendments: readJSON('exp/multigame/amendments.json'),
  expectedActualGames: 99,
  totalRecordedGames:
    rows.length +
    (validation?.checks.length ?? 0) +
    (originalValidation?.checks.length ?? 0) +
    pilot.length,
  campaignUsage: totals(Object.values(usageGroups).flat()),
  usageByPhase: Object.fromEntries(
    Object.entries(usageGroups).map(([name, values]) => [name, totals(values)]),
  ),
  connectivity: probes,
  outputLimitDiagnostics: diagnostics,
  pilot: { games: pilot, settings: readJSON('exp/multigame/pilot/plan.json').settings },
  originalValidation,
  consolidationRecovery,
  settings: plan.settings,
  games: summaries,
  byGame: ['chess', 'xiangqi', 'werewolf'].map((type) => metrics(type)),
  byLanguage: [
    metrics('chess', 'zh'),
    metrics('chess', 'en'),
    metrics('xiangqi', 'zh'),
    metrics('werewolf', 'zh'),
    metrics('werewolf', 'en'),
  ],
  baselineUsage: totals(requests),
  usageByModel: plan.models.map((model: string) => ({
    model,
    ...totals(requests.filter((r: any) => r.model === model)),
  })),
  reliabilityByModel: plan.models.map((model: string) => {
    const calls = rows.flatMap((r) => r.calls.filter((c: any) => c.model === model));
    const rejected = calls.filter((c) => !c.ok);
    return {
      model,
      attempts: calls.length,
      accepted: calls.length - rejected.length,
      rejected: rejected.length,
      truncated: rejected.filter((c) => c.finishReason === 'length').length,
      illegalAction: rejected.filter((c) => /非法行动|Illegal action/.test(c.error)).length,
      usedLabelAsId: rejected.filter(labelAsId).length,
      errors: Object.fromEntries(
        [...new Set(rejected.map((c) => c.error))].map((error) => [
          error,
          rejected.filter((c) => c.error === error).length,
        ]),
      ),
    };
  }),
  validation: validation
    ? { ...validation, checks: validation.checks.map((c: any) => ({ ...c })) }
    : null,
  verification: {
    games: audits.length,
    actions: audits.reduce((n, r) => n + r.actions, 0),
    modelInputs: audits.reduce((n, r) => n + r.modelInputs, 0),
    allPassed: true,
    details: audits,
  },
};
mkdirSync(output, { recursive: true });
atomicJSON(join(output, 'results.json'), data);
const provenance: any = {
  generatedAt: data.generatedAt,
  planSha256: sha256('exp/multigame/plan.json'),
  exportScriptSha256: sha256('scripts/export-multigame-results.ts'),
  sourceSnapshotSha256: sha256('exp/multigame/source-snapshot.tar.gz'),
  validationRuntimeSnapshotSha256: sha256('exp/multigame/validation-runtime-snapshot.tar.gz'),
  amendmentsSha256: sha256('exp/multigame/amendments.json'),
  validationReportSha256: existsSync(validationFile) ? sha256(validationFile) : null,
  originalValidationReportSha256: existsSync(join(experimentRoot, 'validation.json'))
    ? sha256(join(experimentRoot, 'validation.json'))
    : null,
  rawFiles: rows.map((r) => ({
    id: r.job.id,
    sha256: sha256(join(rawRoot, 'games', `${r.job.id}.json.gz`)),
  })),
  publishedFiles: [],
};
for (const gameType of ['chess', 'xiangqi', 'werewolf']) {
  const histories = rows
    .filter((r) => r.job.gameType === gameType)
    .map((r) => ({
      job: r.job,
      status: r.status,
      error: r.error ?? null,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationMs: r.runMs,
      players: r.players,
      actions: r.actions,
      events: r.events,
      finalState: r.state,
    }));
  const file = `${gameType}-history.json.gz`;
  writeFileSync(
    join(output, file),
    gzipSync(
      JSON.stringify({
        campaign: plan.campaign,
        gameType,
        scope:
          'Omniscient research archive; includes private roles, messages and reasoning. Not an Agent input.',
        games: histories,
      }),
    ),
  );
  provenance.publishedFiles.push({ file, sha256: sha256(join(output, file)) });
}
provenance.publishedFiles.push({
  file: 'results.json',
  sha256: sha256(join(output, 'results.json')),
});
atomicJSON(join(output, 'provenance.json'), provenance);
console.log(
  JSON.stringify({
    exported: output,
    baselineGames: rows.length,
    validatedGames: validation?.checks.length ?? 0,
    replayedActions: data.verification.actions,
    verifiedModelInputs: data.verification.modelInputs,
  }),
);
