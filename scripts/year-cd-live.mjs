import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.CAMPUS_YEAR_SMOKE_URL ?? 'http://127.0.0.1:3062';
const output = process.env.CAMPUS_YEAR_SMOKE_OUTPUT ?? 'output/year-cd';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CAMPUS_TEST_BROWSER_CHANNEL ?? 'msedge' });
const requests = [];
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    const path = new URL(response.url()).pathname;
    if (!path.startsWith('/api/campus/year/') || !response.ok()) return;
    const input = response.request().postDataJSON();
    const result = await response.json();
    requests.push({ path, kind: input.kind ?? 'advance', window: input.window, source: result.source ?? result.status,
      traceId: result.traceId ?? result.selection?.traceId, adopted: result.selection?.intentIds, styles: result.styles });
  });
  const button = (name, area = page) => area.getByRole('button', { name, exact: typeof name === 'string' });
  const period = n => page.getByText(`第 ${n} / 24 窗口`, { exact: true });
  const close = () => button('关闭详情').click();
  const dialog = title => page.getByRole('dialog', { name: title });

  await page.goto(`${base}/campus-chaos/year?seed=fair-01&scenario=legacy`);
  await expect(page.getByLabel('导演方式')).toHaveValue('live');
  await button('开始学年').click();
  await button('全屏').click();
  await button('隐藏决策').click();
  const map = page.getByRole('region', { name: '校园地图' });
  expect(await map.boundingBox()).toMatchObject({ x: 0, y: 0, width: 1440, height: 900 });
  await expect(page.locator('.yr-map-image')).toHaveAttribute('src', '/art/year-autumn.webp');
  await page.screenshot({ path: join(output, '01-秋季全屏.png') });
  await button('打开决策').click();
  await button('退出全屏').click();

  await button(/和摄影社联摆/).click();
  await button('谈判').click();
  const strategy = dialog('谈判');
  await strategy.getByLabel('给社团伙伴的计划')
    .fill('想和音乐社在第6窗口的湖畔舞台联演，让江一负责，安排2小时，费用¥20，对方拿10%分成，独立署名。');
  await button('解析成草案', strategy).click();
  await expect(strategy.getByText('实时 AI 已提取草案，核对具体条款后再询价。')).toBeVisible({ timeout: 10_000 });
  await strategy.getByLabel('费用（元）').fill('21');
  await button('向伙伴询价', strategy).click();
  await expect(strategy.getByText(/对方反价/)).toBeVisible({ timeout: 10_000 });
  await strategy.getByLabel('选择音乐社报价').check();
  await button('签署所选 1 组', strategy).click();
  await expect(strategy.getByText(/已签署 · v2/)).toBeVisible();
  await page.screenshot({ path: join(output, '02-真实反价签署.png'), fullPage: true });
  await close();

  const route = { 5: /借桌并派江一协助/, 6: /预约湖畔舞台/, 9: /安排阿柠备考/,
    14: /同技术社做展廊备选/, 16: /把志愿者调到侧门/,
    17: /申请校园风云主舞台/, 19: /邀请有往来的伙伴联办/, 22: /邀请江一接班/ };
  const frames = { 9: '03-冬季.png', 13: '04-春季.png', 16: '05-雨天.png', 21: '06-五月节庆.png', 23: '07-六月暖夏.png' };
  for (let n = 1; n <= 24; n++) {
    await expect(period(n)).toBeVisible({ timeout: 12_000 });
    if (frames[n]) await page.screenshot({ path: join(output, frames[n]), fullPage: true });
    if (n === 7) {
      await button('谈判').click();
      await expect(dialog('谈判').getByText(/已履约/)).toBeVisible();
      await close();
    }
    const decision = route[n] ? button(route[n], page.getByRole('region', { name: '本期决策' })) : page.locator('.yr-choice:enabled').first();
    if (await decision.isVisible() && await decision.isEnabled()) await decision.click();
    else if (await page.locator('.yr-choice:enabled').count()) await page.locator('.yr-choice:enabled').first().click();
    if (await button('谢绝').isVisible()) await button('谢绝').click();
    if (await button('分时入场').isVisible() && await button('分时入场').isEnabled()) await button('分时入场').click();
    if (n === 23 && await button('投给江一').isVisible()) await button('投给江一').click();
    await button(n === 24 ? '完成六月交接' : '结算并推进').click();
  }
  await expect(page.getByRole('heading', { name: '六月交接完成' })).toBeVisible({ timeout: 12_000 });
  await button('翻阅年度年鉴').click();
  await expect(dialog('年鉴').getByRole('heading', { name: '换届投票' })).toBeVisible();
  await button('请 AI 选编事实', dialog('年鉴')).click();
  await expect(dialog('年鉴').getByText(/实时 AI 选编/)).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: join(output, '08-年度年鉴.png'), fullPage: true });
  await close();
  await button('账本').click();
  await expect(dialog('账本').getByText('合同已履行并结算', { exact: true })).toBeVisible();
  await expect(dialog('账本').getByText('侧门班次已兑现', { exact: true })).toBeVisible();
  await close();
  await button('交给下一届').click();
  await expect(page.getByText(/2027–2028 学年/)).toBeVisible();
  await expect(button('结清应付款').first()).toBeVisible();
  await page.screenshot({ path: join(output, '09-下一届.png'), fullPage: true });

  expect(errors).toEqual([]);
  expect(requests.some(r => r.kind === 'reply' && r.source === 'model' && r.traceId)).toBe(true);
  const advance = requests.filter(r => r.kind === 'advance');
  const summary = { completedWindows: 24, directorCalls: advance.length, liveWindows: advance.filter(r => r.source === 'live').map(r => r.window),
    fallbackWindows: advance.filter(r => r.source === 'fallback').map(r => r.window), pageErrors: errors, requests };
  await writeFile(join(output, 'live-cd.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, requests: requests.filter(r => r.kind !== 'advance') }, null, 2));
} finally {
  await browser.close();
}
