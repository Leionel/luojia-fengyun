import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const base = process.env.CAMPUS_YEAR_SMOKE_URL ?? 'http://127.0.0.1:3062';
const output = process.env.CAMPUS_YEAR_SMOKE_OUTPUT ?? 'output/year-ab';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CAMPUS_TEST_BROWSER_CHANNEL ?? 'msedge' });

async function start(mode, strategy) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${base}/campus-chaos/year?seed=fair-01&mode=${mode}`);
  await page.getByRole('button', { name: '开始学年' }).click();
  await page.getByRole('button', { name: strategy }).click();
  return page;
}

async function savedWorld(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('campus-chaos-academic-year');
    request.onerror = reject;
    request.onsuccess = () => {
      const database = request.result;
      const read = database.transaction('years').objectStore('years').getAll();
      read.onsuccess = () => {
        resolve(read.result[0].world);
        database.close();
      };
      read.onerror = reject;
    };
  }));
}

try {
  const result = [];
  for (const [id, strategy] of [['joint', /和摄影社联摆/], ['independent', /出 ¥80 争主路展位/]]) {
    const [modelPage, rulePage] = await Promise.all([start('live', strategy), start('demo', strategy)]);
    const before = await savedWorld(modelPage);
    const reply = modelPage.waitForResponse(r => new URL(r.url()).pathname === '/api/campus/year/decide');
    await Promise.all([modelPage, rulePage].map(page => page.getByRole('button', { name: '结算并推进' }).click()));
    const response = await reply;
    const request = response.request().postDataJSON();
    const body = await response.json();
    expect(response.status()).toBe(200);
    expect(body.status).toBe('live');
    expect(body.basisDigest).toBe(request.basisDigest);
    await expect(modelPage.getByText('上次结算 · 实时 AI')).toBeVisible();
    await expect(rulePage.getByText('第 2 / 24 窗口', { exact: true })).toBeVisible();
    const [live, rules] = await Promise.all([savedWorld(modelPage), savedWorld(rulePage)]);
    const movements = [];
    for (const chosen of body.selection.intentIds) {
      const option = request.options.find(option => option.id === chosen);
      const rule = request.options.find(candidate => candidate.actorId === option.actorId);
      const reservation = live.reservations[chosen];
      const ruleReservation = rules.reservations[rule.id];
      const from = before.people[option.actorId];
      const actual = live.people[option.actorId];
      const defaultAction = rules.people[option.actorId];
      movements.push({ actor: option.name, chosen, after: actual.activity, location: actual.location,
        prior: from.activity, ruleId: rule.id, ruleAction: defaultAction.activity, ruleLocation: defaultAction.location,
        reservation: reservation ?? null, ruleReservation: ruleReservation ?? null });
    }
    if (id === 'joint') {
      await modelPage.getByRole('button', { name: '全屏', exact: true }).click();
      await modelPage.screenshot({ path: join(output, 'year-fullscreen.png'), fullPage: true });
    }
    await modelPage.getByRole('button', { name: '账本' }).click();
    await expect(modelPage.getByRole('dialog').getByText(`模型记录 ${body.selection.traceId.slice(0, 8)}`).first()).toBeVisible();
    await modelPage.screenshot({ path: join(output, `live-${id}.png`), fullPage: true });
    const fair = world => ({ signups: world.projects['fair-show'].signups, attendance: world.projects['fair-show'].attendance,
      photographerShift: world.reservations['w1:anan:joint-desk:chenlan'] ?? null,
      approval: world.applications['apply:1:anan']?.status ?? null });
    result.push({ route: id, window: request.window, revision: request.revision, basisDigest: request.basisDigest,
      traceId: body.selection.traceId, modelRejected: body.invalid, liveFair: fair(live), ruleFair: fair(rules), movements });
    await Promise.all([modelPage.context().close(), rulePage.context().close()]);
  }
  await writeFile(join(output, 'live-evidence.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  expect(result.flatMap(row => row.movements).some(move => move.chosen !== move.ruleId &&
    (move.reservation || move.ruleReservation) && (move.after !== move.ruleAction || move.location !== move.ruleLocation))).toBe(true);
} finally {
  await browser.close();
}
