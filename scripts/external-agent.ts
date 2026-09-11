// Example: ARENA_URL=http://localhost:3930 GAME_ID=... AGENT_ID=... AGENT_TOKEN=... npx tsx scripts/external-agent.ts
// Replace heuristic(input) with your own model API or strategy.
import { heuristic, type AgentInput } from '../server/agents';
const base = process.env.ARENA_URL ?? 'http://localhost:3930',
  gameId = process.env.GAME_ID,
  agentId = process.env.AGENT_ID,
  token = process.env.AGENT_TOKEN;
if (!gameId || !agentId || !token) throw new Error('需要 GAME_ID、AGENT_ID 与 AGENT_TOKEN');
const url = `${base}/api/agent/${encodeURIComponent(gameId)}/${encodeURIComponent(agentId)}`;
for (;;) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`获取视角失败 HTTP ${response.status}`);
  const input = (await response.json()) as AgentInput;
  if (input.observation.status === 'finished') {
    console.log(`结束：${input.observation.winner}`);
    break;
  }
  if (input.observation.legalActions.length) {
    const result = await fetch(`${url}/actions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...heuristic(input), revision: input.observation.revision }),
    });
    if (!result.ok) console.log(`动作被拒（HTTP ${result.status}），重新获取状态`);
  }
  await new Promise((r) => setTimeout(r, 500));
}
