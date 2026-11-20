import { windowAt } from '../calendar';
import { places } from '../content/clubs';
import { termsSchema } from '../commands';
import type { Action, ActorId, Deal, DealTerms, World } from '../model';
import { claim, scheduleProject } from './projects';
import { certified } from './growth';
import { reservationIssue } from './reservations';
import type { Transaction } from './transaction';

const partner: Record<DealTerms['club'], ActorId> = { photo: 'chenlan', music: 'hemu', tech: 'linqi', book: 'dushu' };
const equipment: Record<DealTerms['club'], string> = { photo: 'camera', music: 'speakers', tech: 'canopy', book: 'tables' };
export const dealLabels = { show: '联合演出', gear: '器材协作', workshop: '联合工坊', publicity: '联合宣传' };
const projectId = (id: string) => `project:${id}`;

function dealClaims(id: string, terms: DealTerms) {
  const { place, club, owner, window, units, kind } = terms;
  const project = projectId(id);
  return [
    claim(`${id}:venue`, `venue:${place}`, 'player', project, window, 104, units),
    claim(`${id}:lead`, `person:${owner}`, 'player', project, window, 104, units),
    claim(`${id}:partner`, `person:${partner[club]}`, club, project, window, 104, units),
    ...(kind === 'gear' || kind === 'show' ? [claim(`${id}:gear`, `gear:${equipment[club]}`, club, project, window, 104, units)] : []),
  ];
}

export function dealIssue(world: World, input: DealTerms, id = 'preview') {
  if (!termsSchema.safeParse(input).success) return '补全社团、地点、负责人、日期、班次、费用和份额。';
  if (input.window <= world.window) return '档期须晚于当前窗口，给双方留出准备时间。';
  if (world.people[input.owner].club !== 'player') return '负责人应由本社成员担任。';
  if (world.people[input.owner].status !== 'active') return '负责人当前未到社或已暂离。';
  if (world.clubs.player.cash - world.clubs.player.held < input.fee) return '当前可用现金无法预留全部合同费用。';
  const issue = reservationIssue(world, dealClaims(id, input));
  return issue ? `${places[input.place].label}、${world.people[input.owner].name}与对方班次有冲突。${issue}` : null;
}

type Style = NonNullable<Extract<Action, {kind: 'quote'}>['reply']>['styles'][number];

export function replyOptions(world: World, input: DealTerms) {
  const tie = world.relationships[`${input.club}>player`];
  const trust = tie?.trust ?? 20;
  const disputed = Boolean(tie?.conflicts.length);
  const basic = { music: 2800, photo: 2300, tech: 1600, book: 1000 }[input.club];
  const baseline = Math.max(0, basic + (input.units - 4) * 250 + (disputed ? 900 : 0) - Math.max(0, trust - 24) * 30);
  const sharedShare = input.kind === 'show' ? (input.club === 'music' ? 30 : 20) : 0;
  const expected = Math.min(60000, Math.max(input.fee, baseline));
  const variants: Partial<Record<Style, DealTerms>> = {
    credit: { ...input, credit: true, fee: Math.max(input.fee, Math.max(0, baseline - 600)), share: Math.max(input.share, sharedShare) },
  };
  if (input.fee >= baseline && input.share >= sharedShare && (input.credit || input.club !== 'music')) variants.keep = input;
  if (input.units > 2) variants.reduce = { ...input, units: Math.max(2, input.units - 2),
    fee: Math.max(Math.min(input.fee, expected), Math.max(0, baseline - 1000)), credit: true, share: Math.max(input.share, sharedShare) };
  return variants;
}

export function recordQuotes(tx: Transaction, action: Extract<Action, {kind: 'quote'}>) {
  const w = tx.world;
  const campaign = w.campaign!;
  if (Object.values(campaign.deals).filter(deal => deal.state === 'quoted' || deal.state === 'signed').length + action.terms.length > 12) {
    throw new Error('请先处理现有报价与签署项目。');
  }
  const clubs = new Set(action.terms.map(term => term.club));
  if (clubs.size >= 3 && !certified(w, 'mediation')) {
    throw new Error('同时邀请三个不同伙伴需要一位通过协调认证的成员；也可分批发出。');
  }
  action.terms.forEach((input, index) => {
    const id = `deal:${tx.command.id}:${index + 1}`;
    const variants = replyOptions(w, input);
    const proposed = action.reply?.styles[index];
    const candidate = proposed && variants[proposed];
    const selected = candidate || variants.keep || variants.credit!;
    const reason = dealIssue(w, selected, id);
    const state = reason ? 'refused' : 'quoted';
    const changed = Object.keys(selected).some(key => selected[key as keyof DealTerms] !== input[key as keyof DealTerms]);
    const title = `${w.clubs[input.club].label}${reason ? '暂时婉拒' : changed ? '发来反价' : '接受了草案'}`;
    const evidence = tx.record('negotiation', title, reason ?? `费用 ¥${selected.fee / 100}、对方分成 ${selected.share}%、${selected.credit ? '共同署名' : '独立署名'}。`,
      { source: candidate ? 'model' : 'rule', traceId: candidate ? action.reply?.traceId : undefined });
    campaign.deals[id] = { id, version: 1, terms: selected, state,
      outcome: changed ? 'counter' : 'accepted', offeredAt: w.window, expires: Math.min(w.window + 2, selected.window - 1), origin: evidence, held: 0 };
  });
}

