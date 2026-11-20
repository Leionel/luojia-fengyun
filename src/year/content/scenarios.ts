import { initialClubs } from './clubs';
import { initialPeople } from './npcs';
import type { CampaignOrigin, ScenarioId, World } from '../model';

export const scenarios: Record<ScenarioId, { label: string; story: string }> = {
  struggling: { label: '濒临解散', story: '¥500 和四位骨干。摄影社在主路等你的答复。' },
  legacy: { label: '老牌衰落', story: '尚有 ¥850 和旧日声望，两笔义务和紧张的人员排期也一起留下。' },
  tech: { label: '技术新秀', story: '¥520，工坊已能小规模试产。新人想早点开始做作品。' },
  culture: { label: '文化社团', story: '¥650 和可用的布置方案，旧书社愿意先聊交换角。' },
};

export function newWorld(yearId: string, seed: string, origin?: CampaignOrigin): World {
  const world: World = {
    yearId, seed, revision: 0, cursor: 0, window: 1, ended: false,
    clubs: initialClubs(), people: initialPeople(),
    relationships: Object.fromEntries(['photo', 'music', 'tech', 'book'].map((club, i) => [
      `${club}>player`, { from: club, to: 'player', trust: [20, 15, 20, 30][i], alignment: 0, bond: 0, conflicts: [] },
    ])),
    reservations: {}, projects: {}, commitments: {}, grants: {}, applications: {}, choices: {}, facts: {},
  };
  if (!origin) return world;
  world.campaign = { origin, deals: {}, trainings: {}, skills: structuredClone(origin.carry?.skills ?? {}), debts: structuredClone(origin.carry?.debts ?? []) };
  if (origin.scenario === 'legacy') {
    world.clubs.player.cash = 85000;
    world.clubs.player.reputation = 50;
    world.people.aning.weeklyUnits = 10;
    world.people.jiangyi.weeklyUnits = 8;
    if (!origin.carry) world.campaign.debts = [
      { club: 'photo', cents: 4000, title: '上年摄影材料费' },
      { club: 'music', cents: 3500, title: '上年场地分摊' },
    ];
  }
  if (origin.scenario === 'tech') {
    world.clubs.player.cash = 52000;
    world.clubs.player.reputation = 20;
    world.people.anan.goal = '让试产作品获得自己的署名';
    world.people.qiutong.status = 'active';
    world.people.wuyuan.status = 'active';
  }
  if (origin.scenario === 'culture') {
    world.clubs.player.cash = 65000;
    world.clubs.player.reputation = 35;
    world.people.xiaoyu.experience = 2;
    world.relationships['book>player'].trust = 38;
  }
  if (origin.carry) {
    const { balance, ties, steward } = origin.carry;
    world.clubs.player.cash = balance;
    world.relationships = { ...world.relationships, ...structuredClone(ties) };
    if (steward !== 'rotation' && steward !== 'trusteeship') {
      world.people[steward].role = '现任社长';
      world.people[steward].status = 'active';
    }
  }
  return world;
}
