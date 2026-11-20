import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newWorld } from '../src/year/content/scenarios';
import { execute, makeCommand } from '../src/year/engine/reducer';
import { encode } from '../src/year/storage/replay';

const yearUrl = '/campus-chaos/year?mode=demo';
const windowLabel = (page: Page, number: number) => page.getByText(`第 ${number} / 24 窗口`, { exact: true });

async function newYear(page: Page) {
  await page.goto(yearUrl);
  await page.getByRole('button', { name: '开始学年' }).click();
  await expect(windowLabel(page, 1)).toBeVisible();
}

test('opens the year from the homepage and offers all four scenarios plus the original challenge', async ({ page }) => {
  await page.goto('/?mode=demo');
  await expect(page).toHaveURL(/campus-chaos\/year\?mode=demo$/);
  await expect(page.getByRole('link', { name: '五日挑战' })).toHaveAttribute('href', '/campus-chaos');
  await page.getByRole('link', { name: '比较四种开局' }).click();
  await expect(page.getByRole('link', { name: '选用这个背景' })).toHaveCount(4);
  await page.getByRole('link', { name: '选用这个背景' }).nth(1).click();
  await expect(page.getByLabel('开局背景')).toHaveValue('legacy');
  await expect(page.getByText('¥850', { exact: true })).toBeVisible();
});

test('opens an A/B export, unlocks C/D in a new copy, and reopens both archives', async ({ page }) => {
  const initial = newWorld('old-ab-export', 'fair-01');
  const choice = execute(initial, makeCommand(initial, 'opening', { kind: 'choose', decisionId: 'w1', optionId: 'join-photo' }));
  if (!choice.ok) throw new Error(choice.message);
  await page.goto(yearUrl);
  const json = encode({ world: choice.world, receipts: [choice.receipt], mode: 'demo' });
  await page.getByLabel('导入年度 JSON').setInputFiles({ name: 'old-ab.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '谈判', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '在副本中解锁谈判与带教' }).click();
  await expect(page.getByRole('button', { name: '谈判', exact: true })).toBeVisible();
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /继续最近学年/ }).click();
  await expect(page.getByRole('button', { name: '带教', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await page.getByRole('button', { name: /^继续学年 ·/ }).click();
  await expect(page.getByRole('button', { name: '在副本中解锁谈判与带教' })).toBeVisible();
});

test('keeps the first choice, restores it, and imports valid exports as another slot', async ({ page }, testInfo) => {
  await newYear(page);
  await page.getByRole('button', { name: /和摄影社联摆/ }).dblclick();
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await expect(page.getByText('主路联摆 · 珞珈社团 × 摄影社', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '周历' }).click();
  await expect(page.getByRole('dialog').getByText('樱坡广场', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '结算并推进' }).click();
  await expect(windowLabel(page, 2)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /继续最近学年/ }).click();
  await expect(windowLabel(page, 2)).toBeVisible();
  await page.getByRole('button', { name: '快进到下一件事' }).click();
  await expect(windowLabel(page, 3)).toBeVisible();
  await expect(page.getByRole('heading', { name: '人群涌到门口' })).toBeVisible();

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出档案', exact: true }).click();
  const file = testInfo.outputPath('year.json');
  await (await downloading).saveAs(file);
  const original = JSON.parse(await readFile(file, 'utf8'));
  expect(original.trail).toHaveLength(3);
  await page.getByRole('button', { name: '档案', exact: true }).click();
  const input = page.getByLabel('导入年度 JSON');
  await input.setInputFiles({ name: 'bad-year.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert').filter({ hasText: '无法读取 JSON 格式' })).toBeVisible();
  await input.setInputFiles(file);
  await expect(windowLabel(page, 3)).toBeVisible();
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await expect(page.getByRole('button', { name: /^继续.*学年/ })).toHaveCount(2);
});

test('rejects a stale tab and recovers from a damaged state using the recorded actions', async ({ page, context }) => {
  await page.goto(yearUrl);
  await page.evaluate(() => localStorage.setItem('campus-chaos-p1', 'legacy-byte-marker'));
  await newYear(page);
  const other = await context.newPage();
  await other.goto(yearUrl);
  await other.getByRole('button', { name: /继续最近学年/ }).click();
  await expect(windowLabel(other, 1)).toBeVisible();

  await page.getByRole('button', { name: /和摄影社联摆/ }).click();
  await expect(page.getByText('¥460', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: /出 ¥80 争主路展位/ }).click();
  await expect(other.getByRole('alert').filter({ hasText: '另一个标签页已经推进' })).toBeVisible();
  await other.getByRole('button', { name: '读取最新进度' }).click();
  await expect(other.getByText('¥460', { exact: true })).toBeVisible();

  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('campus-chaos-academic-year');
    open.onerror = reject;
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('years', 'readwrite');
      const store = tx.objectStore('years');
      const all = store.getAll();
      all.onsuccess = () => {
        const header = all.result[0];
        header.world.clubs.player.cash = 10;
        store.put(header);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = reject;
    };
  }));
  await other.reload();
  await other.getByRole('button', { name: /继续最近学年/ }).click();
  await expect(other.getByText('已从账本恢复')).toBeVisible();
  await expect(other.getByText('¥460', { exact: true })).toBeVisible();

  await other.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      const request = add.apply(this, args);
      if (this.name === 'receipts') {
        IDBObjectStore.prototype.add = add;
        this.transaction.abort();
      }
      return request;
    };
  });
  await other.getByRole('button', { name: '结算并推进' }).click();
  await expect(other.getByRole('alert').filter({ hasText: '保存失败' })).toBeVisible();
  await other.reload();
  await other.getByRole('button', { name: /继续最近学年/ }).click();
  await expect(windowLabel(other, 1)).toBeVisible();
  await expect(other.getByText('¥460', { exact: true })).toBeVisible();
  await other.getByRole('button', { name: '结算并推进' }).click();
  await expect(windowLabel(other, 2)).toBeVisible();
  expect(await other.evaluate(() => localStorage.getItem('campus-chaos-p1'))).toBe('legacy-byte-marker');
});

