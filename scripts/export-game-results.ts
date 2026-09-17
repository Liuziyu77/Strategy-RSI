/** Export each game's baseline with offline legality, visibility and empty-memory audits. No API calls. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { agentInput, DecisionSchema } from '../server/agents';
import { gamePlugin } from '../src/games/registry';
import type { AgentConfig } from '../src/types';
import { atomicJSON, modelLabels, sha256 } from './experiment-support';
const partial = process.argv.includes('--partial') || process.argv.includes('--audit-progress');
const oldRoot = resolve('artifacts/multigame-20260916');
const newRoot = resolve('artifacts/game-baselines-20260917');
const readJSON = (file: string, fallback: any = null) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const historical = readJSON(join(oldRoot, 'public-archive/results.json'));
const allRequests = [
  ...readJSON(join(oldRoot, 'baseline/requests.json'), []),
  ...readJSON(join(newRoot, 'requests.json'), []),
];
const gameTypes = ['chess', 'xiangqi', 'werewolf'];
const gameArgument = process.argv.indexOf('--game');
const selectedGame = gameArgument === -1 ? null : process.argv[gameArgument + 1];
assert(
  gameArgument === -1 || gameTypes.includes(selectedGame ?? ''),
  'Use --game chess|xiangqi|werewolf.',
);
for (const type of selectedGame ? [selectedGame] : gameTypes) {
  const output = resolve(
    partial ? `artifacts/game-baselines-20260917/preview/${type}` : `exp/${type}`,
  );
  const plan = readJSON(`exp/${type}/plan.json`);
  const rawFile = (job: any) =>
    join(
      job.cohort === 'initial-20260916' ? join(oldRoot, 'baseline') : newRoot,
      'games',
      `${job.id}.json.gz`,
    );
  const rows: any[] = plan.jobs
    .filter((j: any) => existsSync(rawFile(j)))
    .map((j: any) => JSON.parse(gunzipSync(readFileSync(rawFile(j))).toString()));
  const ids = new Set(rows.map((r) => r.job.id));
  const requests = allRequests.filter((r) => ids.has(r.job));
  assert.equal(plan.jobs.length, 168);
  assert(plan.budget.totalGames <= 200);
  if (!partial) {
    assert.equal(rows.length, 168, 'Finish every scheduled game before publishing.');
    for (const [file, hash] of Object.entries(plan.sourceHashes)) assert.equal(sha256(file), hash);
  }
  const labelAsId = (call: any) => {
    if (call.ok || typeof call.content?.actionId !== 'string') return false;
    return JSON.parse(call.input[1].content).observation.legalActions.some(
      (a: any) => a.label === call.content.actionId && a.id !== call.content.actionId,
    );
  };
  const audits: any[] = [];
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
  if (!partial || process.argv.includes('--audit-progress')) {
    const auditVersion = sha256('scripts/export-game-results.ts');
    for (const row of rows) {
      const job = plan.jobs.find((j: any) => j.id === row.job.id);
      const rawHash = sha256(rawFile(job));
      const cacheFile = join(newRoot, 'audits', `${job.id}.json`);
      const cached = readJSON(cacheFile);
      if (
        cached?.rawHash === rawHash &&
        cached?.auditVersion === auditVersion &&
        JSON.stringify(cached?.sourceHashes) === JSON.stringify(plan.sourceHashes)
      )
        audits.push(cached.audit);
      else {
        const result = audit(row);
        atomicJSON(cacheFile, {
          rawHash,
          auditVersion,
          sourceHashes: plan.sourceHashes,
          audit: result,
        });
        audits.push(result);
      }
    }
  }
  const summaries = rows.map((r) => {
    const own = requests.filter((request: any) => request.job === r.job.id);
    return {
      id: r.job.id,
      gameType: r.job.gameType,
      cohort: plan.jobs.find((j: any) => j.id === r.job.id).cohort,
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
      behaviour: plan.models.map((model: string) => {
        const actions = r.actions.filter((a: any) => a.source === 'llm' && a.model === model);
        const speaking = actions.filter((a: any) =>
          r.events.some(
            (e: any) => e.type === 'chat' && e.seq > a.revision && e.seq <= a.afterRevision,
          ),
        );
        return { model, decisions: actions.length, speaking: speaking.length };
      }),
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

  const complete = rows.length === 168 && !partial;
  const verification = {
    allPassed: complete,
    games: audits.length,
    actions: audits.reduce((n, r) => n + r.actions, 0),
    modelInputs: audits.reduce((n, r) => n + r.modelInputs, 0),
    details: audits,
  };
  const reliability = plan.models.map((model: string) => {
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
        [...new Set(rejected.map((c) => c.error))].map((e) => [
          e,
          rejected.filter((c) => c.error === e).length,
        ]),
      ),
    };
  });
  const validation = {
    ...historical.validation,
    checks: historical.validation.checks.filter((c: any) => c.gameType === type),
  };
  delete validation.plannedGames;
  delete validation.actualGames;
  delete validation.ok;
  validation.actualGames = validation.checks.length;
  validation.ok = validation.checks.every((c: any) => c.ok);
  const originalValidation = {
    ...historical.originalValidation,
    checks: historical.originalValidation.checks.filter((c: any) => c.gameType === type),
  };
  delete originalValidation.plannedGames;
  delete originalValidation.actualGames;
  delete originalValidation.unstartedGames;
  delete originalValidation.ok;
  originalValidation.actualGames = originalValidation.checks.length;
  const auxiliaryUsage = {
    pilot4096: totals(
      readJSON(join(oldRoot, 'pilot-4096/requests.json'), []).filter((r: any) =>
        r.job.startsWith(type + '-'),
      ),
    ),
    validation4096: totals(
      readJSON(join(oldRoot, 'validation-requests.json'), []).filter((r: any) =>
        r.job.startsWith('validation-' + type + '-'),
      ),
    ),
    validation8192: totals(
      readJSON(join(oldRoot, 'validation-8192/validation-requests.json'), []).filter((r: any) =>
        r.job.startsWith('validation-' + type + '-'),
      ),
    ),
    consolidationRecovery: totals(
      readJSON(join(oldRoot, 'consolidation-recovery-requests.json'), []).filter((r: any) =>
        r.job.startsWith('recovery-live-validation-' + type + '-'),
      ),
    ),
  };
  const data = {
    campaign: plan.campaign,
    gameType: type,
    generatedAt: new Date().toISOString(),
    complete,
    models: plan.models,
    names: plan.modelLabels,
    settings: plan.settings,
    budget: plan.budget,
    plannedBaseline: 168,
    recordedBaseline: rows.length,
    totalRecordedGames: rows.length + plan.budget.totalGames - 168,
    cohorts: plan.cohorts.map((c: any) => ({
      ...c,
      recorded: summaries.filter((g) => g.cohort === c.id).length,
      finished: summaries.filter((g) => g.cohort === c.id && g.status === 'finished').length,
      errors: summaries.filter((g) => g.cohort === c.id && g.status === 'error').length,
    })),
    games: summaries,
    aggregate: metrics(type),
    byLanguage: [...new Set(plan.jobs.map((j: any) => j.locale))].map((locale) =>
      metrics(type, String(locale)),
    ),
    baselineUsage: totals(requests),
    usageByModel: plan.models.map((model: string) => ({
      model,
      ...totals(requests.filter((r) => r.model === model)),
    })),
    reliabilityByModel: reliability,
    validation,
    originalValidation,
    pilot: {
      settings: historical.pilot.settings,
      games: historical.pilot.games.filter((g: any) => g.gameType === type),
    },
    consolidationRecovery: type === 'werewolf' ? historical.consolidationRecovery : null,
    auxiliaryUsage,
    verification,
    accountingNotes: [
      'Only unique started game IDs count as games; checkpoint resumes do not reset the board or create replacements.',
      'Token totals include reported baseline usage, retries, errors and aborted requests; missing provider usage is not imputed.',
      'Connectivity probes and the consolidation replay are shared diagnostics and add zero games.',
      'Pilot and RSI-check token totals are reported separately; the original interrupted validation has incomplete usage.',
    ],
  };
  mkdirSync(output, { recursive: true });
  atomicJSON(join(output, 'results.json'), data);
  const historyFile = join(output, 'games-history.json.gz');
  writeFileSync(
    historyFile,
    gzipSync(
      JSON.stringify({
        campaign: plan.campaign,
        gameType: type,
        scope:
          'Omniscient research archive, including private roles, messages, reasoning and final state; never an Agent input.',
        games: rows.map((r) => ({
          job: { ...r.job, cohort: plan.jobs.find((j: any) => j.id === r.job.id).cohort },
          status: r.status,
          error: r.error ?? null,
          startedAt: r.startedAt,
          endedAt: r.endedAt,
          durationMs: r.runMs,
          players: r.players,
          actions: r.actions,
          events: r.events,
          finalState: r.state,
        })),
      }),
    ),
  );
  atomicJSON(join(output, 'provenance.json'), {
    generatedAt: data.generatedAt,
    planSha256: sha256(`exp/${type}/plan.json`),
    sourceSnapshotSha256: sha256(`exp/${type}/source-snapshot.tar.gz`),
    exportScriptSha256: sha256('scripts/export-game-results.ts'),
    amendmentsSha256: sha256(`exp/${type}/amendments.json`),
    rawFiles: plan.jobs
      .filter((j: any) => existsSync(rawFile(j)))
      .map((j: any) => ({ id: j.id, cohort: j.cohort, sha256: sha256(rawFile(j)) })),
    publishedFiles: [
      { file: 'results.json', sha256: sha256(join(output, 'results.json')) },
      { file: 'games-history.json.gz', sha256: sha256(historyFile) },
    ],
  });
  console.log(
    JSON.stringify({
      exported: output,
      recorded: rows.length,
      finished: data.aggregate.finished,
      errors: data.aggregate.errors,
      auditedActions: verification.actions,
      auditedInputs: verification.modelInputs,
    }),
  );
}
