import type { DirectorSnapshot, Effect, EventId, Flag, NpcId, Proposal } from './model';
import { eligibleOffers } from './offers';

type EventChoice = { label: string; effect: Effect; flag?: Flag };
type Event = {
  npc: NpcId;
  title: string;
  line: string;
  reason: string;
  weight: (s: DirectorSnapshot) => number;
  choices?: readonly [EventChoice, EventChoice];
};

export const events: Record<EventId, Event> = {
  POSTER_BACKLASH: {
    npc: 'promotion', title: '海报贴得有点多',
    line: '评论区在说我们的海报刷屏了。还推同一张，还是请其他社团帮忙转发？',
    reason: '已经多次进行宣传。',
    weight: s => s.lastAction === 'PRINT_POSTERS' && (s.counts.PRINT_POSTERS ?? 0) >= 2 ? 9 : 0,
    choices: [
      { label: '继续刷曝光', effect: { signups: 5, reputation: -8 }, flag: 'posterFatigue' },
      { label: '换到社团公告栏', effect: { signups: 2, reputation: 3 } },
    ],
  },
  FREE_VENUE_OFFER: {
    npc: 'external', title: '隔壁社团借来一块地',
    line: '旧书社愿意借雨棚和桌子，条件是海报上把他们也写成主办方。',
    reason: '你发起了社团联动。',
    weight: s => s.lastAction === 'CLUB_ALLIANCE' && !s.flags.includes('venue') ? 8 : 0,
    choices: [
      { label: '一起署名', effect: { signups: 4, cohesion: -3 }, flag: 'venue' },
      { label: '独立主办', effect: { reputation: 4, cohesion: 3 } },
    ],
  },
  TEAM_DISPUTE: {
    npc: 'finance', title: '两张排班表对不上',
    line: '宣传想提前开放报名，外联还在等场地回复。要停下来核对安排吗？',
    reason: '成员积极性或团队凝聚力下降。',
    weight: s => s.stats.cohesion <= 63 || Object.values(s.mood).some(value => value < 44) ? 6 : 0,
    choices: [
      { label: '开个短会对齐', effect: { cohesion: 9, readiness: -4 } },
      { label: '照原计划推进', effect: { readiness: 5, cohesion: -8 } },
    ],
  },
  SPONSOR_OBLIGATION: {
    npc: 'external', title: '赞助方来问展位',
    line: '赞助方想在入口摆一块展示牌。可以腾出位置，也可以退回一部分赞助。',
    reason: '你接受了本局的赞助。',
    weight: s => s.lastAction === 'SEEK_SPONSOR' ? 100 : 0,
    choices: [
      { label: '留出入口展位', effect: { readiness: -8, cohesion: -4 } },
      { label: '退还部分赞助', effect: { budget: -60, reputation: 3 } },
    ],
  },
  VIRAL_MOMENT: {
    npc: 'promotion', title: '预告传进了年级群',
    line: '刚发的摊位预告被转了好几手。继续加名额，就得抽人出来改现场动线。',
    reason: '准备度与社团声誉达到了传播条件。',
    weight: s => s.stats.readiness >= 50 && s.stats.reputation >= 45 ? 7 : 0,
    choices: [
      { label: '再开一批名额', effect: { signups: 8, readiness: -6 } },
      { label: '小批放号，先保现场', effect: { signups: 3, readiness: 4, capacity: 2 } },
    ],
  },
  BUDGET_ALERT: {
    npc: 'finance', title: '装饰清单超了预期',
    line: '工坊还能再订一批装饰。也能退掉一些，省给开场当天的机动开销。',
    reason: '近期搭建了摊位，或预算已经偏低。',
    weight: s => s.lastAction === 'BUILD_BOOTH' || s.stats.budget < 300 ? 6 : 0,
    choices: [
      { label: '退掉非必要装饰', effect: { budget: 45, readiness: -5 } },
      { label: '自己动手补齐', effect: { readiness: 6, cohesion: -5 } },
    ],
  },
  FINAL_CHECK: {
    npc: 'finance', title: '明天就开场',
    line: '现场还没完全布置好。我们集中收尾，还是最后拉一批人来？',
    reason: '进入最后一天，准备度或报名人数接近目标线。',
    weight: s => s.turn === 4 && (s.stats.readiness < 72 || s.stats.signups < 36) ? 12 : 0,
    choices: [
      { label: '暂停拉新，先收尾', effect: { readiness: 9, signups: -3 } },
      { label: '最后一轮拉新', effect: { signups: 6, cohesion: -4 } },
    ],
  },
  GEAR_CHECK: {
    npc: 'external', title: '志愿者带来了折叠桌',
    line: '有人愿意留下来帮忙。我们可以一起布置，也可以让他们把活动带进班群。',
    reason: '志愿者有空协助现场或宣传。',
    weight: s => s.lastAction === 'REHEARSE' ? 7 : 3,
    choices: [
      { label: '一起布置现场', effect: { readiness: 6, cohesion: 3, capacity: 2 } },
      { label: '请他们帮忙喊人', effect: { signups: 5 } },
    ],
  },
  QUEUE_SURGE: {
    npc: 'finance', title: '报名超过了接待上限',
    line: '候补名单已经排起来了。可以付钱加开候场区，也可以暂停一批预约，先把现场排好。',
    reason: '现有报名人数超过了场地接待上限。',
    weight: s => s.stats.signups > s.stats.capacity ? 16 : 0,
    choices: [
      { label: '加开候场区', effect: { budget: -30, capacity: 8, cohesion: -4 } },
      { label: '暂停一批预约', effect: { signups: -4, readiness: 6, cohesion: 3 } },
    ],
  },
  RAIN_WARNING: {
    npc: 'external', title: '积水挡住了主入口',
    line: '雨水淹了广场入口。可以借雨棚开侧门，也可以先把活动挪到连廊。',
    reason: '雨备场前两天需要安排一条能通行的动线。',
    weight: s => s.scenario === 'rain' && s.turn <= 2 ? 10 : 0,
    choices: [
      { label: '借雨棚开侧门', effect: { budget: -45, capacity: 7, readiness: 5 } },
      { label: '挪到连廊', effect: { capacity: -2, readiness: 10, cohesion: 4 } },
    ],
  },
  QUIET_TURN: {
    npc: 'finance', title: '计划照常',
    line: '今天没人追加条件。按你定的优先级继续吧。',
    reason: '没有其他未处理的事件符合当前局面。',
    weight: () => 1,
  },
};

