import { windowAt } from '../calendar';
import { currentDecision } from '../content/chapters';
import type { Action, Command, TurnResult, World } from '../model';
import { digest } from '../view/digest';
import { actorIntents, posterCost } from './actors';
import { applyChoice } from './choices';
import { outsideClubs } from './diplomacy';
import { claim, finishProjects } from './projects';
import { Transaction } from './transaction';
import { onWindowClosing, onWindowOpened } from './triggers';
import { amendDeal, counterDeal, finishDeals, recordQuotes, respondDeals, verifyDealDelivery } from './deals';
import { finishTraining, reviewTraining, startTraining } from './growth';
import { dealWithQueue, queuePressure } from './queue';
import { closeCampaign, nominees } from './succession';
import { completeFieldwork } from './fieldwork';

export const makeCommand = (w: World, id: string, action: Action): Command =>
  ({ id, yearId: w.yearId, expectedRevision: w.revision, basisDigest: digest(w), action });

export function quietWindow(world: World) {
  return !world.ended && world.window < 24 &&
    !currentDecision(world) && !world.choices[String(world.window)] &&
    world.campaign?.queue?.stage !== 'open' &&
    !Object.values(world.campaign?.deals ?? {}).some(item => item.state === 'quoted' || item.state === 'signed' &&
      item.terms.window <= world.window + 1) &&
    !Object.values(world.applications).some(item => item.status === 'pending' && item.window === world.window) &&
    !Object.values(world.projects).some(item => item.lead === 'player' && item.stage === 'scheduled' && item.dueWindow === world.window) &&
    !Object.values(world.commitments).some(item => item.status === 'active' && item.dueWindow === world.window &&
      (item.debtor === 'player' || item.beneficiary === 'player'));
}

function advance(tx: Transaction, action: Extract<Action, {kind: 'advance'}>) {
  const w = tx.world;
  if (currentDecision(w)) throw new Error('先处理本窗口的关键抉择');
  const pending = Object.values(w.applications).filter(item => item.status === 'pending' && item.window === w.window);
  if (pending.length) throw new Error('还有待处理的部长申请');
  if (action.fallback) tx.record('director', '本窗口由规则接管', '按人物目标和现有预约安排自主行动。');
  actorIntents(tx, action.selection);
  outsideClubs(tx);
  if (w.campaign) verifyDealDelivery(tx);
  finishProjects(tx);
  if (w.campaign) {
    finishDeals(tx);
    finishTraining(tx);
    queuePressure(tx);
  }
  onWindowClosing(tx);
  const aid = w.commitments.aid;
  if (aid?.status === 'active' && aid.dueWindow === w.window) {
    aid.status = 'fulfilled';
    const evidence = tx.record('commitment', '侧门班次已兑现', '旧书社派人完成了预约中的引导班次。', { causes: [aid.origin, w.facts.bookLoan], key: 'aidFulfilled' });
    tx.relate('player', 'book', { trust: 12, bond: 6 }, evidence);
  }
  for (const reservation of Object.values(w.reservations)) {
    if (reservation.to <= windowAt(w.window).to) reservation.status = 'released';
  }
  if (w.window === 24) {
    const steward = w.choices['22'] === 'nominate-ning' ? 'aning' : w.choices['22'] === 'nominate-jiang' ? 'jiangyi' : 'rotation';
    const activeCommitments = Object.values(w.commitments).filter(item => item.status !== 'fulfilled').map(item => item.id);
    const sources = [w.facts.steward, w.facts.handover, w.facts['project:player-may'] ?? w.facts['project:player-exhibit']].filter(Boolean);
    if (w.campaign) closeCampaign(tx);
    else w.ending = { steward, resolution: steward === 'rotation' ? '部长组按轮值表接班' : `${w.people[steward].name}接过钥匙`,
      retainedCents: w.clubs.player.cash, activeCommitments, sources };
    w.ended = true;
    tx.record('year_end', '六月档案已经封存', w.ending!.resolution, { causes: w.ending!.sources, key: 'archived' });
  } else {
    const previous = windowAt(w.window);
    w.window++;
    const next = windowAt(w.window);
    if (next.chapter.id !== previous.chapter.id) tx.record('chapter', `进入「${next.chapter.title}」`,
      `现金 ¥${w.clubs.player.cash / 100}，项目、人物关系与承诺一起带入。`);
    onWindowOpened(tx);
  }
}

