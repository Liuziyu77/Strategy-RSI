import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';

for (const [type, locale] of [
  ['chess', 'en'],
  ['chess', 'zh'],
  ['werewolf', 'en'],
  ['werewolf', 'zh'],
  ['xiangqi', 'zh'],
] as const) {
  test(`${type} ${locale}: create, board, pause, replay and game-scoped memory`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page
      .getByRole('button', {
        name: `进入${{ chess: '国际象棋', werewolf: '狼人杀', xiangqi: '中国象棋' }[type]}`,
      })
      .click();
    if (type === 'xiangqi') await expect(page.getByLabel('Language / 语言')).toBeDisabled();
    else await page.getByLabel('Language / 语言').selectOption(locale);
    await page
      .getByRole('button', {
        name: /Run local demo|运行本地游戏演示/,
        exact: false,
      })
      .click();
    const board =
      type === 'werewolf' ? page.locator('.wolf-table') : page.locator('.strategy-board');
    await expect(board).toBeVisible();
    await page
      .getByRole('button', { name: locale === 'en' ? 'Pause' : '暂停', exact: true })
      .click();
    const matches = await (await request.get('/api/matches')).json();
    const match = matches.find(
      (m: any) => m.config.gameType === type && m.config.locale === locale,
    );
    expect(match).toBeDefined();
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/matches')).json()).find((m: any) => m.id === match.id)
            .status,
      )
      .toBe('paused');
    await page
      .getByRole('button', { name: locale === 'en' ? 'Step' : '单步', exact: true })
      .click();
    await page.getByLabel('Replay frame', { exact: true }).fill('1');
    await expect(board).toBeVisible();
    await page
      .getByRole('button', { name: locale === 'en' ? 'Live' : '实时', exact: true })
      .click();
    if (type === 'werewolf') {
      await page.getByLabel('Perspective / 视角').selectOption('0');
      await expect(page.locator('.wolf-seats article')).toHaveCount(6);
    } else await expect(page.locator('.board-cell')).toHaveCount(type === 'chess' ? 64 : 90);
    await page.getByRole('tab', { name: locale === 'en' ? 'Memory' : '经验', exact: true }).click();
    await page.getByLabel('Memory player').selectOption(match.config.agents[0].id);
    await page.getByLabel('Experience / 经验').fill('Game-specific lesson from browser test.');
    await page
      .getByRole('button', { name: locale === 'en' ? 'Save experience' : '保存经验' })
      .click();
    await expect(
      page.locator('.multi-memory article').filter({ hasText: 'Game-specific lesson' }),
    ).toBeVisible();
    const memories = await (
      await request.get(`/api/memories?agentId=${match.config.agents[0].id}`)
    ).json();
    expect(memories[0].gameType).toBe(type);
    mkdirSync('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/${type}-${locale}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(board).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: `artifacts/${type}-${locale}-mobile.png`, fullPage: true });
    expect(errors).toEqual([]);
    await request.post(`/api/matches/${match.id}/stop`);
  });
}
