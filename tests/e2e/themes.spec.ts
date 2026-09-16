import { test, expect } from './fixtures';

for (const type of ['chess', 'werewolf', 'xiangqi'] as const) {
  test(`${type}: readable controls, matching dialog and clean return to lobby`, async ({
    page,
    request,
  }) => {
    const created = await request.post('/api/matches', {
      data: {
        gameType: type,
        locale: 'zh',
        name: `主题检查 ${type}`,
        autoStart: false,
        agents: Array.from({ length: type === 'werewolf' ? 6 : 2 }, (_, i) => ({
          id: `theme-${type}-${Date.now()}-${i}`,
          name: `主题玩家 ${i + 1}`,
          kind: 'heuristic',
          rsi: 'off',
        })),
      },
    });
    expect(created.ok()).toBeTruthy();
    const match = await created.json();
    await page.goto(`/#/arena/${type}?match=${match.id}`);
    await expect(
      page.locator(type === 'werewolf' ? '.wolf-table' : '.strategy-board'),
    ).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', type);
    const colors = await page.locator('.app-shell').evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      ink: getComputedStyle(el).color,
    }));
    await page.getByRole('tab', { name: '经验', exact: true }).click();
    const player = page.getByLabel('Memory player');
    const first = await player.locator('option').nth(1).getAttribute('value');
    await player.selectOption(first!);
    await page.getByLabel('Experience / 经验').fill('观察棋局，积累经验。');
    await page.getByRole('button', { name: '新建对战', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const contrast = await dialog.evaluate((el) => {
      const luminance = (color: string) => {
        const rgb = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((c) => c / 255)
          .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      };
      return [
        el,
        el.querySelector('input[type="number"]')!,
        el.querySelector('button.primary')!,
        document.querySelector('.live-return')!,
      ].map((node) => {
        const style = getComputedStyle(node);
        let surface: Element | null = node;
        while (
          surface.parentElement &&
          getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
        )
          surface = surface.parentElement;
        const fg = luminance(style.color),
          bg = luminance(getComputedStyle(surface).backgroundColor);
        return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
      });
    });
    for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `artifacts/theme-${type}-dialog.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `artifacts/theme-${type}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: `artifacts/theme-${type}-mobile.png`, fullPage: true });
    await page.getByRole('button', { name: '游戏大厅', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'lobby');
    const lobby = await page.locator('.app-shell').evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      ink: getComputedStyle(el).color,
    }));
    expect(lobby).not.toEqual(colors);
    await page.reload();
    expect(
      await page.locator('.app-shell').evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        ink: getComputedStyle(el).color,
      })),
    ).toEqual(lobby);
  });
}
