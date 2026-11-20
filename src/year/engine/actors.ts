import type { ActorId, Intent, PlaceId, Selection, Work, World } from '../model';
import { availability, reservationIssue } from './reservations';
import { claim } from './projects';
import type { Transaction } from './transaction';

export const posterCost = 1800;
const paidWork = 'posters';
const effort: Record<Work, number> = { outreach: 4, posters: 4, practice: 4, study: 0, scout: 2, catalog: 2, 'joint-desk': 4, rest: 0 };

function workClaims(world: World, intent: Intent) {
  const person = world.people[intent.actorId];
  const ownShift = claim(intent.id, `person:${person.id}`, person.club, intent.id, world.window, 64, effort[intent.work]);
  if (intent.work !== 'joint-desk') return [ownShift];
  return [ownShift, claim(`${intent.id}:chenlan`, 'person:chenlan', 'photo', intent.id, world.window, 64, 4)];
}

export function candidates(world: World): Intent[] {
  const allied = Boolean(world.facts.photoJoined || world.facts.photoRepaired);
  const cause = allied ? world.facts.photoRepaired ?? world.facts.photoJoined : world.facts.photoDeclined;
  const result: Intent[] = [];
  const add = (actorId: ActorId, work: Work, location: PlaceId, label: string, basis: string, root?: string) => {
    const person = world.people[actorId];
    if (person.status === 'incoming' || person.status === 'leave' && work !== 'study' && work !== 'rest') return;
    const intent = { id: `w${world.window}:${actorId}:${work}`, actorId, work, location, label, basis, causeIds: root ? [root] : [] };
    if (effort[work] && (person.energy < 2 || !availability(world, actorId) || reservationIssue(world, workClaims(world, intent)))) return;
    result.push(intent);
  };

  const fairChoiceMade = world.window !== 1 || Boolean(world.choices['1']);
  if (fairChoiceMade) {
    if (allied) add('anan', 'outreach', 'plaza', '跟摄影社一起联络新生', '联摆已成立，阿南希望保住共同署名', cause);
    else if ([1, 3, 7, 15, 19].includes(world.window)) add('anan', 'posters', 'workshop', '申请一批独立宣传物料', '独立路线需要自己的曝光', cause);
    else add('anan', 'outreach', 'workshop', '联络工坊展览的观众', '当前倾向用独立作品争取曝光', cause);
    const fair = world.projects['fair-show'];
    if (world.window === 1 && allied && fair?.stage === 'scheduled' && world.people.chenlan.energy >= 2) {
      add('anan', 'joint-desk', 'plaza', '和陈岚增开联合登记台',
        `陈岚已有空班并同意联摆。开摊前可锁两人各两小时，现场登记增加 6 人（现有 ${fair.signups} 人）。`, cause);
    }
    add('anan', 'scout', 'room', '在活动室整理触达名单', '整理已有报名能减少无效宣传', cause);
    add('anan', 'rest', 'room', '留在活动室休整', '给下一次宣传留下精力', cause);
    if (allied) add('jiangyi', 'practice', 'plaza', '和联摆伙伴核对现场班次', '需要兑现联摆的承诺', cause);
    else add('jiangyi', 'outreach', 'stage', '联络音乐社的候补场地', '摄影社保留了自己的档期', cause);
    add('jiangyi', 'scout', 'library', '去外廊核对空闲场地', '后备场地仍可用', cause);
    add('jiangyi', 'rest', 'room', '回活动室整理排班', '休整后才能继续负责现场', cause);
  }
  if (world.window >= 9 && world.window <= 12) {
    add('aning', 'study', 'library', '去图书馆备考', '期末只剩两小时，先照顾个人课业', world.facts.exams);
    add('aning', 'practice', 'workshop', '只认领一个演练班次', '希望在工时允许时继续执行', world.facts.exams);
  } else {
    add('aning', 'practice', 'workshop', '练习入口调度', '希望办好自己的第一场活动');
    add('aning', 'rest', 'room', '整理物料并休整', '保留精力给下一场');
  }
  add('xiaoyu', 'catalog', 'room', '核对本周账目', '保证活动可交接');
  add('xiaoyu', 'rest', 'library', '本周不加新班次', '需控制成员精力消耗');
  if ([6, 7, 14, 18].includes(world.window)) {
    add('chenlan', 'outreach', allied ? 'plaza' : 'stage',
      allied ? '为两社展览联系摄影同伴' : '与音乐社核对拍摄清单',
      allied ? '已共同承办或完成春季补片' : '独立社团需要争取展出机会', cause);
    add('chenlan', 'catalog', 'workshop', '整理自己的作品集', '保留摄影社的独立展示机会', cause);
  }
  return result;
}

