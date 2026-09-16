import { test, expect } from './fixtures';
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { heuristic } from '../../server/agents';

test('Agent 聊天：实时更新、并行切局、逐帧回放及移动端展示', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const phrases = [
    '先别急着站队，看看大家接下来打谁。',
    '我会留一张防守牌，愿意配合的先说目标。',
    '只凭一句忠臣还不够，你这轮准备怎么帮主公？',
    '这次先试探一下。对面的闪还够用吗？',
  ];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(JSON.parse(raw).messages[1].content);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...heuristic(input),
                speech: `${input.observation.gameId.slice(0, 6)} · ${phrases[input.chat.length % phrases.length]}`,
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const ids: string[] = [];
    for (const name of ['云长 · 谋略', '子龙 · 观势']) {
      const result = await request.post('/api/players', {
        data: {
          name,
          kind: 'llm',
          hero: '关羽',
          rsi: 'off',
          apiMode: 'custom',
          baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
          apiKey: 'chat-browser-test-key',
          model: 'chat-demo-model',
        },
      });
      expect(result.ok()).toBe(true);
      ids.push((await result.json()).id);
    }
    const response = await request.post('/api/matches', {
      data: {
        name: 'Agent 聊天功能演示 · 模拟模型',
        playerIds: ids,
        games: 2,
        concurrency: 2,
        autoStart: false,
        paceMs: 0,
        maxDecisions: 20,
      },
    });
    expect(response.ok()).toBe(true);
    const match = await response.json();
    let matches = await (await request.get('/api/matches')).json();
    const firstId = matches.find((m: any) => m.id === match.id).games[0].id;
    await page.goto('/#/arena/sanguosha');
    await expect(page.getByRole('heading', { name: match.config.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '牌局聊天', exact: true }).click();
    await expect(page.getByText('静候第一句交锋。Agent 会在需要时随行动发言。')).toBeVisible();
    expect(
      (await request.post(`/api/matches/${match.id}/step`, { data: { gameId: firstId } })).ok(),
    ).toBe(true);
    await expect(page.locator('.chat-message')).toHaveCount(1);
    await expect(page.locator('.chat-bubble')).toContainText('先别急着站队');
    await request.post(`/api/matches/${match.id}/resume`);
    await expect
      .poll(async () => {
        matches = await (await request.get('/api/matches')).json();
        return matches.find((m: any) => m.id === match.id).status;
      })
      .toBe('finished');
    const games = matches.find((m: any) => m.id === match.id).games;
    const firstChat = (await (await request.get(`/api/games/${firstId}/chat`)).json()).messages;
    await expect(page.locator('.chat-message')).toHaveCount(firstChat.length);
    await page.getByLabel('回放时间轴').fill(String(firstChat[0].seq - 1));
    await expect(page.locator('.chat-message')).toHaveCount(0);
    await expect(page.getByText('这个时刻还没有公开发言。')).toBeVisible();
    await page.getByLabel('回放时间轴').fill(String(firstChat[0].seq));
    await expect(page.locator('.chat-message')).toHaveCount(1);
    await page.getByRole('button', { name: '回到实时', exact: true }).click();
    await expect(page.locator('.chat-message')).toHaveCount(firstChat.length);
    await page.getByRole('button', { name: '观摩第 2 局', exact: true }).click();
    const secondId = games.find((g: any) => g.number === 2).id;
    const secondChat = (await (await request.get(`/api/games/${secondId}/chat`)).json()).messages;
    await expect(page.locator('.chat-message')).toHaveCount(secondChat.length);
    await expect(page.locator('.chat-bubble').first()).toContainText(secondId.slice(0, 6));
    expect(
      (await page.locator('.chat-bubble').allTextContents()).every(
        (text) => !text.includes(firstId.slice(0, 6)),
      ),
    ).toBe(true);
    mkdirSync('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/agent-chat-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('region', { name: '本局 Agent 聊天室' }).scrollIntoViewIfNeeded();
    await page.locator('.chat-message').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.chat-message').last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const bounds = await page.evaluate(() => ({
      feed: document.querySelector('.chat-feed')!.getBoundingClientRect().bottom,
      note: document.querySelector('.chat-room-note')!.getBoundingClientRect().top,
      noteBottom: document.querySelector('.chat-room-note')!.getBoundingClientRect().bottom,
      footer: document.querySelector('.history-footer')!.getBoundingClientRect().top,
    }));
    expect(bounds.feed).toBeLessThanOrEqual(bounds.note + 1);
    expect(bounds.noteBottom).toBeLessThanOrEqual(bounds.footer + 1);
    await page.screenshot({ path: 'artifacts/agent-chat-mobile.png', fullPage: true });
    await page.getByRole('button', { name: '新建对战', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '开启 Agent 牌局聊天' })).toBeChecked();
    await page.getByRole('checkbox', { name: '开启 Agent 牌局聊天' }).uncheck();
    await page.getByRole('button', { name: '展开实验参数' }).click();
    await expect(page.getByLabel('聊天上下文条数')).toBeDisabled();
    expect(errors).toEqual([]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
