/** Capture the current lobby and all game rooms with isolated local policy fixtures. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Arena } from '../server/arena';
import { createApp } from '../server/app';
import { Store } from '../server/store';
import type { AppConfig } from '../server/config';
import type { GameType, Locale } from '../src/games/core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (!existsSync('dist/index.html')) throw new Error('Run npm run build before capturing.');
const out = resolve('docs/assets');
mkdirSync(out, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), 'strategy-rsi-previews-'));
const config: AppConfig = {
  dataDir: join(scratch, 'data'),
  port: 0,
  host: '127.0.0.1',
  adminToken: '',
  providers: [],
};
const arena = new Arena(new Store(config.dataDir), config);
const app = createApp(arena);
app.get('/*', serveStatic({ root: './dist' }));
app.get('/*', serveStatic({ path: './dist/index.html' }));
const server = createServer(getRequestListener(app.fetch));
const viewport = { width: 1600, height: 1100 };
const errors: string[] = [];
const files: Record<string, unknown>[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const port = await new Promise<number>((done) =>
    server.listen(0, '127.0.0.1', () => done((server.address() as { port: number }).port)),
  );
  const url = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const variants: { gameType: GameType; locale: Locale; name: string; players: number }[] = [
    { gameType: 'sanguosha', locale: 'zh', name: '三国杀 · 本地演示', players: 5 },
    { gameType: 'werewolf', locale: 'zh', name: '狼人杀 · 本地演示', players: 9 },
    { gameType: 'chess', locale: 'zh', name: '国际象棋 · 本地演示', players: 2 },
    { gameType: 'xiangqi', locale: 'zh', name: '中国象棋 · 本地演示', players: 2 },
    { gameType: 'werewolf', locale: 'en', name: 'Werewolf · Local demo', players: 9 },
    { gameType: 'chess', locale: 'en', name: 'Chess · Local demo', players: 2 },
  ];
  for (const variant of [null, ...variants]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        route.request().url().startsWith(`${url}/`) ? route.continue() : route.abort(),
      );
      let record: Record<string, unknown> = { page: 'lobby' };
      let file = 'game-lobby.png';
      if (variant) {
        const { gameType, locale, name, players } = variant;
        const names = ['观澜', '疏影', '凌云', '知微', '长风', '星河', '明烛', '听雨', '清和'];
        const heroes = ['关羽', '赵云', '张飞', '黄月英', '张辽'];
        const match = arena.create({
          gameType,
          locale,
          name,
          seed: 42,
          games: 1,
          autoStart: false,
          agents: Array.from({ length: players }, (_, i) => ({
            id: `preview-${gameType}-${locale}-${i}`,
            name: locale === 'en' ? `Agent ${String.fromCharCode(65 + i)}` : names[i],
            kind: 'heuristic',
            rsi: 'off',
            ...(gameType === 'sanguosha' ? { hero: heroes[i] } : {}),
          })),
        });
        const gameId = arena.store.games(match.id)[0].id;
        const engine = arena.engine(gameId);
        for (let i = 0; i < (gameType === 'werewolf' ? 30 : 12); i++) {
          if (engine.s.status === 'finished') break;
          if (gameType === 'werewolf' && engine.s.phase === 'discussion') break;
          await arena.step(match.id, gameId);
        }
        await page.goto(`${url}/#/arena/${gameType}?match=${match.id}&game=${gameId}`);
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', gameType);
        const stage =
          gameType === 'sanguosha'
            ? '.player-panel'
            : gameType === 'werewolf'
              ? '.wolf-table'
              : '.strategy-board';
        await expect(page.locator(stage).first()).toBeVisible();
        if (gameType !== 'sanguosha') {
          if (locale === 'en') await page.getByLabel('Language / 语言').selectOption(locale);
          await page
            .getByRole('tab', { name: locale === 'en' ? 'Events' : '实录', exact: true })
            .click();
          await expect(page.locator('.multi-log li').first()).toBeVisible();
        }
        file = `${gameType}-arena${locale === 'en' ? '.en' : ''}.png`;
        record = {
          gameType,
          locale,
          seed: 42,
          players,
          phase: engine.s.phase,
          revision: engine.s.revision,
        };
      } else {
        await page.goto(url);
        await expect(page.locator('.lobby-card')).toHaveCount(4);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(out, file), fullPage: true, animations: 'disabled' });
      files.push({
        file,
        ...record,
        sha256: createHash('sha256')
          .update(readFileSync(join(out, file)))
          .digest('hex'),
      });
      console.log(`Captured ${file}`);
    } finally {
      await context.close();
    }
  }
  expect(errors).toEqual([]);
  writeFileSync(
    join(out, 'ui-preview-provenance.json'),
    JSON.stringify(
      {
        capturedOn: new Date().toISOString().slice(0, 10),
        sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        captureScript: 'scripts/capture-game-previews.ts',
        captureScriptSha256: createHash('sha256')
          .update(readFileSync(fileURLToPath(import.meta.url)))
          .digest('hex'),
        data: 'Independent temporary SQLite; deterministic local policy agents with RSI off. Positions and events are produced by the game engines, not real model experiments.',
        realModelCalls: false,
        viewport,
        fullPage: true,
        files,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  await arena.close();
  rmSync(scratch, { recursive: true, force: true });
}
