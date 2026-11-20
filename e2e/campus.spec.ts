import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { legalDecisions } from '../src/game/events';
import { directorRequest, initialState, takeAction } from '../src/game/rules';

async function respond(page: Page) {
  const options = page.locator('.incident-option');
  if (await options.count()) await options.first().click();
}

test('starts at the entrance, sees the scene change, wins in five moves, and replays', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', error => pageErrors.push(error));
  await page.goto('/?legacy=1');
  await expect(page).toHaveURL(/campus-chaos$/);
  await expect(page.getByTestId('budget')).toHaveText('¥500');
  await expect(page.locator('.mode')).toHaveText('演示模式');
  await page.screenshot({ path: 'output/p1/01-接手社团.png' });
  await page.getByRole('button', { name: '接手社团' }).click();
  await expect(page.getByRole('button', { name: /协调矛盾/ })).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: /宣传造势/ }).click();
  await expect(page.getByTestId('budget')).toHaveText('¥420', { timeout: 500 });
  await expect(page.getByTestId('signups')).toHaveText('17');
  await expect(page.locator('.scene-caption')).toContainText('海报 3');
  await expect(page.locator('.calendar')).toHaveAccessibleName('第 2 天，共五天');
  await page.screenshot({ path: 'output/p1/02-部长提案.png' });

  for (const action of ['宣传造势', '搭建摊位', '彩排与分工', '协调矛盾']) {
    await respond(page);
    await page.getByRole('button', { name: new RegExp(action) }).click();
  }
  await expect(page.getByRole('heading', { name: '樱花市集开场了！' })).toBeVisible();
  await expect(page.locator('.scene-day')).toHaveText('市集进行中');
  await expect(page.locator('.scene-art')).toHaveAttribute('src', '/art/sakura-festival.webp');
  await page.screenshot({ path: 'output/p1/03-灯火开场.png' });
  await page.getByRole('button', { name: '看回合日志' }).click();
  await expect(page.getByRole('dialog', { name: '回合日志' })).toContainText('搭建摊位');
  await page.screenshot({ path: 'output/p1/04-回合日志.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '固定种子重练' }).click();
  await expect(page.getByTestId('budget')).toHaveText('¥500');
  await expect(page.locator('.calendar')).toHaveAccessibleName('第 1 天，共五天');
  expect(pageErrors).toEqual([]);
});

test('supports the shortfall ending and shows the specific gap', async ({ page }) => {
  await page.goto('/campus-chaos');
  await page.getByRole('button', { name: '接手社团' }).click();
  for (let day = 0; day < 5; day += 1) {
    await respond(page);
    await page.getByRole('button', { name: /彩排与分工/ }).click();
  }
  await expect(page.getByRole('heading', { name: '摊位搭好了，来的人太少' })).toBeVisible();
  await expect(page.getByRole('region', { name: '结局复盘' })).toContainText('报名还差');
  await page.getByRole('button', { name: '开新一局' }).click();
  await page.getByRole('button', { name: '开始筹备' }).click();
  await expect(page.getByTestId('signups')).toHaveText('5');
});

test('shows a live waitlist and a distinct ending when a publicity-only run cannot admit the crowd', async ({ page }) => {
  await page.goto('/campus-chaos');
  await page.getByRole('button', { name: '接手社团' }).click();
  for (let day = 0; day < 5; day += 1) {
    const options = page.locator('.incident-option');
    if (await options.count()) await options.last().click();
    await page.getByRole('button', { name: /宣传造势/ }).click();
  }
  await expect(page.getByRole('heading', { name: '报名够了，场地装不下' })).toBeVisible();
  await expect(page.locator('.entrance')).toContainText('候补');
  await expect(page.getByRole('region', { name: '结局复盘' })).toContainText('接待还差');
  await page.screenshot({ path: 'output/p1/07-候补结局.png' });
});

test.describe('mobile', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test('fits 375px and keeps the actions available on touch', async ({ page }) => {
    await page.goto('/campus-chaos');
    await page.getByRole('button', { name: '接手社团' }).tap();
    await page.getByRole('button', { name: /社团联动/ }).tap();
    await respond(page);
    await expect(page.getByRole('button', { name: /搭建摊位/ })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    await page.screenshot({ path: 'output/p1/05-手机试玩.png', fullPage: true });
    await page.getByRole('button', { name: '进入全屏' }).tap();
    await expect(page.locator('.game-shell')).toHaveClass(/cinema/);
    await page.getByRole('button', { name: /搭建摊位/ }).tap();
    await expect(page.locator('.calendar')).toHaveAccessibleName('第 3 天，共五天');
  });
});

