/** Replay the saved failure, then retry only failed consolidation jobs; creates no games. */
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Arena } from '../server/arena';
import { Store } from '../server/store';
import type { MatchConfig } from '../src/types';
import {
  atomicJSON,
  experimentProvider,
  experimentRoot,
  gameTrace,
  instrumentProvider,
  redact,
  sha256,
} from './experiment-support';

const root = join(experimentRoot, 'validation-8192');
const validation = JSON.parse(readFileSync(join(root, 'validation.json'), 'utf8'));
assert(validation.auditedAt && validation.checks.length === 10);
const provider = experimentProvider();
const targets = validation.checks.flatMap((row: any) =>
  row.consolidations
    .filter((job: any) => job.status === 'error')
    .map((job: any) => ({
      validationId: row.id,
      matchId: row.matchId,
      gameId: row.gameId,
      model: job.model,
    })),
);
const file = join(experimentRoot, 'consolidation-recovery.json');
const requestFile = join(experimentRoot, 'consolidation-recovery-requests.json');
const report: any = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : {
      startedAt: new Date().toISOString(),
      newGames: 0,
      note: 'Saved-response replay and live consolidation retry on copies of the completed validation database. Original validation results are unchanged.',
      sourceHashes: Object.fromEntries(
        ['server/consolidation.ts', 'scripts/verify-consolidation-recovery.ts'].map((name) => [
          name,
          sha256(name),
        ]),
      ),
      sourceValidationSha256: sha256(join(root, 'validation.json')),
      checks: [],
    };
const requests: any[] = existsSync(requestFile)
  ? JSON.parse(readFileSync(requestFile, 'utf8'))
  : [];
for (const mode of ['replay', 'live']) {
  const dataDir = join(experimentRoot, `consolidation-recovery-${mode}`);
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(join(dataDir, 'arena.sqlite')))
    copyFileSync(join(root, 'data', 'arena.sqlite'), join(dataDir, 'arena.sqlite'));
  const store = new Store(dataDir);
  const arena = new Arena(store, {
    providers: [provider],
    dataDir,
    host: '127.0.0.1',
    port: 0,
    adminToken: '',
  });
  try {
    for (const target of targets) {
      if (
        report.checks.some(
          (c: any) =>
            c.mode === mode && c.validationId === target.validationId && c.model === target.model,
        )
      )
        continue;
      const config: MatchConfig = store.match(target.matchId).config;
      const agent = config.agents.find((a) => a.model === target.model)!;
      const checkpoint = store.consolidationCheckpoint(agent.id, target.matchId);
      assert(checkpoint, 'The original failed job must remain available.');
      const failed = checkpoint.calls.find((c: any) => c.error && c.content) as any;
      assert(failed);
      const originals = store
        .memory(agent.id)
        .filter((m) => m.matchId === target.matchId && ['immediate', 'round'].includes(m.mode));
      const fetch = globalThis.fetch;
      let replayCalls = 0;
      const meter = mode === 'live' ? instrumentProvider(provider, 1) : null;
      if (mode === 'replay')
        globalThis.fetch = async (url, init) => {
          assert.equal(String(url), `${provider.baseUrl}/chat/completions`);
          const body = JSON.parse(String(init?.body));
          assert.deepEqual(body.messages, failed.input);
          replayCalls++;
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: failed.raw }, finish_reason: 'stop' }],
            }),
          );
        };
      let result: any;
      try {
        await gameTrace.run(`recovery-${mode}-${target.validationId}`, async () => {
          const job = arena.consolidator.start(agent.id, target.matchId);
          await arena.consolidator.jobs.get(`${agent.id}:${target.matchId}`);
          const completed = store.consolidations(agent.id).find((j) => j.id === job.id)!;
          const summary = store.memory(agent.id).find((m) => m.consolidationId === job.id);
          const sourcePreserved = originals.every(
            (m) => store.memory(agent.id).find((n) => n.id === m.id)?.text === m.text,
          );
          assert(sourcePreserved);
          if (completed.status === 'completed') {
            assert(summary && typeof summary.text === 'string');
            assert.deepEqual(
              summary.sourceIds,
              originals.map((m) => m.id),
            );
            if (mode === 'replay')
              for (const field of ['immediate', 'round', 'shared']) {
                const value = failed.content[field];
                if (Array.isArray(value) && value.length)
                  assert(summary.text.includes(value.join('\n')));
              }
            const seat = arena
              .engine(target.gameId)
              .s.players.find((p) => p.agentId === agent.id)!.seat;
            assert(
              arena.context(target.gameId, seat).memory.some((m) => m.consolidationId === job.id),
            );
          }
          result = {
            ...target,
            mode,
            status: completed.status,
            error: completed.error,
            sourceCount: originals.length,
            sourcePreserved,
            savedAsText: !!summary,
            memoryAvailable: !!summary,
            replayCalls,
            newGames: 0,
          };
        });
      } catch (error) {
        result = {
          ...target,
          mode,
          status: 'error',
          error: redact(error, provider),
          replayCalls,
          newGames: 0,
        };
      } finally {
        if (meter) {
          requests.push(...meter.records);
          meter.restore();
        } else globalThis.fetch = fetch;
      }
      report.checks.push(result);
      atomicJSON(file, report);
      atomicJSON(requestFile, requests);
      console.log(JSON.stringify(result));
    }
  } finally {
    await arena.close();
  }
}
report.finishedAt = new Date().toISOString();
report.ok = report.checks.every((c: any) => c.status === 'completed');
atomicJSON(file, report);
