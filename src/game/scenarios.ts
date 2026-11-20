import { opening, type ScenarioId, type Stats } from './model';

type Scenario = {
  label: string;
  description: string;
  start: Stats;
  goals: { attendance: number; readiness: number; cohesion: number };
  opening: { title: string; line: string };
};

export const scenarios: Record<ScenarioId, Scenario> = {
  spring: {
    label: '樱花常场',
    description: '¥500 开局，接待目标 30 人。',
    start: { budget: 500, signups: 5, capacity: 20, readiness: 25, cohesion: 60, reputation: 45 },
    goals: { attendance: 30, readiness: 65, cohesion: 40 },
    opening,
  },
  rain: {
    label: '雨备场',
    description: '¥340 开局，接待目标 28 人，湿滑场地要求更充分的准备。',
    start: { budget: 340, signups: 8, capacity: 16, readiness: 22, cohesion: 55, reputation: 45 },
    goals: { attendance: 28, readiness: 70, cohesion: 45 },
    opening: {
      title: '雨棚有限，先保哪一头？',
      line: '雨落下来了。小予算过，支完雨棚就剩不下多少宣传费。江一在问旧书社能不能搭把手。',
    },
  },
};