test('plays every chapter, including the autumn rivals, the returned table, and the June archive', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await newYear(page);
  const route: Record<number, RegExp> = {
    1: /出 ¥80 争主路展位/, 5: /借桌并派江一协助/, 6: /改办工坊小场/,
    14: /给摄影社一个修复机会/, 16: /把志愿者调到侧门/, 22: /安排部长轮值/,
  };
  for (let n = 1; n <= 24; n++) {
    await expect(windowLabel(page, n)).toBeVisible();
    if (n === 6) {
      await expect(page.getByRole('button', { name: /预约湖畔舞台/ })).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath('november-venue.png'), fullPage: true });
    }
    const choice = route[n] ? page.getByRole('region', { name: '本期决策' }).getByRole('button', { name: route[n] }) : page.locator('.yr-choice:enabled').first();
    if (await choice.count()) await choice.click();
    const approval = page.getByRole('button', { name: '谢绝', exact: true });
    if (await approval.isVisible()) await approval.click();
    await page.getByRole('button', { name: n === 24 ? '完成六月交接' : '结算并推进' }).click();
  }
  await expect(page.getByRole('heading', { name: '六月交接完成' })).toBeVisible();
  await expect(page.getByText('部长组按轮值表接班。')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('june-archive.png'), fullPage: true });
  await page.getByRole('button', { name: '账本' }).click();
  const ledger = page.getByRole('dialog', { name: '账本' });
  for (const title of ['摄影社和音乐社签了联演', '折叠桌已经归还', '两社完成一次春季协作', '侧门班次已兑现']) {
    await expect(ledger.getByText(title, { exact: true })).toHaveCount(1);
  }
  await ledger.getByRole('button', { name: '起因 · 旧书社愿意还一班人手', exact: true }).first().click();
  await expect(ledger.getByText('旧书社愿意还一班人手', { exact: true })).toBeVisible();
  await expect(ledger.getByRole('button', { name: '起因 · 旧书社借桌承诺已成立' })).toBeVisible();
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '翻阅年度年鉴' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: '换届投票' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载年鉴' }).click();
  expect((await download).suggestedFilename()).toMatch(/campus-yearbook/);
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '交给下一届' }).click();
  await expect(page.getByText(/2027–2028 学年/)).toBeVisible();
  await page.getByRole('button', { name: '档案', exact: true }).click();
  await expect(page.getByRole('button', { name: /回看六月档案/ })).toBeVisible();
});

