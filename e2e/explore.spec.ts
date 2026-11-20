import { expect, test, type Page } from '@playwright/test';

const start = async (page: Page) => {
  await page.goto('/campus-chaos/year?mode=demo');
  await page.getByRole('button', { name: '开始学年', exact: true }).click();
  await expect(page.getByRole('region', { name: '本期决策' })).toBeVisible();
  await expect(page.getByTestId('walking-player')).toBeVisible();
};

const scene = (page: Page) => page.getByRole('region', { name: '校园地图' });
const target = (page: Page, id: string) => scene(page).locator(`[data-target="${id}"]`);

test('moves by WASD, speaks to a moving NPC and crosses each real scene', async ({ page }) => {
  test.setTimeout(55_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  const player = page.getByTestId('walking-player');
  const chen = target(page, 'chenlan');
  const initial = await chen.evaluate(node => node.style.left);
  await expect.poll(() => chen.evaluate(node => node.style.left)).not.toBe(initial);

  await page.keyboard.down('KeyD');
  await expect.poll(async () => player.evaluate(node => parseFloat(node.style.left))).toBeGreaterThan(54);
  await page.keyboard.up('KeyD');
  const before = await player.evaluate(node => parseFloat(node.style.top));
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => player.evaluate(node => parseFloat(node.style.top))).toBeLessThan(before - 4);
  await page.keyboard.up('ArrowUp');

  await chen.click({ force: true });
  await expect(scene(page).getByRole('button', { name: '看看两处展台' })).toBeVisible({ timeout: 4500 });
  await scene(page).getByRole('button', { name: '看看两处展台' }).click();
  await expect(target(page, 'choice:join-photo')).toBeVisible();
  await expect(target(page, 'choice:solo-fair')).toBeVisible();

  for (const name of ['stage', 'workshop', 'library', 'room']) {
    await target(page, `door:${name}`).click();
    await expect(scene(page)).toHaveAttribute('data-scene', name, { timeout: 6500 });
    const loaded = scene(page).locator('.walk-background');
    await expect(loaded).toHaveAttribute('src', `/art/walk-${name}.webp`);
    await expect.poll(() => loaded.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(1000);
    await target(page, 'exit').click();
    await expect(scene(page)).toHaveAttribute('data-scene', 'plaza');
  }
});

test('drags and resets the fullscreen decision card and delivers physical recruitment supplies', async ({ page }, info) => {
  test.setTimeout(45_000);
  await start(page);
  await page.getByRole('button', { name: '全屏', exact: true }).click();
  const handle = page.getByRole('button', { name: '拖动决策卡' });
  const panel = page.getByRole('region', { name: '本期决策' });
  const original = (await panel.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 18, grip.y + 12);
  await page.mouse.down();
  await page.mouse.move(grip.x - 308, grip.y + 76, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(original.x - 275);
  await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThan(original.y + 45);
  await page.screenshot({ path: info.outputPath('dragged-decision.png') });
  await page.getByRole('button', { name: '重置决策卡位置' }).click();
  await expect.poll(async () => Math.round((await panel.boundingBox())!.x)).toBe(Math.round(original.x));
  await page.getByRole('button', { name: /和摄影社联摆/ }).click();

  await page.getByRole('button', { name: '隐藏决策' }).click();
  await page.keyboard.press('KeyE');
  await expect(scene(page)).toHaveAttribute('data-scene', 'room');
  await target(page, 'poster-pickup').click();
  await expect(scene(page).getByRole('status')).toContainText('拿到了海报');
  await page.screenshot({ path: info.outputPath('room-supplies.png') });
  await target(page, 'exit').click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'plaza');
  await target(page, 'poster-board').click();
  await expect(scene(page).getByRole('status')).toContainText('已登记');
  await expect(scene(page).getByLabel('地点动态')).toContainText('报名 45');
  await page.getByRole('button', { name: '账本', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('招新海报已送达并张贴', { exact: true })).toBeVisible();
});

test('enters and leaves a scene before starting, opens the year at a booth and chooses capacity at 810px', async ({ page }, info) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 810, height: 871 });
  await page.goto('/campus-chaos/year?mode=demo');
  await expect(page.getByTestId('walking-player')).toBeVisible();
  await expect(page.getByRole('region', { name: '学年档案' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('opening-booths-810.png'), fullPage: true });
  await page.keyboard.down('KeyS');
  await expect(scene(page)).toHaveAttribute('data-scene', 'room');
  await page.keyboard.up('KeyS');
  await expect(page.getByRole('region', { name: '学年档案' })).toBeVisible();
  await page.keyboard.down('KeyS');
  await expect(scene(page)).toHaveAttribute('data-scene', 'plaza');
  await page.keyboard.up('KeyS');

  await target(page, 'choice:join-photo').click();
  await expect(page.getByRole('region', { name: '本期决策' })).toBeVisible();
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await expect(scene(page)).toHaveAttribute('data-scene', 'plaza');
  await target(page, 'door:room').click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'room');
  await expect(target(page, 'poster-pickup')).toContainText('预计接待 40 · 候补 5');
  await expect(target(page, 'route-pickup')).toContainText('预计接待 39 · 候补 0');
  await page.screenshot({ path: info.outputPath('recruitment-choice-810.png'), fullPage: true });
  await target(page, 'poster-pickup').click();
  await expect(scene(page).getByRole('status')).toContainText('拿到了海报');
  await expect(target(page, 'route-pickup')).toContainText('换成入口引导牌');
  await target(page, 'route-pickup').click();
  await expect(scene(page).getByRole('status')).toContainText('拿到了引导牌');
  await target(page, 'exit').click();
  await expect(scene(page)).toHaveAttribute('data-scene', 'plaza');
  await target(page, 'poster-board').click();
  await expect(scene(page).getByLabel('地点动态')).toContainText('报名 39 · 容量 46');
  await page.getByRole('button', { name: '收工结算' }).click();
  await expect(page.getByText('第 2 / 24 窗口', { exact: true })).toBeVisible();
  await expect(scene(page).getByLabel('地点动态')).toContainText('入场 39 · 候补 0');
  await page.getByRole('button', { name: '账本', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('招新引导牌已就位', { exact: true })).toBeVisible();
});

test.describe('touch exploration', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 812 } });

  test('moves from the touch controls and takes a scene entrance', async ({ page }, info) => {
    await start(page);
    await page.getByRole('button', { name: '全屏', exact: true }).tap();
    await page.getByRole('button', { name: '隐藏决策', exact: true }).tap();
    const player = page.getByTestId('walking-player');
    const before = await player.evaluate(node => parseFloat(node.style.left));
    await scene(page).getByRole('button', { name: '向左走' }).tap();
    await expect.poll(() => player.evaluate(node => parseFloat(node.style.left))).toBeLessThan(before);
    await target(page, 'door:room').tap();
    await expect(scene(page)).toHaveAttribute('data-scene', 'room');
    await page.screenshot({ path: info.outputPath('touch-campus.png') });
  });
});
