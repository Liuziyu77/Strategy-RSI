/** Record real UI / engine behavior with a local demo provider. No production data or paid API. */
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Arena } from '../server/arena';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { saveProfile } from '../server/players';
import { heuristic, type AgentInput } from '../server/agents';
import type { AppConfig } from '../server/config';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const out = resolve('docs/assets');
const scratch = mkdtempSync(join(tmpdir(), 'strategy-rsi-media-'));
mkdirSync(out, { recursive: true });
if (!existsSync('dist/index.html')) throw new Error('Run npm run build before recording.');
const listen = (server: Server) =>
  new Promise<number>((done) =>
    server.listen(0, '127.0.0.1', () => done((server.address() as { port: number }).port)),
  );
const close = async (server: Server) => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
};
const lessons = [
  '身份判断需要结合连续行动；公开自述只是一条线索，不应直接当作事实。',
  '使用杀之前检查攻击距离与目标防守；自己的体力偏低时保留闪或桃。',
  '手牌不足时先处理关键目标，避免把资源分散给多个难以击破的对手。',
  '救援时结合当前身份的胜利条件，权衡救援价值和自己的生存资源。',
];
let consolidations = 0;
const provider = createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const request = JSON.parse(raw),
    prompt = request.messages[0].content as string;
  let content: unknown;
  if (prompt.includes('你负责为一名三国杀 Agent 归纳个人经验')) {
    await delay(1200);
    consolidations++;
    content = {
      immediate:
        '出牌前检查距离、资源和响应窗口；优先保留关键防守牌。对公开发言结合实际行动判断，避免仅凭自述确定身份。',
      round:
        '复盘资源交换与阵营目标是否一致，区分当局偶然结果和可迁移的策略。将经验保留适用条件，避免把某个座位永久当作队友或敌人。',
      shared: '先遵循规则和可见事实，再参考经验与聊天信息；不确定判断保持可修正。',
    };
  } else {
    const input = JSON.parse(request.messages[1].content) as AgentInput;
    if (prompt.includes('返回 JSON：{"shouldRemember"')) {
      const i = (input.observation.round + input.observation.turn) % lessons.length;
      content = { shouldRemember: true, memory: lessons[i], reason: '本地演示：展示经验记录流程' };
    } else {
      const decision = heuristic(input),
        action = input.observation.legalActions.find((a) => a.id === decision.actionId)!;
      let speech = '';
      if (action.kind === 'slash')
        speech = `${input.observation.players[action.targets![0]].name}，先接这一刀。我想看看你的反应。`;
      else if (action.kind === 'save') speech = '这次先救你，希望接下来的行动值得信任。';
      else if (action.kind === 'equip') speech = '先稳住防线。大家的立场，还要看接下来的行动。';
      else if (action.kind === 'respond') speech = '这一招我接下了。下一轮再见。';
      else if (action.kind === 'trick') speech = '局势需要一点变化，诸位留意这张牌。';
      content = { ...decision, speech };
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      model: 'local-demo',
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  );
});
const providerPort = await listen(provider);
const config: AppConfig = {
  dataDir: join(scratch, 'data'),
  port: 0,
  host: '127.0.0.1',
  adminToken: '',
  providers: [
    {
      id: 'default',
      name: 'Local demo',
      baseUrl: `http://127.0.0.1:${providerPort}/v1`,
      apiKey: 'local-demo-only',
      models: ['local-demo'],
    },
  ],
};
const arena = new Arena(new Store(config.dataDir), config);
const app = createApp(arena);
app.get('/*', serveStatic({ root: './dist' }));
app.get('/*', serveStatic({ path: './dist/index.html' }));
const server = createServer(getRequestListener(app.fetch));
const port = await listen(server),
  url = `http://127.0.0.1:${port}`;
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const errors: string[] = [];
try {
  const roster = [
    ['观澜', '关羽', '#82bbae'],
    ['疏影', '赵云', '#a0a9da'],
    ['凌云', '张飞', '#e2ba73'],
    ['知微', '黄月英', '#d59984'],
    ['长风', '张辽', '#91ad82'],
  ];
  const players = roster.map(([name, hero, color], i) =>
    saveProfile(arena.store, config, {
      id: `demo-${i}`,
      name,
      hero,
      color,
      kind: 'llm',
      provider: 'default',
      model: 'local-demo',
      rsi: i === 0 ? 'both' : 'off',
      description:
        i === 0
          ? '双模式 RSI · 从每一次交锋中积累经验。此档案为本地功能演示。'
          : '本地策略演示 Agent · 独立档案与牌局记录。',
    }),
  );
  const match = arena.create({
    name: '五人身份局 · 合纵连横',
    playerIds: players.map((p) => p.id),
    games: 3,
    concurrency: 2,
    seed: 20260911,
    paceMs: 780,
    autoStart: false,
    maxDecisions: 1800,
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1060 },
    recordVideo: { dir: join(scratch, 'battle'), size: { width: 1600, height: 1060 } },
    locale: 'zh-CN',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('heading', { name: match.config.name, exact: true }).waitFor();
  await page.evaluate(() => {
    document.body.style.zoom = '0.82';
  });
  await page.getByRole('button', { name: '牌局聊天', exact: true }).click();
  await delay(1200);
  arena.resume(match.id);
  console.log('Recording live five-player game and chat…');
  await delay(11000);
  await page.screenshot({ path: join(out, 'arena.png') });
  await delay(9000);
  await page.getByRole('button', { name: '观摩第 2 局', exact: true }).click();
  await delay(7000);
  await arena.pause(match.id);
  await delay(600);
  const battleVideo = await page.video()!.path();
  await context.close();
  // Finish the same demonstration games quickly to populate real history and reflection groups.
  arena.store.db
    .prepare('UPDATE matches SET config=? WHERE id=?')
    .run(JSON.stringify({ ...match.config, paceMs: 0 }), match.id);
  arena.resume(match.id);
  await arena.workers.get(match.id);
  console.log('Demo games complete; recording player archive and consolidation…');
  const memoryContext = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
    recordVideo: { dir: join(scratch, 'memory'), size: { width: 1500, height: 1000 } },
    locale: 'zh-CN',
  });
  const memoryPage = await memoryContext.newPage();
  memoryPage.on('pageerror', (e) => errors.push(e.message));
  await memoryPage.goto(url);
  await memoryPage.evaluate(() => {
    document.body.style.zoom = '0.82';
  });
  await memoryPage.getByRole('button', { name: '玩家库', exact: true }).click();
  await memoryPage.locator('.roster-item').filter({ hasText: '观澜' }).click();
  await memoryPage.getByRole('tab', { name: '参战历史' }).click();
  await delay(1700);
  await memoryPage.screenshot({ path: join(out, 'player-library.png') });
  await memoryPage.getByRole('tab', { name: '个人经验' }).click();
  await memoryPage.locator('.experience-group').first().scrollIntoViewIfNeeded();
  await delay(2000);
  await memoryPage.getByRole('button', { name: '经验归纳', exact: true }).click();
  await memoryPage.getByText('归纳已保存', { exact: true }).waitFor({ timeout: 30000 });
  await memoryPage.locator('.experience-group').first().scrollIntoViewIfNeeded();
  await delay(4500);
  await memoryPage.locator('.type-round > summary').click();
  await memoryPage
    .locator('.experience-group')
    .first()
    .screenshot({ path: join(out, 'experience.png') });
  const memoryVideo = await memoryPage.video()!.path();
  await memoryContext.close();
  if (errors.length) throw new Error(errors.join('\n'));
  const encode = (input: string, name: string, start: number, duration: number, width: number) => {
    execFileSync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(start),
      '-i',
      input,
      '-t',
      String(duration),
      '-vf',
      `scale=${width}:-2`,
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'slow',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-an',
      join(out, `${name}.mp4`),
    ]);
    execFileSync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      join(out, `${name}.mp4`),
      '-vf',
      'fps=8,scale=1000:-2,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
      '-loop',
      '0',
      join(out, `${name}.gif`),
    ]);
  };
  encode(battleVideo, 'arena-demo', 3, 26, 1200);
  encode(memoryVideo, 'experience-demo', 2, 12, 1100);
  writeFileSync(
    join(out, 'demo-provenance.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source:
          'Actual application UI and rules engine; local heuristic-backed mock provider, scripted chat and example reflections. No live model benchmark.',
        games: arena.store
          .games(match.id)
          .map((g) => ({ number: g.number, winner: g.winner, round: g.round })),
        consolidations,
        browserErrors: errors,
        viewport: [1600, 1060],
        zoom: 0.82,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Saved PNG screenshots, GIF previews and MP4 videos to docs/assets.');
} finally {
  await browser.close();
  await close(server);
  await arena.close();
  await close(provider);
  rmSync(scratch, { recursive: true, force: true });
}
