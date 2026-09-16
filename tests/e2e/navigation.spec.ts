import { test, expect } from './fixtures';
import type { APIRequestContext, Page } from '@playwright/test';

async function enterGame(page: Page, name: string) {
  await page.getByRole('button', { name: '游戏大厅', exact: true }).click();
  await expect(page.locator('.game-lobby')).toBeVisible();
  await page.getByRole('button', { name: `进入${name}`, exact: true }).click();
  await expect(page.locator('.game-lobby')).toHaveCount(0);
}

async function fixture(request: APIRequestContext, gameType: string, games = 1) {
  const id = `${gameType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await request.post('/api/matches', {
    data: {
      gameType,
      locale: gameType === 'chess' ? 'en' : 'zh',
      name: `Navigation ${id}`,
      games,
      concurrency: games,
      autoStart: false,
      paceMs: 10000,
      seed: 42,
      chatEnabled: false,
      agents: Array.from({ length: gameType === 'werewolf' ? 6 : 2 }, (_, i) => ({
        id: `${id}-${i}`,
        name: `Navigator ${id.slice(-6)} ${i + 1}`,
        kind: 'heuristic',
        rsi: 'off',
      })),
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const created = await response.json();
  if (games > 1) {
    await request.post(`/api/matches/${created.id}/resume`);
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/matches')).json()).find((m: any) => m.id === created.id)
            .games.length,
      )
      .toBe(games);
    await request.post(`/api/matches/${created.id}/pause`);
  }
  const match = (await (await request.get('/api/matches')).json()).find(
    (m: any) => m.id === created.id,
  );
  return match;
}

test('switching restores game, round, replay and perspective across reload and history', async ({
  page,
  request,
}) => {
  const chess = await fixture(request, 'chess', 2),
    wolf = await fixture(request, 'werewolf'),
    xiangqi = await fixture(request, 'xiangqi');
  await page.goto(`/#/arena/chess?match=${chess.id}&game=${chess.games[1].id}`);
  await expect(page.locator('.chess-board')).toBeVisible();
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await enterGame(page, '国际象棋');
  await expect(page.locator('.chess-board')).toBeVisible();
  await page.getByLabel('Perspective / 视角').selectOption('1');
  await page.getByLabel('Replay frame', { exact: true }).fill('1');
  const saved = page.url();
  await enterGame(page, '狼人杀');
  await expect(page.locator('.wolf-seats article')).toHaveCount(6);
  await page.getByLabel('Perspective / 视角').selectOption('0');
  const wolfURL = page.url();
  await enterGame(page, '国际象棋');
  await expect(page).toHaveURL(saved);
  await expect(page.locator('.game-rounds button[aria-pressed=true]')).toContainText('02');
  await expect(page.getByLabel('Perspective / 视角')).toHaveValue('1');
  await expect(page.locator('.live-tag')).toHaveText('REPLAY');
  await page.reload();
  await expect(page.locator('.chess-board')).toBeVisible();
  await expect(page).toHaveURL(saved);
  await page.goBack();
  await expect(page.locator('.game-lobby')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(wolfURL);
  await expect(page.locator('.wolf-table')).toBeVisible();
  await expect(page.getByLabel('Perspective / 视角')).toHaveValue('0');
  await page.goForward();
  await expect(page.locator('.game-lobby')).toBeVisible();
  await page.goForward();
  await expect(page.locator('.chess-board')).toBeVisible();
  await expect(page).toHaveURL(saved);
  await enterGame(page, '中国象棋');
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  await expect(page.getByLabel('Language / 语言')).toBeDisabled();
  await expect(page.locator('.shelf-match.selected')).toContainText(xiangqi.config.name);
  await expect(page.locator('.shelf-match').filter({ hasText: chess.config.name })).toHaveCount(0);
  for (const m of [chess, wolf, xiangqi])
    expect(
      (await (await request.get('/api/matches')).json()).find((row: any) => row.id === m.id).status,
    ).toBe('paused');
});

