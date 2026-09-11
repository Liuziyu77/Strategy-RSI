import { Engine } from '../src/engine';
import { HEROES } from '../src/cards';
import { agentInput, heuristic } from '../server/agents';
import type { AgentConfig } from '../src/types';
import { writeFileSync } from 'node:fs';
const seeds = Number(process.env.SMOKE_SEEDS ?? 10),
  stats = {
    games: 0,
    finished: 0,
    draws: 0,
    decisions: 0,
    players: {} as Record<string, number>,
    actions: {} as Record<string, number>,
    tasks: {} as Record<string, number>,
  };
for (let players = 2; players <= 8; players++)
  for (let seed = 1; seed <= seeds; seed++) {
    const agents: AgentConfig[] = Array.from({ length: players }, (_, i) => ({
      id: `agent-${i}`,
      name: `Agent ${i}`,
      kind: 'heuristic',
      provider: 'default',
      model: '',
      rsi: 'off',
      hero: HEROES[(i + seed) % 8].name,
    }));
    const e = new Engine(`smoke-${players}-${seed}`, agents, seed);
    e.start();
    e.assertInvariants();
    for (let step = 0; step < 2500 && e.s.status === 'playing'; step++) {
      const input = agentInput(e.view(e.actor), e.visibleHistory(e.actor), [], {
        contextEvents: 50,
      });
      const decision = heuristic(input);
      const action = input.observation.legalActions.find((a) => a.id === decision.actionId)!;
      stats.actions[action.kind] = (stats.actions[action.kind] ?? 0) + 1;
      stats.tasks[e.pending.type] = (stats.tasks[e.pending.type] ?? 0) + 1;
      try {
        e.apply(decision.actionId, e.s.revision, decision.cardIds);
        e.assertInvariants();
      } catch (error) {
        console.error({ players, seed, step, pending: e.pending, action });
        throw error;
      }
      stats.decisions++;
    }
    stats.games++;
    stats.players[players] = (stats.players[players] ?? 0) + 1;
    if (e.s.status === 'finished') stats.finished++;
    else stats.draws++;
  }
console.log(JSON.stringify(stats, null, 2));
if (process.env.SMOKE_REPORT)
  writeFileSync(process.env.SMOKE_REPORT, JSON.stringify(stats, null, 2) + '\n');
if (stats.finished !== stats.games) process.exitCode = 1;