function attach(tx: Transaction, deal: Deal, evidence: string) {
  const { terms, id } = deal;
  const issue = dealIssue(tx.world, terms, `${id}:v${deal.version}`);
  if (issue) throw new Error(issue);
  const project = projectId(id);
  const label = `${tx.world.clubs[terms.club].label} · ${dealLabels[terms.kind]}`;
  const p = tx.world.projects[project];
  if (p) {
    p.stage = 'scheduled'; p.dueWindow = terms.window; p.owner = terms.owner;
    p.evidence.push(evidence);
  } else {
    scheduleProject(tx, { id: project, name: label, lead: 'player', partners: [terms.club], place: terms.place,
      owner: terms.owner, window: terms.window, offset: 104, signups: terms.kind === 'show' ? 53 : 24,
      externalClaims: true }, evidence);
  }
  tx.book(dealClaims(`${id}:v${deal.version}`, terms).map(r => ({ ...r, projectId: project })), evidence);
}

export function respondDeals(tx: Transaction, action: Extract<Action, {kind: 'respond'}>) {
  const w = tx.world;
  const known = new Set<string>();
  for (const { id, version } of action.deals) {
    const deal = w.campaign!.deals[id];
    if (known.has(id) || !deal || deal.version !== version || deal.state !== 'quoted' || deal.expires < w.window) {
      throw new Error('这组报价已处理、重复、过期或版本过时。可重新询价。');
    }
    known.add(id);
    const evidence = tx.record('agreement', action.accept ? '双方已签署' : '玩家拒绝了报价',
      `${w.clubs[deal.terms.club].label} · ${dealLabels[deal.terms.kind]} · 第 ${deal.terms.window} 窗口`,
      { source: 'player', causes: [deal.origin] });
    deal.version++;
    deal.updated = evidence;
    if (!action.accept) { deal.state = 'refused'; continue; }
    attach(tx, deal, evidence);
    deal.state = 'signed';
    deal.held = deal.terms.fee;
    w.clubs.player.held += deal.held;
  }
}

export function counterDeal(tx: Transaction, action: Extract<Action, {kind: 'counter'}>) {
  const w = tx.world;
  const deal = w.campaign!.deals[action.id];
  if (!deal || deal.state !== 'quoted' || deal.version !== action.version || deal.expires < w.window) throw new Error('请重新打开当前报价。');
  if (deal.terms.club !== action.terms.club || deal.terms.kind !== action.terms.kind) throw new Error('换伙伴或活动类型时请另起草案。');
  const input = action.terms;
  const variants = replyOptions(w, input);
  const selected = variants.keep ?? variants.reduce ?? variants.credit!;
  const issue = dealIssue(w, selected, 'counter-preview');
  if (issue) throw new Error(issue);
  const accepted = Boolean(variants.keep);
  deal.updated = tx.record('negotiation', '玩家提出新条款', `预算 ¥${input.fee / 100}，安排 ${input.units / 2} 小时。`,
    { source: 'player', causes: [deal.updated, deal.origin] });
  deal.origin = tx.record('negotiation', accepted ? '对方同意新条款' : '对方回报新版本',
    `费用 ¥${selected.fee / 100}，对方分成 ${selected.share}%，${selected.credit ? '共同署名' : '独立署名'}。`, { causes: [deal.updated] });
  deal.version++;
  deal.terms = selected;
  deal.outcome = accepted ? 'accepted' : 'counter';
  deal.expires = Math.min(w.window + 2, selected.window - 1);
}

function release(tx: Transaction, deal: Deal) {
  for (const reservation of Object.values(tx.world.reservations)) {
    if (reservation.projectId === projectId(deal.id)) reservation.status = 'released';
  }
  tx.world.clubs.player.held -= deal.held;
  deal.held = 0;
}

function defaultDeal(tx: Transaction, deal: Deal, cause: string) {
  const w = tx.world;
  release(tx, deal);
  const penalty = Math.floor(deal.terms.fee / (certified(w, 'finance') ? 5 : 4));
  const cash = Math.min(deal.prepared ? Math.ceil(penalty / 2) : penalty, w.clubs.player.cash - w.clubs.player.held);
  if (cash) tx.pay('player', cash, '合同取消赔付', cause, deal.terms.club);
  if (cash < penalty) w.campaign!.debts.push({ club: deal.terms.club, cents: penalty - cash, title: dealLabels[deal.terms.kind] });
  w.projects[projectId(deal.id)].stage = 'postponed';
  deal.state = 'defaulted';
  const fact = tx.record('commitment', '合同关闭并释放档期', `赔付 ¥${cash / 100}，未付 ¥${(penalty - cash) / 100}。`, { causes: [cause, deal.origin] });
  deal.completed = fact;
  tx.relate(deal.terms.club, 'player', { trust: -18 }, fact, fact);
}

