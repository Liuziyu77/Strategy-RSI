/** Re-present saved game frames and verbatim public chat. No database or model access. */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { HEROES, CARD_RULES, EQUIPMENT } from '../src/cards';
import type { AgentConfig, Observation, GameEvent, ChatMessage } from '../src/types';
import { startRecording, encodeRecording } from './media-recording';

type Clip = {
  id: string;
  title: string;
  subtitle: string;
  gameId: string;
  matchId: string;
  matchName: string;
  gameNumber: number;
  start: number;
  end: number;
  tab: 'events' | 'chat';
  originalStart: string;
  originalEnd: string;
  agents: AgentConfig[];
  events: GameEvent[];
  chat: ChatMessage[];
  frames: {
    seq: number;
    holdSeconds: number;
    snapshot: { id: string; number: number; view: Observation; decisionCount: number };
  }[];
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const out = join(root, 'docs/assets');
const source = readFileSync(join(out, 'recorded-highlights.json'), 'utf8');
const archive = JSON.parse(source) as { source: string; clips: Clip[] };
const viewport = { width: 1920, height: 1280 };
const scratch = mkdtempSync(join(tmpdir(), 'strategy-rsi-highlights-'));
let clip = archive.clips[0];
let frame = clip.frames[0];
const app = new Hono();
app.get('/api/config', (c) =>
  c.json({
    providers: [],
    heroes: HEROES,
    cards: CARD_RULES,
    equipment: EQUIPMENT,
    adminRequired: false,
  }),
);
app.get('/api/matches', (c) =>
  c.json([
    {
      id: clip.matchId,
      status: 'paused',
      config: {
        name: clip.matchName,
        agents: clip.agents,
        games: 1,
        concurrency: 1,
        chatEnabled: true,
      },
      games: [
        {
          id: clip.gameId,
          number: clip.gameNumber,
          status: 'playing',
          runStatus: 'paused',
          round: frame.snapshot.view.round,
          turn: frame.snapshot.view.turn,
        },
      ],
    },
  ]),
);
app.get('/api/players', (c) => c.json([]));
app.get('/api/memories', (c) => c.json([]));
app.get('/api/stream', (c) =>
  c.text('data: archive\n\n', 200, { 'Content-Type': 'text/event-stream' }),
);
app.get('/api/games/:id', (c) => c.json(frame.snapshot));
app.get('/api/games/:id/events', (c) =>
  c.json(clip.events.filter((e) => e.seq <= frame.seq).slice(-100)),
);
app.get('/api/games/:id/decisions', (c) => c.json([]));
app.get('/api/games/:id/chat', (c) => {
  const boundary = Math.min(Number(c.req.query('before') ?? frame.seq), frame.seq);
  const messages = clip.chat.filter((message) => message.seq <= boundary);
  return c.json({ messages: messages.slice(-4), total: messages.length });
});
app.get('/*', serveStatic({ root: './dist' }));
app.get('/*', serveStatic({ path: './dist/index.html' }));
const server = createServer(getRequestListener(app.fetch));
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const provenance: object[] = [];
try {
  for (clip of archive.clips) {
    frame = clip.frames[0];
    const context = await browser.newContext({
      viewport,
      locale: 'zh-CN',
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
    await page.goto(url);
    await page.locator('.player-panel').first().waitFor();
    if (clip.tab === 'chat')
      await page.getByRole('button', { name: '牌局聊天', exact: true }).click();
    await page.addStyleTag({
      content: readFileSync(join(root, 'scripts/highlight-presentation.css'), 'utf8'),
    });
    await page.evaluate(
      ({ clip, frame }) => {
        document.body.classList.add(`highlight-${clip.tab}`);
        const header = document.createElement('header');
        header.id = 'archive-heading';
        const title = document.createElement('h1');
        title.textContent = clip.title;
        const label = document.createElement('div');
        label.className = 'archive-label';
        label.textContent = 'STRATEGY-RSI  /  RECORDED GAME';
        const subtitle = document.createElement('p');
        subtitle.textContent = `${clip.subtitle} · 历史回放 · 等待时间已压缩`;
        const progress = document.createElement('span');
        progress.id = 'archive-progress';
        progress.textContent = `事件 #${frame.seq} · 全知回放`;
        header.append(label, title, subtitle, progress);
        document.body.prepend(header);
      },
      {
        clip: { title: clip.title, subtitle: clip.subtitle, tab: clip.tab },
        frame: { seq: frame.seq },
      },
    );
    await page.evaluate(() => document.fonts.ready);
    const stop = await startRecording(page, scratch, clip.id, viewport);
    await delay(1000);
    let seenAnimations = 0;
    for (const next of clip.frames.slice(1)) {
      frame = next;
      await page.waitForResponse(
        async (response) =>
          new URL(response.url()).pathname === `/api/games/${clip.gameId}` &&
          (await response.json()).view.revision === frame.snapshot.view.revision,
      );
      await page.evaluate((seq) => {
        document.getElementById('archive-progress')!.textContent = `事件 #${seq} · 全知回放`;
      }, frame.seq);
      if (clip.tab === 'chat') {
        const newest = clip.chat.filter((message) => message.seq <= frame.seq).at(-1)!;
        await page.locator(`.chat-message[data-seq="${newest.seq}"]`).waitFor();
        await page.evaluate(() => {
          const feed = document.querySelector('.chat-feed')!;
          feed.scrollTop = feed.scrollHeight;
        });
      } else {
        await delay(150);
        seenAnimations += await page.locator('.card-play-effect,.health-effect').count();
      }
      await delay(frame.holdSeconds * 1000);
      if (frame.seq === (clip.tab === 'chat' ? 122 : 236)) {
        await page.screenshot({ path: join(out, `${clip.id}.png`) });
      }
    }
    const input = await stop();
    if (errors.length) throw new Error(errors.join('\n'));
    if (clip.tab === 'events' && !seenAnimations)
      throw new Error('No recorded card animation was displayed.');
    const visibleChat = await page.locator('.chat-bubble').allTextContents();
    if (visibleChat.some((text) => !clip.chat.some((message) => message.text === text)))
      throw new Error('Chat text differs from the archive.');
    const seconds =
      clip.frames.reduce((sum, entry) => sum + entry.holdSeconds, 0) + clip.frames.length * 2 + 3;
    await context.close();
    encodeRecording(input, out, clip.id, seconds, seconds);
    provenance.push({
      id: clip.id,
      gameId: clip.gameId,
      matchId: clip.matchId,
      gameNumber: clip.gameNumber,
      originalStart: clip.originalStart,
      originalEnd: clip.originalEnd,
      eventRange: [clip.start, clip.end],
      browserErrors: errors,
      seenAnimations,
      verbatimChatVerified: true,
    });
    console.log(`Recorded ${clip.id}: original events #${clip.start}–#${clip.end}.`);
  }
  writeFileSync(
    join(out, 'highlights-provenance.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: archive.source,
        archiveSha256: createHash('sha256').update(source).digest('hex'),
        presentation:
          'Original archived observations, events and public chat. Read-only replay, waits compressed. No model calls.',
        viewport,
        mp4: { fps: 30, crf: 16 },
        gif: { width: 1440, fps: 12 },
        clips: provenance,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  rmSync(scratch, { recursive: true, force: true });
}