export function actorIntents(tx: Transaction, selection?: Selection) {
  const w = tx.world;
  const available = candidates(w);
  const seen = new Set<ActorId>();
  const choices = new Map<ActorId, Intent>();
  const staleIds = selection?.intentIds.filter(id => !available.some(intent => intent.id === id)) ?? [];
  if (staleIds.length) tx.record('director', '部分意图已失效', `${staleIds.length} 项与当前窗口不符，按规则重新安排。`);
  for (const id of selection?.intentIds ?? []) {
    const match = available.find(intent => intent.id === id);
    if (match && !choices.has(match.actorId)) choices.set(match.actorId, match);
  }
  for (const candidate of available) {
    const { actorId } = candidate;
    if (seen.has(actorId)) continue;
    seen.add(actorId);
    const picked = choices.get(actorId);
    const intent = picked ?? candidate;
    const person = w.people[actorId];
    const grant = w.grants[actorId];
    const spend = intent.work === paidWork;
    const canPay = !spend || (grant && grant.expiresWindow >= w.window && grant.maxCents - grant.spent >= posterCost &&
      w.clubs.player.cash - w.clubs.player.held >= posterCost);
    const trace = picked ? selection?.traceId : undefined;
    const source = trace ? 'model' : 'rule';
    if (spend && !canPay) {
      const id = `apply:${w.window}:${actorId}`;
      w.applications[id] = { id, actorId, cents: posterCost, work: paidWork, status: 'pending', window: w.window + 1 };
      person.location = intent.location;
      person.activity = '在等本社审批';
      tx.record('application', `${person.name}申请宣传经费`, `预计 ¥${posterCost / 100}，审批前不扣款。`, { source, traceId: trace, actorId, causes: intent.causeIds, key: id });
      continue;
    }
    if (effort[intent.work]) {
      const reservations = workClaims(w, intent);
      if (reservationIssue(w, reservations)) {
        person.activity = '排班冲突，先休整';
        tx.record('intent_rejected', '意图改为休整', `${person.name}的可预约时段发生冲突。`, { actorId, causes: intent.causeIds });
        continue;
      }
      const fact = tx.record('intent', `${person.name}：${intent.label}`, intent.basis, { source, traceId: trace, actorId, causes: intent.causeIds, key: intent.id });
      tx.book(reservations, fact);
      if (spend && grant) {
        tx.pay('player', posterCost, '执行已授权的物料方案', fact);
        grant.spent += posterCost;
      }
      person.energy = Math.max(0, person.energy - 1);
      if (intent.work === 'joint-desk') {
        const partner = w.people.chenlan;
        partner.energy--;
        partner.location = 'plaza';
        partner.activity = '协助联合登记台';
        const fair = w.projects['fair-show'];
        fair.signups += 6;
        fair.evidence.push(tx.record('project', '联合登记台接到六份报名', '阿南和陈岚完成共同班次，六份报名进入招新名单。', { source, traceId: trace, causes: [fact] }));
      }
      if (intent.work === 'practice') person.experience += 1;
      if (intent.work === 'outreach' || spend) w.clubs[person.club].reputation += 1;
    } else {
      person.energy = Math.min(10, person.energy + 2);
      tx.record('intent', `${person.name}：${intent.label}`, intent.basis, { source, traceId: trace, actorId, causes: intent.causeIds, key: intent.id });
    }
    person.location = intent.location;
    person.activity = intent.label;
  }
}
