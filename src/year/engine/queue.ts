import type { Action } from '../model';
import { certified } from './growth';
import { claim } from './projects';
import type { Transaction } from './transaction';

export function queuePressure(tx: Transaction) {
  const w = tx.world;
  const campaign = w.campaign!;
  const current = campaign.queue;
  if (current?.stage === 'open' && current.due <= w.window) {
    current.stage = 'unresolved';
    const person = w.people.aning;
    person.energy = Math.max(0, person.energy - 2);
    w.clubs.player.reputation -= 4;
    const evidence = tx.record('conflict', '候补超时，成员要求减少活动', `${current.amount} 人未收到分流安排。阿柠精力下降，压力会进期末会议。`,
      { actorId: 'aning', causes: [current.origin], key: 'queuePressure' });
    tx.relate('aning', 'player', { trust: -10, alignment: -6 }, evidence, evidence);
  }
  const project = Object.values(w.projects).find(p => p.lead === 'player' && p.dueWindow === w.window &&
    p.stage === 'complete' && p.signups - p.attendance >= 5);
  if (!project || campaign.queue?.stage === 'open' || w.window >= 22) return;
  const amount = project.signups - project.attendance;
  const origin = tx.record('opportunity', '候补队列需要安排', `${project.name}还有 ${amount} 人候补。三窗内可增开入口、分时入场或缩场退款。`,
    { causes: [project.evidence.at(-1)], key: `queue:${w.window}` });
  campaign.queue = { amount, origin, due: w.window + 3, stage: 'open', resolved: 0, refunded: 0 };
}

export function dealWithQueue(tx: Transaction, method: Extract<Action, {kind: 'queue'}>['method']) {
  const w = tx.world;
  const queue = w.campaign!.queue;
  if (!queue || queue.stage !== 'open' || queue.due < w.window) throw new Error('这份候补名单已经结算。');
  const qualified = Object.keys(w.campaign!.skills).find(id => {
    const actor = w.people[id as keyof typeof w.people];
    return actor.status === 'active' && certified(w, 'operations', actor.id);
  }) as keyof typeof w.people | undefined;
  const actor = method === 'expand' ? (qualified ?? 'jiangyi') : 'xiaoyu';
  const max = method === 'expand' ? (qualified ? 24 : 20) : method === 'stagger' ? 13 : 6;
  const admitted = Math.min(queue.amount, max);
  const refunded = queue.amount - admitted;
  const facts = [queue.origin, qualified ? w.facts[`skill:${qualified}:operations`] : undefined, w.facts.aidUsed];
  const resolved = tx.record('commitment', method === 'expand' ? '增开入口' : method === 'stagger' ? '启用分时入场' : '转为小场并退款',
    `新增 ${admitted} 个时段名额，${refunded} 人取消并退款。`, { source: 'player', causes: facts, key: 'queueHandled' });
  const destination = method === 'expand' ? 'plaza' : method === 'stagger' ? 'library' : 'room';
  tx.book([claim(`queue:${w.window}:staff`, `person:${actor}`, 'player', resolved, w.window, 100, 4),
    claim(`queue:${w.window}:venue`, `venue:${destination}`, 'player', resolved, w.window, 100, 4)], resolved);
  const base = method === 'expand' ? (qualified ? 1400 : 2400) : method === 'stagger' ? 800 : 0;
  const refund = refunded * (certified(w, 'finance') ? 150 : 200);
  tx.pay('player', base + refund, '候补分流与退款', resolved);
  queue.stage = 'diverted';
  queue.resolved = admitted;
  queue.refunded = refunded;
  w.people[actor].location = destination;
  w.people[actor].activity = '执行候补分流';
  w.clubs.player.reputation += method === 'small' ? 1 : 4;
}
