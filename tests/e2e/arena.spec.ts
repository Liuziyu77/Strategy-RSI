import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { heuristic } from '../../server/agents';

test('桌面观战：创建、暂停、单步、逐帧回放与存档下载', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/arena/sanguosha');
  await expect(page.getByRole('button', { name: '运行本地演示' })).toBeVisible();
  await page.getByRole('button', { name: '运行本地演示' }).click();
  await expect(page.getByRole('heading', { name: '群雄初试 · 本地演示' })).toBeVisible();
  await expect(page.locator('.player-panel')).toHaveCount(4);
  await expect(page.locator('.event-row').first()).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeEnabled();
  const matches = await (await request.get('/api/matches')).json(),
    m = matches[0],
    game = m.games[0];
  const before = (await (await request.get(`/api/games/${game.id}`)).json()).view.revision;
  await page.getByRole('button', { name: '单步执行' }).click();
  await expect
    .poll(async () => (await (await request.get(`/api/games/${game.id}`)).json()).view.revision)
    .toBeGreaterThan(before);
  await page.getByLabel('回放时间轴').fill('1');
  await expect(page.locator('.live-tag')).toHaveText('REPLAY');
  await expect(page.locator('.hand-strip .card-face')).toHaveCount(0);
  await page.getByRole('button', { name: '回到实时' }).click();
  await expect(page.locator('.live-tag')).toHaveText('LIVE');
  await expect(page.locator('.card-face').first()).toBeVisible();
  await page.getByRole('checkbox', { name: '全知视角' }).uncheck();
  await expect(page.locator('.card-back').first()).toBeVisible();
  await page.getByRole('checkbox', { name: '全知视角' }).check();
  await page.getByRole('button', { name: 'Agent 决策', exact: true }).click();
  await expect(page.locator('.decision-entry').first()).toBeVisible();
  const exported = await (await request.get(`/api/games/${game.id}/export`)).json();
  expect(exported.decisions.length).toBeGreaterThan(0);
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/upgrade-arena-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('玩家库：创建编辑专属API、绑定经验、选人开局与个人历史', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/arena/sanguosha');
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await expect(page.getByRole('button', { name: '经验档案', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '创建玩家', exact: true }).click();
  await page.getByLabel('玩家名字', { exact: true }).fill('清晏测试');
  await page.getByLabel('控制方式', { exact: true }).selectOption('llm');
  await page.getByLabel('RSI 学习方式', { exact: true }).selectOption('both');
  await page.getByLabel('API 服务', { exact: true }).selectOption('custom');
  await page.getByLabel('API 基础地址', { exact: true }).fill('https://example.invalid/v1');
  await page.getByLabel('API Key', { exact: true }).fill('e2e-library-private-key');
  await page.getByLabel('模型名称', { exact: true }).fill('library-model');
  await page.getByLabel('玩家备注', { exact: true }).fill('测试独立玩家的完整成长档案。');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/api/players') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存玩家', exact: true }).click();
  const player = await (await saved).json();
  expect(JSON.stringify(player)).not.toContain('e2e-library-private-key');
  await expect(page.locator('.profile-title h2')).toHaveText('清晏测试');
  await page.getByRole('button', { name: '编辑玩家', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.getByLabel('玩家名字', { exact: true }).fill('清晏 · 已编辑');
  // Keep the dedicated API settings, but play this browser regression entirely locally.
  await page.getByLabel('控制方式', { exact: true }).selectOption('heuristic');
  await page.getByLabel('RSI 学习方式', { exact: true }).selectOption('off');
  await page.getByRole('button', { name: '保存玩家', exact: true }).click();
  await expect(page.locator('.profile-title h2')).toHaveText('清晏 · 已编辑');
  await page.getByRole('tab', { name: '个人经验' }).click();
  await page
    .getByLabel('添加经验', { exact: true })
    .fill('保留桃以防濒死；观察连续行动再判断身份。');
  await page.getByRole('button', { name: '保存经验', exact: true }).click();
  await expect(page.locator('.memory-card').filter({ hasText: '保留桃以防濒死' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({
    name: 'experience.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        memories: [{ agentId: 'another-player', text: '导入经验：进攻之前计算距离。' }],
      }),
    ),
  });
  await expect(page.locator('.memory-card').filter({ hasText: '进攻之前计算距离' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: '导出经验', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('agent-memories.json');
  const detail = await (await request.get(`/api/players/${player.id}`)).json();
  expect(detail.memories).toHaveLength(2);
  expect(detail.memories.every((m: any) => m.agentId === player.id)).toBe(true);
  await page.screenshot({ path: 'artifacts/upgrade-player-memories.png', fullPage: true });
  const other = await (
    await request.post('/api/players', {
      data: { name: '疏影测试', kind: 'heuristic', hero: '赵云', rsi: 'off' },
    })
  ).json();
  await expect(page.locator('.roster-item').filter({ hasText: '疏影测试' })).toBeVisible();
  await page.getByRole('button', { name: '新建对战', exact: true }).click();
  await page.getByLabel('玩家人数', { exact: true }).selectOption('2');
  await page.getByLabel('对战名称', { exact: true }).fill('玩家档案联动测试');
  await page.getByLabel('座位 1 玩家', { exact: true }).selectOption('');
  await page.getByLabel('座位 2 玩家', { exact: true }).selectOption('');
  await page.getByLabel('座位 1 玩家', { exact: true }).selectOption(player.id);
  await page.getByLabel('座位 2 玩家', { exact: true }).selectOption(other.id);
  await page.screenshot({ path: 'artifacts/upgrade-match-builder.png', fullPage: true });
  await page.getByRole('button', { name: '开始对战', exact: true }).click();
  await expect(page.getByRole('heading', { name: '玩家档案联动测试', exact: true })).toBeVisible();
  await expect(page.locator('.player-panel')).toHaveCount(2);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '清晏 · 已编辑', exact: true }).click();
  await page.getByRole('tab', { name: '参战历史' }).click();
  await expect(
    page.locator('.player-history-row').filter({ hasText: '玩家档案联动测试' }),
  ).toBeVisible();
  const historyRow = page.locator('.player-history-row').filter({ hasText: '玩家档案联动测试' });
  await expect(historyRow.locator('.history-duration')).toContainText('已记录时长');
  await expect(historyRow.locator('.history-rounds')).toHaveText(/轮次\s*\d+ 轮/);
  await expect(historyRow.locator('.history-decisions')).toHaveText(/行动\s*\d+ 次/);
  await expect(historyRow).toContainText('2 人局');
  await expect(historyRow.locator('.history-timestamps time')).toHaveCount(2);
  await page.screenshot({ path: 'artifacts/upgrade-player-history.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(historyRow.locator('.history-metrics')).toBeVisible();
  await page.screenshot({ path: 'artifacts/player-history-metrics-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.player-history-row').filter({ hasText: '玩家档案联动测试' }).click();
  await expect(page.getByRole('heading', { name: '玩家档案联动测试', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('配置八人、多模型选项与手机布局', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/arena/sanguosha');
  for (let i = 0; i < 8; i++)
    await request.post('/api/players', {
      data: {
        id: `mobile-player-${i}`,
        name: `移动玩家 ${i + 1}`,
        kind: 'heuristic',
        hero: '张飞',
        rsi: 'off',
      },
    });
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await expect(page.locator('.roster-item').filter({ hasText: '移动玩家 8' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/upgrade-library-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '新建对战', exact: true }).click();
  await page.getByLabel('玩家人数').selectOption('8');
  await expect(page.locator('.seat-picker')).toHaveCount(8);
  await page.getByLabel('对战名称', { exact: true }).fill('八人移动端测试');
  await page.getByRole('button', { name: '开始对战', exact: true }).click();
  await expect(page.getByRole('heading', { name: '八人移动端测试' })).toBeVisible();
  await expect(page.locator('.player-panel')).toHaveCount(8);
  const m = (await (await request.get('/api/matches')).json())[0];
  await request.post(`/api/matches/${m.id}/pause`);
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/upgrade-arena-mobile.png', fullPage: true });
});

test('创建时随机预分配并交换身份，多局结果按对战展示胜率与总胜率', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ids = Array.from({ length: 4 }, (_, i) => `role-history-${i}`);
  for (const [i, id] of ids.entries()) {
    const r = await request.post('/api/players', {
      data: { id, name: `身份统计玩家 ${i + 1}`, kind: 'heuristic', hero: '张飞', rsi: 'off' },
    });
    expect(r.ok()).toBe(true);
  }
  await page.goto('/#/arena/sanguosha');
  await page.getByRole('button', { name: '新建对战', exact: true }).click();
  await page.getByLabel('玩家人数', { exact: true }).selectOption('4');
  await expect(page.getByLabel('身份分配', { exact: true })).toHaveValue('random');
  const initialRoles = await page
    .locator('.seat-role-picker select')
    .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
  expect(initialRoles.sort()).toEqual(['主公', '忠臣', '反贼', '内奸'].sort());
  await page.getByRole('button', { name: '重新随机分配', exact: true }).click();
  for (let i = 0; i < 4; i++)
    await page.getByLabel(`座位 ${i + 1} 玩家`, { exact: true }).selectOption('');
  for (let i = 0; i < 4; i++)
    await page.getByLabel(`座位 ${i + 1} 玩家`, { exact: true }).selectOption(ids[i]);
  await page.getByLabel('座位 4 身份', { exact: true }).selectOption('主公');
  await expect(page.getByLabel('身份分配', { exact: true })).toHaveValue('fixed');
  const assigned = await page
    .locator('.seat-role-picker select')
    .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).value));
  expect([...assigned].sort()).toEqual(['主公', '忠臣', '反贼', '内奸'].sort());
  await page.getByLabel('对战名称', { exact: true }).fill('多局身份与胜率');
  await page.getByLabel('总局数', { exact: true }).fill('3');
  await page.getByRole('button', { name: '展开实验参数' }).click();
  await page.getByLabel('行动间隔 (ms)', { exact: true }).fill('0');
  await page.getByLabel('每局决策上限', { exact: true }).fill('20');
  await page.screenshot({ path: 'artifacts/random-role-builder-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/random-role-builder-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/matches') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '开始对战', exact: true }).click();
  const match = await (await created).json();
  expect(match.config.roleAssignments).toEqual(
    Object.fromEntries(ids.map((id, i) => [id, assigned[i]])),
  );
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/matches')).json()).find((m: any) => m.id === match.id)
          .status,
    )
    .toBe('finished');
  const detail = await (await request.get(`/api/players/${ids[0]}`)).json();
  expect(detail.history).toHaveLength(3);
  expect(detail.history.every((g: any) => g.role === assigned[0])).toBe(true);
  const exported = await (
    await request.get(`/api/games/${detail.history.find((g: any) => g.number === 1).gameId}/export`)
  ).json();
  expect(exported.events.find((e: any) => e.type === 'turn').actor).toBe(3);
  const second = await (
    await request.post('/api/matches', {
      data: { name: '另一场统计对战', playerIds: ids, games: 2, paceMs: 0, maxDecisions: 20 },
    })
  ).json();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/matches')).json()).find((m: any) => m.id === second.id)
          .status,
    )
    .toBe('finished');
  await page.getByRole('button', { name: '玩家库', exact: true }).click();
  await page.locator('.roster-item').filter({ hasText: '身份统计玩家 1' }).click();
  await page.getByRole('tab', { name: '参战历史' }).click();
  await expect(page.locator('.match-history-group')).toHaveCount(2);
  await expect(page.locator('.history-overall')).toContainText('参与 2 场对战 · 已结束 5 局');
  const group = page.locator('.match-history-group').filter({ hasText: '多局身份与胜率' });
  await expect(group.locator('.player-history-row')).toHaveCount(3);
  await expect(group.locator('.match-history-score')).toContainText('本场胜率');
  await expect(group.locator('summary')).toContainText('已结束 3 / 计划 3 局');
  await page.screenshot({ path: 'artifacts/match-winrate-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/match-winrate-mobile.png', fullPage: true });
  await group.locator('summary').click();
  await expect(group.locator('.player-history-row').first()).not.toBeVisible();
  await group.locator('summary').click();
  await group.locator('.player-history-row').first().click();
  await expect(page.getByRole('heading', { name: '多局身份与胜率', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('真实出牌事件播放动画，重复刷新不重播，回放与切局清除效果', async ({ page, request }) => {
  const created = await (
    await request.post('/api/matches', {
      data: {
        name: '出牌动画测试',
        agents: [
          { id: 'fx-a', name: '凌云', kind: 'heuristic', hero: '张飞' },
          { id: 'fx-b', name: '听澜', kind: 'heuristic', hero: '关羽' },
        ],
        autoStart: false,
        paceMs: 0,
        seed: 42,
      },
    })
  ).json();
  const match = (await (await request.get('/api/matches')).json()).find(
      (m: any) => m.id === created.id,
    ),
    game = match.games[0];
  await page.goto('/#/arena/sanguosha');
  await expect(page.getByRole('heading', { name: '出牌动画测试', exact: true })).toBeVisible();
  await expect(page.locator('.player-panel')).toHaveCount(2);
  await expect(page.getByLabel('回放时间轴')).toHaveValue(String(game.revision));
  await expect(page.locator('.card-play-effect')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    (window as any).__plays = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes)
          if (n instanceof HTMLElement && n.matches('.card-play-effect'))
            (window as any).__plays.push(n.dataset.eventSeq);
    }).observe(document.querySelector('.battle-effects')!, { childList: true });
  });
  await request.post(`/api/matches/${match.id}/step`);
  await expect(page.locator('.flying-card-group').first()).toBeVisible();
  expect(
    await page
      .locator('.flying-card-group')
      .first()
      .evaluate((el) => el.getAnimations().length),
  ).toBeGreaterThan(0);
  await page
    .locator('.card-play-effect')
    .first()
    .evaluate((el) => {
      for (const animation of el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 700;
      }
    });
  expect(
    await page
      .locator('.flying-card-group')
      .first()
      .evaluate((el) => Number(getComputedStyle(el).opacity)),
  ).toBeGreaterThan(0.9);
  await page.screenshot({ path: 'artifacts/upgrade-card-animation.png', fullPage: true });
  await expect(page.locator('.card-play-effect')).toHaveCount(0);
  await page.waitForTimeout(1200);
  const plays = await page.evaluate(() => (window as any).__plays);
  expect(plays.length).toBeGreaterThan(0);
  expect(new Set(plays).size).toBe(plays.length);
  await page.getByLabel('回放时间轴').fill('1');
  await expect(page.locator('.live-tag')).toHaveText('REPLAY');
  await expect(page.locator('.card-play-effect')).toHaveCount(0);
  await page.getByRole('button', { name: '回到实时' }).click();
  await expect(page.locator('.live-tag')).toHaveText('LIVE');
  await expect(page.locator('.card-play-effect')).toHaveCount(0);
  const other = await (
    await request.post('/api/matches', {
      data: {
        name: '切局与减少动态效果测试',
        agents: [
          { id: 'fx-a', name: '凌云', kind: 'heuristic', hero: '张飞' },
          { id: 'fx-b', name: '听澜', kind: 'heuristic', hero: '关羽' },
        ],
        autoStart: false,
        seed: 42,
      },
    })
  ).json();
  await request.post(`/api/matches/${match.id}/step`);
  await expect(page.locator('.flying-card-group').first()).toBeVisible();
  await page.locator('.match-item').filter({ hasText: '切局与减少动态效果测试' }).click();
  await expect(
    page.getByRole('heading', { name: '切局与减少动态效果测试', exact: true }),
  ).toBeVisible();
  const second = (await (await request.get('/api/matches')).json()).find(
    (m: any) => m.id === other.id,
  ).games[0];
  await expect(page.getByLabel('回放时间轴')).toHaveValue(String(second.revision));
  await expect(page.locator('.card-play-effect')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await request.post(`/api/matches/${other.id}/step`);
  await expect(page.locator('.flying-card-group').first()).toBeVisible();
  expect(
    await page
      .locator('.flying-card-group')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
});

test('并行实时切局、整场暂停与单局单步、按场收集RSI和调用玩家API归纳经验', async ({
  page,
  request,
}) => {
  const errors: string[] = [],
    summaryModels: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw),
      system = body.messages[0].content,
      input = JSON.parse(body.messages[1].content);
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (res.destroyed) return;
    let result;
    if (system.includes('负责为一名三国杀 Agent 归纳')) {
      summaryModels.push(body.model);
      result = {
        immediate: '关键响应时保留防御资源，结合当前体力判断风险。',
        round: '跨局观察行动再判断身份，及时修正不可靠的推测。',
        shared: '先核对合法动作与距离，再选择收益明确的行动。',
      };
    } else if (system.includes('shouldRemember'))
      result = {
        shouldRemember: true,
        memory: system.includes('行动后即时反思')
          ? '即时经验：保留防御资源，根据当前体力选择响应。'
          : '轮次经验：综合多轮行为判断身份，不把猜测当成事实。',
        reason: '本地模拟 RSI',
      };
    else result = heuristic(input);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        model: body.model,
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const ids = ['parallel-e2e-a', 'parallel-e2e-b'];
  let matchId = '';
  try {
    for (const [i, id] of ids.entries()) {
      const r = await request.post('/api/players', {
        data: {
          id,
          name: `并行实验玩家${i ? '乙' : '甲'}`,
          hero: '张飞',
          kind: 'llm',
          rsi: 'both',
          apiMode: 'custom',
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKey: 'e2e-private-key',
          model: `parallel-model-${i}`,
        },
      });
      expect(r.ok()).toBe(true);
    }
    await page.goto('/#/arena/sanguosha');
    await page.getByRole('button', { name: '新建对战', exact: true }).click();
    await expect(page.getByLabel('并行局数', { exact: true })).toHaveValue('1');
    await page.getByLabel('玩家人数', { exact: true }).selectOption('2');
    for (let i = 1; i <= 2; i++)
      await page.getByLabel(`座位 ${i} 玩家`, { exact: true }).selectOption('');
    for (let i = 1; i <= 2; i++)
      await page.getByLabel(`座位 ${i} 玩家`, { exact: true }).selectOption(ids[i - 1]);
    await page.getByLabel('对战名称', { exact: true }).fill('并行 RSI 经验实验');
    await page.getByLabel('总局数', { exact: true }).fill('3');
    await page.getByLabel('并行局数', { exact: true }).fill('2');
    await page.getByRole('button', { name: '展开实验参数' }).click();
    await page.getByLabel('行动间隔 (ms)', { exact: true }).fill('100');
    await page.getByLabel('每局决策上限', { exact: true }).fill('20');
    await page.screenshot({ path: 'artifacts/parallel-match-builder.png', fullPage: true });
    const created = page.waitForResponse(
      (r) => r.url().endsWith('/api/matches') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '开始对战', exact: true }).click();
    matchId = (await (await created).json()).id;
    await expect(page.locator('.parallel-game')).toHaveCount(2);
    const match = (await (await request.get('/api/matches')).json()).find(
      (m: any) => m.id === matchId,
    );
    const [first, second] = match.games;
    await page.getByRole('button', { name: '观摩第 1 局', exact: true }).click();
    await expect(page.getByLabel('选择对局')).toHaveValue(first.id);
    await page.getByRole('button', { name: '观摩第 2 局', exact: true }).click();
    await expect(page.getByLabel('选择对局')).toHaveValue(second.id);
    await expect(page.locator('.player-panel')).toHaveCount(2);
    await page.screenshot({ path: 'artifacts/parallel-arena-live.png', fullPage: true });
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.getByRole('button', { name: '继续', exact: true })).toBeEnabled();
    const before = await (await request.get(`/api/games/${first.id}`)).json();
    const secondBefore = await (await request.get(`/api/games/${second.id}`)).json();
    await page.getByRole('button', { name: '单步执行', exact: true }).click();
    await expect
      .poll(async () => (await (await request.get(`/api/games/${second.id}`)).json()).decisionCount)
      .toBe(secondBefore.decisionCount + 1);
    expect((await (await request.get(`/api/games/${first.id}`)).json()).view.revision).toBe(
      before.view.revision,
    );
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await (await request.get('/api/matches')).json()).find((m: any) => m.id === matchId)
            .status,
        { timeout: 20000 },
      )
      .toBe('finished');
    await expect(page.locator('.parallel-game')).toHaveCount(3);
    await expect(page.getByLabel('选择对局')).toHaveValue(second.id);
    await page.getByRole('button', { name: '玩家库', exact: true }).click();
    await page.locator('.roster-item').filter({ hasText: '并行实验玩家甲' }).click();
    await page.getByRole('tab', { name: '个人经验' }).click();
    const group = page.locator('.experience-group').filter({ hasText: '并行 RSI 经验实验' });
    await expect(group.locator('.type-immediate')).toBeVisible();
    await expect(group.locator('.type-round')).toBeVisible();
    await expect(group.locator('.type-round summary')).toContainText('3 条');
    await group.getByRole('button', { name: '经验归纳', exact: true }).click();
    await expect(group.locator('.consolidation-status.completed')).toBeVisible();
    await expect(group.locator('.type-consolidated')).toContainText('关键响应时保留防御资源');
    await expect(group.locator('.type-consolidated')).toContainText('轮次 RSI 归纳');
    expect(summaryModels).toEqual(['parallel-model-0']);
    const detail = await (await request.get(`/api/players/${ids[0]}`)).json();
    expect(detail.memories.filter((m: any) => m.mode === 'round')).toHaveLength(3);
    expect(detail.memories.find((m: any) => m.mode === 'consolidated').matchId).toBe(matchId);
    await page.screenshot({
      path: 'artifacts/experience-consolidation-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({
      path: 'artifacts/experience-consolidation-mobile.png',
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    if (matchId) await request.post(`/api/matches/${matchId}/stop`);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