export function candidates(snapshot: DirectorSnapshot) {
  if (snapshot.lastAction === 'SEEK_SPONSOR') return [{ id: 'SPONSOR_OBLIGATION' as const, weight: 100 }];
  if (snapshot.scenario === 'rain' && snapshot.turn <= 2 && !snapshot.previousEvents.includes('RAIN_WARNING')) {
    return [{ id: 'RAIN_WARNING' as const, weight: 10 }];
  }
  const legal = Object.entries(events).flatMap(([key, event]) => {
    const id = key as EventId;
    const weight = event.weight(snapshot);
    return id !== 'QUIET_TURN' && weight > 0 && !snapshot.previousEvents.includes(id)
      ? [{ id, weight }] : [];
  });
  return legal.length ? legal : [{ id: 'QUIET_TURN' as const, weight: 1 }];
}

export function legalDecisions(snapshot: DirectorSnapshot) {
  return candidates(snapshot).flatMap<Pick<Proposal, 'eventId' | 'offerId'>>(({ id }) => id === 'QUIET_TURN'
    ? [{ eventId: id, offerId: null }]
    : eligibleOffers(snapshot, events[id].npc).map(offerId => ({ eventId: id, offerId })));
}

export function isLegalDecision(snapshot: DirectorSnapshot, proposal: Proposal) {
  return legalDecisions(snapshot).some(decision =>
    decision.eventId === proposal.eventId && decision.offerId === proposal.offerId);
}

function hashKey(key: string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function seededRulesDirector(snapshot: DirectorSnapshot): Proposal {
  const { seed, turn, lastAction, previousEvents } = snapshot;
  const key = [seed, turn, lastAction, ...previousEvents].join('|');
  const options = candidates(snapshot);
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let position = hashKey(key) % total;
  const option = options.find(candidate => {
    position -= candidate.weight;
    return position < 0;
  })!;
  const { line, reason } = events[option.id];
  const supported = option.id === 'QUIET_TURN' ? [] : eligibleOffers(snapshot, events[option.id].npc);
  const offerId = supported.length ? supported[hashKey(`${key}:${option.id}`) % supported.length] : null;
  return { eventId: option.id, offerId, line, reason };
}