export function execute(world: World, command: Command): TurnResult {
  if (command.yearId !== world.yearId || command.expectedRevision !== world.revision || command.basisDigest !== digest(world)) {
    return { ok: false, message: '局面已在另一个窗口更新，请读取最新进度' };
  }
  if (world.ended) return { ok: false, message: '这个学年已封存' };
  const tx = new Transaction(world, command);
  const w = tx.world;
  const action = command.action;
  try {
    if (!w.campaign && !['choose', 'advance', 'grant', 'application', 'enable-campaign'].includes(action.kind)) {
      throw new Error('这份旧规则档可以继续原学年。新功能需开启新档。');
    }
    switch (action.kind) {
      case 'choose': applyChoice(tx, action); break;
      case 'advance': advance(tx, action); break;
      case 'fieldwork': completeFieldwork(tx, action.projectId, action.approach); break;
      case 'enable-campaign': {
        if (w.campaign) throw new Error('这个档案已有年度玩法。');
        w.campaign = { origin: { scenario: 'struggling' }, enabledAt: w.revision + 1, deals: {}, trainings: {}, skills: {}, debts: [] };
        tx.record('chapter', '学年档案已升级', '保留当前时间、余额与承诺。可从本窗口开始带教和签署合同。', { source: 'player' });
        break;
      }
      case 'quote': recordQuotes(tx, action); break;
      case 'respond': respondDeals(tx, action); break;
      case 'counter': counterDeal(tx, action); break;
      case 'amend': amendDeal(tx, action); break;
      case 'train': startTraining(tx, action); break;
      case 'review': reviewTraining(tx, action.id); break;
      case 'queue': dealWithQueue(tx, action.method); break;
      case 'debt': {
        const debts = w.campaign!.debts;
        const debt = debts[action.index];
        if (!debt) throw new Error('这条应付款已处理。');
        const ref = tx.record('commitment', '结清交接应付款', debt.title, { source: 'player' });
        tx.pay('player', debt.cents, debt.title, ref, debt.club);
        debts.splice(action.index, 1);
        break;
      }
      case 'vote': {
        if (w.window < 22 || !w.choices['22'] || w.campaign!.playerVote) throw new Error('请在换届提名后投一票。');
        if (action.nominee !== 'rotation' && !nominees(w).some(person => person.id === action.nominee)) throw new Error('这位成员当前没有参选。');
        w.campaign!.playerVote = action.nominee;
        tx.record('ballot', `玩家投给${action.nominee === 'rotation' ? '轮值组' : w.people[action.nominee].name}`, '计入六月最终票数。',
          { key: 'playerVote', source: 'player', causes: [w.facts.steward] });
        break;
      }
      case 'grant': {
        if (action.actorId !== 'anan') throw new Error('此授权只适用于宣传部长');
        const prior = w.grants.anan;
        if (action.enabled) {
          if (prior && prior.expiresWindow >= w.window) throw new Error('当前授权仍在生效');
          w.grants.anan = { actorId: 'anan', work: 'posters', maxCents: 4000, spent: 0, expiresWindow: Math.min(24, w.window + 2) };
        } else {
          if (!prior || prior.expiresWindow < w.window) throw new Error('没有可以撤回的授权');
          prior.expiresWindow = w.window - 1;
        }
        tx.record('grant', action.enabled ? '授权阿南使用宣传经费' : '撤回广告物料授权',
          action.enabled ? '两次窗口结算后仍可用至第三窗口，累计上限 ¥40。' : '未执行的花费继续走审批。', { source: 'player' });
        break;
      }
      case 'application': {
        const application = w.applications[action.id];
        if (!application || application.status !== 'pending' || application.window !== w.window) throw new Error('这条申请已失效');
        application.status = action.accept ? 'approved' : 'declined';
        const cause = tx.record('approval', action.accept ? '批准宣传申请' : '拒绝宣传申请', `物料 ¥${posterCost / 100}`, { source: 'player', causes: [w.facts[action.id]] });
        if (action.accept) {
          tx.book([claim(`approved:${application.id}`, `person:${application.actorId}`, 'player', application.id, w.window, 80, 4)], cause);
          tx.pay('player', application.cents, '批准后的宣传物料', cause);
          w.people[application.actorId].activity = '执行批准的宣传方案';
          w.people[application.actorId].location = 'workshop';
          w.clubs.player.reputation += 2;
        }
        break;
      }
    }
    w.revision++;
    for (const app of Object.values(w.applications)) if (app.status === 'pending' && (app.window < w.window || w.ended)) app.status = 'expired';
    return { ok: true, world: w, receipt: { command, events: tx.events, digest: digest(w) } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '无法应用这项行动' };
  }
}
