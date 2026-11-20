import { currentDecision } from '../content/chapters';
import { places } from '../content/clubs';
import type { Action } from '../model';
import { fair } from './diplomacy';
import { claim, scheduleProject } from './projects';
import { lendTable } from './triggers';
import type { Transaction } from './transaction';

export function applyChoice(tx: Transaction, action: Extract<Action, {kind: 'choose'}>) {
  const w = tx.world;
  const decision = currentDecision(w);
  const option = decision?.options.find(item => item.id === action.optionId);
  if (!decision || action.decisionId !== decision.id || !option) throw new Error('这一项抉择已经处理或尚未出现');
  const key = `choice:${decision.id}`;
  const evidence = tx.record('choice', option.label, option.preview, { source: 'player', key,
    causes: [w.window === 14 ? w.facts.springAppeal : w.window === 16 ? w.facts.aidOffer : undefined] });
  w.choices[String(w.window)] = option.id;
  const placeActor = (actor: keyof typeof w.people, place: keyof typeof places, label: string) => {
    w.people[actor].location = place;
    w.people[actor].activity = label;
  };
  const novel = w.projects['player-nov'];
  const flagship = w.projects['player-may'] ?? w.projects['player-exhibit'];
  const assign = (actor: keyof typeof w.people, place: keyof typeof places, name: string, offset = 76) => {
    tx.book([claim(`${key}:${actor}`, `person:${actor}`, w.people[actor].club, key, w.window, offset, 4)], evidence);
    placeActor(actor, place, name);
  };
  switch (option.id) {
    case 'join-photo': fair(tx, true, evidence); break;
    case 'solo-fair': fair(tx, false, evidence); break;
    case 'register': assign('anan', 'plaza', '新生回访'); w.clubs.player.reputation += 2; break;
    case 'campaign': tx.pay('player', 3000, '新生第二轮宣传', evidence); w.clubs.player.reputation += 5; break;
    case 'lend': lendTable(tx, evidence); break;
    case 'stage-show':
    case 'room-show':
    case 'workshop-show': {
      const stage = option.id === 'stage-show';
      const room = option.id === 'room-show';
      scheduleProject(tx, { id: 'player-nov', name: stage ? '十一月舞台专场' : room ? '十一月分享会' : '十一月工坊小场', lead: 'player',
        place: stage ? 'stage' : room ? 'room' : 'workshop', owner: stage ? 'jiangyi' : room ? 'xiaoyu' : 'aning', window: 8, offset: 116,
        gear: stage ? 'speakers' : undefined, signups: stage ? 50 : 33, cost: room ? 0 : 4800, setup: stage,
        partners: w.facts.photoJoined ? ['photo'] : [] }, evidence);
      break;
    }
    case 'queue-plan':
      if (!novel) throw new Error('先确认活动档期');
      tx.pay('player', 2000, '入口动线', evidence);
      novel.capacity = Math.min(places[novel.place].guests, novel.capacity + 10);
      novel.evidence.push(evidence); break;
    case 'open-invites':
    case 'cap-invites':
      if (!novel) throw new Error('先确认活动档期');
      novel.signups = option.id === 'open-invites' ? novel.signups + 14 : Math.min(novel.signups, novel.capacity);
      novel.evidence.push(evidence); break;
    case 'study':
      w.people.aning.status = 'leave';
      placeActor('aning', 'library', '暂停活动，准备期末');
      w.facts.exams = evidence;
      tx.relate('aning', 'player', { trust: 12, bond: 6 }, evidence); break;
    case 'limited': assign('aning', 'workshop', '负责一班冬季值班');
      w.facts.exams = evidence;
      tx.relate('aning', 'player', { trust: 2 }, evidence); break;
    case 'substitute': assign('jiangyi', 'room', '接手冬季值班'); w.people.jiangyi.experience += 1; break;
    case 'shorten': placeActor('xiaoyu', 'room', '收尾并登记缩场'); w.people.aning.energy = Math.min(10, w.people.aning.energy + 2); break;
    case 'review': w.people.xiaoyu.experience += 1; placeActor('xiaoyu', 'room', '同对方核对借用清单'); break;
    case 'handoff-notice': placeActor('jiangyi', 'room', '整理来年备注'); break;
    case 'repair': {
      tx.pay('player', 4000, w.facts.springAppeal ? '共同补片' : '春季小型互惠活动', evidence, 'photo');
      assign('jiangyi', 'workshop', '和摄影社完成补片');
      assign('chenlan', 'workshop', '和珞珈社团补片');
      tx.record('agreement', '春季协作已排班', '江一和陈岚各认领两小时，结算时核对交付。',
        { key: 'photoRepairPlanned', causes: [evidence, w.facts.photoDeclined, w.facts.springAppeal] });
      break;
    }
    case 'friend-tech': assign('jiangyi', 'workshop', '去工坊谈备选方案'); tx.relate('tech', 'player', { alignment: 12 }, evidence); break;
    case 'showroom':
      assign('aning', 'workshop', '带邱桐试做展陈');
      assign('qiutong', 'workshop', '跟阿柠熟悉工坊');
      w.people.qiutong.experience += 2; w.people.aning.experience += 1; break;
    case 'prototype':
      assign('linqi', 'workshop', '与吴远演示报名工具');
      assign('wuyuan', 'workshop', '试产工具');
      w.people.wuyuan.experience += 2; break;
    case 'side-gate': {
      if (w.facts.aidOffer) {
        tx.book([claim('old-book-aid', 'person:dushu', 'book', 'spring-aid', 16, 72, 4)], w.facts.aidOffer);
        placeActor('dushu', 'plaza', '在侧门引导人流');
        const aid = tx.record('commitment', '旧书社的支援排上日程', '杜舒已认领侧门班次，班次结束后核对交付。', { key: 'aidUsed', causes: [w.facts.aidOffer, evidence], actorId: 'dushu' });
        w.commitments.aid = { id: 'aid', projectId: 'spring-aid', kind: 'aid', debtor: 'book', beneficiary: 'player', dueWindow: 16, status: 'active', origin: aid };
      } else tx.pay('player', 4500, '侧门雨棚', evidence);
      placeActor('jiangyi', 'plaza', '沿侧门入场'); break;
    }
    case 'corridor': placeActor('jiangyi', 'library', '将入口转到外廊'); break;
    case 'lead-show':
      scheduleProject(tx, { id: 'player-may', name: '五月联合主舞台', lead: 'player', place: 'stage', owner: 'jiangyi',
        window: 21, signups: 72, gear: 'speakers', cost: 6000, setup: true }, evidence); break;
    case 'small-exhibit':
      scheduleProject(tx, { id: 'player-exhibit', name: '五月工坊作品展', lead: 'player', place: 'workshop', owner: 'aning',
        window: 21, signups: 35, cost: 3500 }, evidence); break;
    case 'room-exhibit':
      scheduleProject(tx, { id: 'player-exhibit', name: '社团开放日', lead: 'player', place: 'room', owner: 'qiutong',
        window: 21, signups: 24 }, evidence); break;
    case 'co-credit': {
      if (!flagship) throw new Error('先预约五月活动');
      const allowed = (['photo', 'book', 'tech'] as const).filter(club => (w.relationships[`${club}>player`]?.trust ?? 0) >= 30 ||
        (w.relationships[`${club}>player`]?.alignment ?? 0) >= 10);
      if (!allowed.length) throw new Error('还没有愿意认领五月班次的伙伴');
      const team = { photo: 'chenlan', book: 'dushu', tech: 'linqi' } as const;
      tx.book(allowed.map(club => claim(`may:${club}`, `person:${team[club]}`, club, flagship.id, 21, 68, 4)), evidence);
      flagship.partners.push(...allowed);
      flagship.capacity = Math.min(places[flagship.place].guests, flagship.capacity + 6 * allowed.length);
      for (const club of allowed) {
        w.commitments[`may:${club}`] = { id: `may:${club}`, projectId: flagship.id, kind: 'joint', debtor: club, beneficiary: 'player', dueWindow: 21, status: 'active', origin: evidence };
      }
      tx.record('agreement', '五月伙伴确认署名', allowed.map(id => w.clubs[id].label).join(' · '), { causes: [evidence, w.facts.mayPhotoTerms, w.facts.aidUsed] }); break;
    }
    case 'self-run': placeActor('qiutong', 'workshop', '筹备自己的作品'); w.people.qiutong.experience += 1; break;
    case 'room-for-more':
      if (!flagship) throw new Error('先预约五月活动');
      tx.pay('player', 2000, '增设入口', evidence);
      flagship.capacity = Math.min(places[flagship.place].guests, flagship.capacity + 10); break;
    case 'nominate-ning':
    case 'nominate-jiang':
    case 'nominate-qiu':
    case 'nominate-wu': {
      const actor = { 'nominate-ning': 'aning', 'nominate-jiang': 'jiangyi', 'nominate-qiu': 'qiutong', 'nominate-wu': 'wuyuan' } as const;
      const candidate = w.people[actor[option.id]];
      if (candidate.status !== 'active' || candidate.experience < 2) throw new Error('对方还没有同意接班，试试另一位或安排轮值');
      placeActor(candidate.id, 'room', '同意接过活动室钥匙');
      tx.record('succession', `${candidate.name}同意接班`, '本人在社，有活动经验，愿意接手交接清单。', { key: 'steward', causes: [evidence], actorId: candidate.id });
      break;
    }
    case 'rotate': placeActor('xiaoyu', 'room', '参与轮值'); break;
    case 'publish-handover':
    case 'private-handover':
      tx.record('handover', '交接清单已整理', `现金 ¥${w.clubs.player.cash / 100}，未关闭承诺 ${Object.values(w.commitments).filter(item => item.status !== 'fulfilled').length} 项。`,
        { key: 'handover', causes: [evidence, w.facts.steward] }); break;
  }
}