test.describe('annual mobile', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('can choose a stall and open records in a narrow fullscreen layout', async ({ page }, testInfo) => {
    await newYear(page);
    await page.getByRole('button', { name: '全屏', exact: true }).tap();
    await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible();
    const map = page.getByRole('region', { name: '校园地图' });
    expect(await map.boundingBox()).toMatchObject({ x: 0, y: 0, width: 375, height: 812 });
    await page.getByRole('button', { name: '隐藏决策' }).tap();
    await expect(page.getByRole('region', { name: '本期决策' })).toBeHidden();
    await page.getByRole('button', { name: '打开决策' }).tap();
    await page.getByRole('button', { name: /和摄影社联摆/ }).tap();
    await page.getByRole('button', { name: '人物', exact: true }).tap();
    await expect(page.getByRole('dialog', { name: '人物' }).getByText(/阿南 ·/)).toBeVisible();
    await page.getByRole('button', { name: '关闭详情' }).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.screenshot({ path: testInfo.outputPath('mobile-fullscreen.png'), fullPage: true });
  });
});

test('takes an editable free strategy through a counteroffer and leaves auditable bookings', async ({ page }, testInfo) => {
  await newYear(page);
  await page.getByRole('button', { name: /和摄影社联摆/ }).click();
  await page.getByRole('button', { name: '谈判', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '谈判' });
  await panel.getByLabel('给社团伙伴的计划').fill('想和音乐社在第6窗口湖畔舞台联演');
  await panel.getByRole('button', { name: '解析成草案' }).click();
  await expect(panel.getByText(/请补全或修正/)).toBeVisible();
  await expect(panel.getByRole('button', { name: '向伙伴询价' })).toBeDisabled();
  await panel.getByRole('button', { name: '填入联演示例' }).click();
  await panel.getByRole('button', { name: '解析成草案' }).click();
  await panel.getByLabel('费用（元）').fill('21');
  await panel.getByRole('button', { name: '向伙伴询价' }).click();
  await expect(panel.getByText(/对方反价/)).toBeVisible();
  await panel.getByLabel('选择音乐社报价').check();
  await panel.getByRole('button', { name: '签署所选 1 组' }).click();
  await expect(panel.getByText(/已签署/)).toBeVisible();
  await expect(panel.getByText(/冻结 ¥22/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('signed-deal.png'), fullPage: true });
  await page.getByRole('button', { name: '关闭详情' }).click();
  await page.getByRole('button', { name: '周历' }).click();
  await expect(page.getByRole('dialog').getByText('何木', { exact: true })).toBeVisible();
});

test('rejects malformed input and ignores a delayed director result after switching to rules', async ({ page, request }) => {
  const endpoint = 'http://127.0.0.1:3211/api/campus/year/decide';
  expect((await request.post(endpoint, { data: { window: -1, options: [] } })).status()).toBe(400);
  expect((await request.post(endpoint, { data: 'x'.repeat(12001) })).status()).toBe(413);
  await page.goto('http://127.0.0.1:3211/campus-chaos/year');
  await page.getByRole('button', { name: '开始学年' }).click();
  await page.getByRole('button', { name: /和摄影社联摆/ }).click();
  let release!: () => void;
  const outstanding = new Promise<void>(resolve => { release = resolve; });
  let seen!: () => void;
  const requestSeen = new Promise<void>(resolve => { seen = resolve; });
  await page.route('**/api/campus/year/decide', async route => {
    const input = route.request().postDataJSON();
    seen();
    await outstanding;
    await route.fulfill({ json: { yearId: input.yearId, revision: input.revision, basisDigest: input.basisDigest,
      status: 'live', invalid: 0, selection: { traceId: 'late-01', intentIds: ['w1:anan:scout'] } } }).catch(() => {});
  });
  await page.getByRole('button', { name: '结算并推进' }).click();
  await requestSeen;
  await page.getByRole('button', { name: '用本地规则继续' }).click();
  await expect(windowLabel(page, 2)).toBeVisible();
  release();
  await expect(page.getByText('上次结算 · 规则接管')).toBeVisible();
  await page.getByRole('button', { name: '账本' }).click();
  await expect(page.getByRole('dialog').getByText('阿南：跟摄影社一起联络新生', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/late-01/)).toHaveCount(0);
});