test('new-match dialog follows active game, supports Escape, and late responses cannot replace it', async ({
  page,
  request,
}) => {
  const chess = await fixture(request, 'chess'),
    xiangqi = await fixture(request, 'xiangqi');
  await page.goto(`/#/arena/chess?match=${chess.id}&game=${chess.games[0].id}`);
  await expect(page.locator('.chess-board')).toBeVisible();
  await page.getByRole('button', { name: '新建对战', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('CHESS / NEW MATCH');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '新建对战', exact: true })).toBeFocused();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/games/${chess.games[0].id}?*`, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  const pending = page.waitForRequest((req) =>
    req.url().includes(`/games/${chess.games[0].id}?viewer=0`),
  );
  await page.getByLabel('Perspective / 视角').selectOption('0');
  await pending;
  await enterGame(page, '中国象棋');
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  release();
  await expect(page.locator('.chess-board')).toHaveCount(0);
  await page.getByRole('button', { name: '新建对战', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('XIANGQI / NEW MATCH');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await enterGame(page, '中国象棋');
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('board orientation and last-move highlights follow the displayed replay', async ({
  page,
  request,
}) => {
  const match = await fixture(request, 'chess');
  await request.post(`/api/matches/${match.id}/step`, { data: { gameId: match.games[0].id } });
  await page.goto(`/#/arena/chess?match=${match.id}&game=${match.games[0].id}`);
  await expect(page.locator('.chess-board')).toBeVisible();
  await expect(page.locator('.board-cell').first()).toHaveAttribute('data-square', 'a8');
  await expect(page.locator('.move-to')).toHaveCount(1);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  await expect(page.locator('.board-cell').first()).toHaveAttribute('data-square', 'h1');
  await page.getByLabel('Replay frame', { exact: true }).fill('1');
  await expect(page.locator('.move-to')).toHaveCount(0);
  await expect(page.locator('.last-move strong')).toHaveText('—');
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  await expect(page.locator('.move-to')).toHaveCount(1);
});

test('mobile navigation and invalid saved match recover to a usable game', async ({
  page,
  request,
}) => {
  await fixture(request, 'xiangqi');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/#/arena/xiangqi?match=removed&game=removed&frame=999&viewer=11');
  await expect(page.locator('.xiangqi-board')).toBeVisible();
  await expect(page.getByLabel('Perspective / 视角')).toHaveValue('-1');
  await expect(page.locator('.live-tag')).toHaveText('LIVE');
  await expect(page.getByLabel('Multi match')).toBeVisible();
  for (const [type, name] of [
    ['sanguosha', '三国杀'],
    ['werewolf', '狼人杀'],
    ['chess', '国际象棋'],
    ['xiangqi', '中国象棋'],
  ]) {
    await enterGame(page, name);
    await expect(page).toHaveURL(new RegExp(`#/arena/${type}`));
    await expect(page.locator('.lobby-card')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
});

test('Sanguosha restores its replay and identity visibility when returning from another game', async ({
  page,
  request,
}) => {
  const match = await fixture(request, 'sanguosha');
  await page.goto(`/#/arena/sanguosha?match=${match.id}&game=${match.games[0].id}`);
  await expect(page.locator('.player-panel')).toHaveCount(2);
  await page.getByLabel('回放时间轴').fill('1');
  await page.getByRole('checkbox', { name: '全知视角' }).uncheck();
  const saved = page.url();
  await enterGame(page, '国际象棋');
  await expect(page.locator('.chess-board')).toBeVisible();
  await enterGame(page, '三国杀');
  await expect(page).toHaveURL(saved);
  await expect(page.getByRole('checkbox', { name: '全知视角' })).not.toBeChecked();
  await expect(page.locator('.live-tag')).toHaveText('REPLAY');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: '全知视角' })).not.toBeChecked();
  await expect(page.locator('.live-tag')).toHaveText('REPLAY');
});

test('player history opens the correct game workspace', async ({ page, request }) => {
  const match = await fixture(request, 'chess');
  await page.goto(`/#/arena/chess?match=${match.id}&game=${match.games[0].id}`);
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await page.locator('.roster-item').filter({ hasText: match.config.agents[0].name }).click();
  await page.getByRole('tab', { name: /参战历史/ }).click();
  const row = page.locator('.player-history-row').first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/#\/arena\/chess/);
  await expect(page.locator('.chess-board')).toBeVisible();
});