export function verifyDealDelivery(tx: Transaction) {
  const w = tx.world;
  for (const deal of Object.values(w.campaign!.deals)) {
    if (deal.state !== 'signed' || deal.terms.window !== w.window) continue;
    if ([deal.terms.owner, partner[deal.terms.club]].some(id => w.people[id].status !== 'active')) {
      defaultDeal(tx, deal, deal.updated ?? deal.origin);
    }
  }
}

export function amendDeal(tx: Transaction, action: Extract<Action, {kind: 'amend'}>) {
  const w = tx.world;
  const deal = w.campaign!.deals[action.id];
  if (!deal || deal.state !== 'signed' || deal.version !== action.version) throw new Error('合同已变更，请重新查看。');
  const evidence = tx.record('negotiation', '合同变更', `${w.clubs[deal.terms.club].label}收到本次变更。`,
    { source: 'player', causes: [deal.updated, deal.origin] });
  deal.version++;
  deal.updated = evidence;
  if (action.operation === 'cancel') { defaultDeal(tx, deal, evidence); return; }
  if (action.operation === 'reassign' && (!action.owner || action.owner === deal.terms.owner)) throw new Error('请选择另一位在社负责人。');
  if (deal.terms.window <= w.window && action.operation !== 'reschedule') throw new Error('已到履约日，请改期或取消。');
  release(tx, deal);
  if (action.operation === 'reassign') deal.terms.owner = action.owner!;
  if (action.operation === 'reschedule') {
    deal.terms.window = Math.max(w.window + 1, deal.terms.window + 1);
    deal.prepared = undefined;
  }
  if (action.operation === 'resize') {
    if (deal.terms.units <= 2) throw new Error('这份合同已经是最小班次。');
    deal.terms.units = Math.max(2, deal.terms.units - 2);
    deal.terms.fee = Math.ceil(deal.terms.fee * .75);
    w.projects[projectId(deal.id)].capacity = Math.max(12, w.projects[projectId(deal.id)].capacity - 8);
  }
  attach(tx, deal, evidence);
  deal.held = deal.terms.fee;
  w.clubs.player.held += deal.held;
}

export function finishDeals(tx: Transaction) {
  const w = tx.world;
  for (const deal of Object.values(w.campaign!.deals)) {
    if (deal.state === 'quoted' && deal.expires <= w.window) {
      deal.state = 'expired';
      tx.record('negotiation', '报价到期', dealLabels[deal.terms.kind], { causes: [deal.origin] });
    }
    if (deal.state !== 'signed') continue;
    if (!deal.prepared && deal.terms.window === w.window + 1) deal.prepared = tx.record('project', '合同准备单已核对',
      `${w.clubs[deal.terms.club].label} · 现场日期已确认，物资与负责人班次已锁定。`, { causes: [deal.updated, deal.origin] });
    if (deal.terms.window !== w.window) continue;
    const project = w.projects[projectId(deal.id)];
    if (project.stage !== 'complete' || w.people[partner[deal.terms.club]].status !== 'active') {
      defaultDeal(tx, deal, project.evidence.at(-1)!);
      continue;
    }
    release(tx, deal);
    tx.pay('player', deal.terms.fee, '已履约合同', deal.updated, deal.terms.club);
    const receipts = deal.terms.kind === 'show' ? project.attendance * 300 : 0;
    const share = Math.floor(receipts * deal.terms.share / 100);
    w.clubs.player.cash += receipts - share;
    w.clubs[deal.terms.club].cash += share;
    deal.state = 'fulfilled';
    deal.completed = tx.record('commitment', '合同已履行并结算',
      `${project.name} · 实到 ${project.attendance} · 票款 ¥${receipts / 100} · 对方分成 ¥${share / 100}`,
      { causes: [deal.updated, deal.prepared, project.evidence.at(-1)] });
    tx.relate(deal.terms.club, 'player', { trust: 12, alignment: 6, bond: 10 }, deal.completed);
    const tie = w.relationships[`${deal.terms.club}>player`];
    const dispute = Object.values(w.campaign!.deals).find(item => item.terms.club === deal.terms.club &&
      item.state === 'defaulted' && item.completed && tie.conflicts.includes(item.completed));
    if (dispute && deal.terms.kind !== 'show' && !w.campaign!.debts.some(item => item.club === deal.terms.club)) {
      tie.conflicts = tie.conflicts.filter(id => id !== dispute.completed);
      tx.record('agreement', '补偿和小合同兑现，争端关闭', w.clubs[deal.terms.club].label, { causes: [dispute.completed, deal.completed] });
    }
  }
}