test('updates the HUD while a live request is pending, then continues on errors', async ({ page }) => {
  await page.route('**/api/campus/director', async route => {
    await new Promise(resolve => setTimeout(resolve, 850));
    await route.fulfill({ status: 500 });
  });
  await page.goto('http://127.0.0.1:3211/campus-chaos');
  await expect(page.locator('.mode')).toHaveText('实时 AI');
  await page.getByRole('button', { name: '接手社团' }).click();
  await page.getByRole('button', { name: /社团联动/ }).click();
  await expect(page.getByTestId('budget')).toHaveText('¥460', { timeout: 500 });
  await expect(page.getByRole('heading', { name: '社员正在商量' })).toBeVisible();
  await expect(page.locator('.mode')).toHaveText('降级模式');
  await expect(page.locator('.calendar')).toHaveAccessibleName('第 2 天，共五天');
  await respond(page);
  await expect(page.getByRole('button', { name: /搭建摊位/ })).toBeEnabled();
});

test('a compatible provider can select a different legal incident and affect the next choices', async ({ page }) => {
  let providerCalls = 0;
  const snapshot = directorRequest(takeAction(initialState('sakura-01'), 'CLUB_ALLIANCE')).snapshot;
  const pick = legalDecisions(snapshot).findIndex(decision => decision.eventId === 'TEAM_DISPUTE' && decision.offerId === 'ROUTE_DRILL') + 1;
  const provider = createServer((request, response) => {
    providerCalls += 1;
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'local-test-request' });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      pick, line: '两边刚递来不同的排班表，要一起过一遍吗？', reason: '合作后需要对齐分工。',
    }) } }] }));
  });
  await new Promise<void>((resolve, reject) => {
    provider.once('error', reject);
    provider.listen(3212, '127.0.0.1', resolve);
  });

  try {
    await page.goto('http://127.0.0.1:3211/campus-chaos');
    await page.getByRole('button', { name: '接手社团' }).click();
    await page.getByRole('button', { name: /社团联动/ }).click();
    await expect(page.getByRole('heading', { name: '两张排班表对不上' })).toBeVisible();
    await page.getByRole('button', { name: /开个短会对齐/ }).click();
    await expect(page.getByTestId('cohesion')).toHaveText('69');
    await expect(page.getByTestId('readiness')).toHaveText('33');
    await page.getByRole('button', { name: '回合日志', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: '回合日志' });
    await dialog.getByText('实时 AI · 已校验并载入局势').click();
    await expect(dialog).toContainText('合作后需要对齐分工。');
    expect(providerCalls).toBe(1);
    await page.keyboard.press('Escape');
    const rehearse = page.getByRole('button', { name: /彩排与分工/ });
    await expect(rehearse).toContainText('加测两条动线');
    await expect(rehearse.locator('.action-cost')).toHaveText('−¥50');
    const offer = page.getByRole('checkbox', { name: /用于/ });
    await offer.uncheck();
    await expect(rehearse.locator('.action-cost')).toHaveText('−¥40');
    await offer.check();
    await rehearse.click();
    await expect(page.getByTestId('budget')).toHaveText('¥410');
    await expect(page.getByTestId('capacity')).toHaveText('35');
  } finally {
    provider.closeAllConnections();
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()));
  }
});

test('uses the full viewport to play the rain scenario and restores the game on reload', async ({ page }) => {
  await page.goto('/campus-chaos');
  await page.getByRole('button', { name: '选择场次与导演' }).click();
  await page.getByRole('radio', { name: /雨备场/ }).check();
  await page.getByRole('button', { name: '开始筹备' }).click();
  await expect(page.getByTestId('budget')).toHaveText('¥340');
  await page.getByRole('button', { name: '进入全屏' }).click();
  await expect(page.locator('.game-shell')).toHaveClass(/cinema/);
  const scene = await page.locator('.scene').boundingBox();
  expect(scene).toEqual({ x: 0, y: 0, width: 1366, height: 768 });
  await page.getByRole('button', { name: /社团联动/ }).click();
  await expect(page.getByRole('heading', { name: '积水挡住了主入口' })).toBeVisible();
  await expect(page.locator('.scene-art')).toHaveAttribute('src', '/art/sakura-rain.webp');
  await page.screenshot({ path: 'output/p1/06-雨备场全屏.png' });
  await page.getByRole('button', { name: /借雨棚开侧门/ }).click();
  await expect(page.locator('.scene-route')).toHaveText('侧门入场');
  await page.getByRole('button', { name: '退出全屏' }).click();
  await expect(page.locator('.game-shell')).not.toHaveClass(/cinema/);
  await page.reload();
  await expect(page.getByTestId('budget')).toHaveText('¥255');
  await expect(page.locator('.calendar')).toHaveAccessibleName('第 2 天，共五天');
  await expect(page.getByRole('heading', { name: '积水挡住了主入口' })).toBeVisible();
  await expect(page.locator('.scene-route')).toHaveText('侧门入场');
  await expect(page.locator('.game-heading')).toContainText('已恢复进度');
});