test('Sanguosha replay hides a stale frame while loading and recovers an out-of-range link', async ({
  page,
  request,
}) => {
  const match = await fixture(request, 'sanguosha'),
    game = match.games[0];
  const url = `/#/arena/sanguosha?match=${match.id}&game=${game.id}`;
  await page.goto(url);
  await expect(page.locator('.hand-strip .card-face').first()).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/games/${game.id}?seq=1`, async (route) => {
    await gate;
    await route.continue().catch(() => {});
  });
  try {
    const pending = page.waitForRequest((r) => r.url().endsWith(`/games/${game.id}?seq=1`));
    await page.getByLabel('回放时间轴').fill('1');
    await pending;
    await expect(page.locator('.hand-strip .card-face')).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.locator('.player-panel')).toHaveCount(2);
  await page.goto(`${url}&frame=999999`);
  await expect(page.getByLabel('回放时间轴')).toHaveValue(String(game.revision));
  await expect(page.locator('.hand-strip .card-face').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`frame=${game.revision}(?:&|$)`));
});

test('browser history clears the previous match memory owner and draft', async ({
  page,
  request,
}) => {
  const a = await fixture(request, 'chess'),
    b = await fixture(request, 'chess');
  await page.goto(`/#/arena/chess?match=${a.id}&game=${a.games[0].id}`);
  await expect(page.locator('.chess-board')).toBeVisible();
  await page.locator('.shelf-match').filter({ hasText: b.config.name }).click();
  await expect(page.locator('.chess-board')).toBeVisible();
  await page.getByRole('tab', { name: /Memory/ }).click();
  await page.getByLabel('Memory player', { exact: true }).selectOption(b.config.agents[0].id);
  await page.getByLabel('Experience / 经验').fill('Draft belongs to match B');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`match=${a.id}`));
  await expect(page.locator('.chess-board')).toBeVisible();
  await expect(page.getByLabel('Memory player', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Experience / 经验')).toHaveCount(0);
  await page.getByLabel('Memory player', { exact: true }).selectOption(a.config.agents[0].id);
  await expect(page.getByLabel('Experience / 经验')).toHaveValue('');
});

test('player library explicitly scopes manual and TXT experience to the chosen game', async ({
  page,
  request,
}) => {
  const match = await fixture(request, 'chess'),
    player = match.config.agents[0];
  await page.goto('/#/players');
  await page.locator('.roster-item').filter({ hasText: player.name }).click();
  await page.getByRole('tab', { name: '个人经验' }).click();
  await page.getByLabel('经验所属游戏', { exact: true }).selectOption('chess');
  await page.getByLabel('添加经验', { exact: true }).fill('Develop pieces before attacking.');
  await page.getByRole('button', { name: '保存经验', exact: true }).click();
  await expect(page.locator('.memory-card').filter({ hasText: 'Develop pieces' })).toContainText(
    '国际象棋',
  );
  await page.locator('input[type=file]').setInputFiles({
    name: 'chess.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Check king safety.'),
  });
  await expect(
    page.locator('.memory-card').filter({ hasText: 'Check king safety.' }),
  ).toContainText('国际象棋');
  const detail = await (await request.get(`/api/players/${player.id}`)).json();
  expect(detail.memories).toHaveLength(2);
  expect(detail.memories.every((m: any) => m.gameType === 'chess')).toBe(true);
});

test('home is a searchable game lobby, including after visiting a game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.game-lobby')).toBeVisible();
  await expect(page.locator('.lobby-card')).toHaveCount(4);
  await expect(page.getByRole('button', { name: '新建对战', exact: true })).toHaveCount(0);
  const search = page.getByLabel('搜索游戏 / Search games');
  await search.fill('CHESS');
  await expect(page.locator('.lobby-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '进入国际象棋', exact: true })).toBeVisible();
  await search.fill('象棋');
  await expect(page.locator('.lobby-card')).toHaveCount(2);
  await search.fill('does-not-exist');
  await expect(page.getByRole('status')).toContainText('没有找到对应的游戏');
  await page.getByRole('button', { name: '查看全部游戏' }).click();
  await expect(page.locator('.lobby-card')).toHaveCount(4);
  await page.screenshot({ path: 'artifacts/game-lobby-desktop.png', fullPage: true });
  await page.getByRole('button', { name: '进入国际象棋', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.arena-chess')).toBeVisible();
  await expect(page.locator('.game-lobby')).toHaveCount(0);
  await page.getByRole('button', { name: '游戏大厅', exact: true }).click();
  await page.reload();
  await expect(page.locator('.game-lobby')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('.game-lobby')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByRole('button', { name: '进入中国象棋', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/game-lobby-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
