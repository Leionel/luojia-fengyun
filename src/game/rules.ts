import { events, isLegalDecision } from './events';
import { offers } from './offers';
import { scenarios } from './scenarios';
import {
  maxTurns, type ActionId, type DirectorRequest, type DirectorResponse,
  type Effect, type Flag, type GameState, type NpcId, type ScenarioId, type Stats,
} from './model';

type Action = { label: string; description: string; effect: Effect; mood: Partial<Record<NpcId, number>>; flag?: Flag };
export const actionDetails: Record<ActionId, Action> = {
  PRINT_POSTERS: { label: '宣传造势', description: '在教学楼和食堂发活动海报', effect: { budget: -80, signups: 12, readiness: 5, cohesion: -2 }, mood: { promotion: 14, finance: -5, external: -4 } },
  BUILD_BOOTH: { label: '搭建摊位', description: '增加摊位和候场空间', effect: { budget: -150, readiness: 30, signups: 6, capacity: 15 }, mood: { promotion: 3, finance: -12 } },
  REHEARSE: { label: '彩排与分工', description: '走一遍现场动线，定好岗位', effect: { budget: -40, readiness: 25, cohesion: 8, capacity: 6 }, mood: { finance: 9, promotion: -4, external: 5 } },
  CLUB_ALLIANCE: { label: '社团联动', description: '请隔壁社团帮忙拉人和布置', effect: { budget: -40, signups: 10, readiness: 12, capacity: 4 }, mood: { external: 17, promotion: 3, finance: 4 }, flag: 'alliance' },
  SEEK_SPONSOR: { label: '寻找赞助', description: '补一笔经费，之后要安排展位', effect: { budget: 120, reputation: 3 }, mood: { external: 12, finance: 8 }, flag: 'sponsor' },
  RESOLVE_CONFLICT: { label: '协调矛盾', description: '把三位部长叫来碰个头', effect: { cohesion: 20, readiness: 5 }, mood: { promotion: 7, finance: 7, external: 7 } },
};

export function initialState(seed: string, sessionId = 'simulation', scenario: ScenarioId = 'spring'): GameState {
  return {
    sessionId, seed, scenario, version: 0, turn: 1, phase: 'ready',
    stats: { ...scenarios[scenario].start },
    flags: [], mood: { promotion: 60, finance: 60, external: 60 }, counts: {}, history: [],
  };
}

function clamp(value: number, max = 100) {
  return Math.max(0, Math.min(max, value));
}

export function applyEffect(stats: Stats, effect: Effect): Stats {
  return {
    budget: Math.max(0, stats.budget + (effect.budget ?? 0)),
    signups: Math.max(0, stats.signups + (effect.signups ?? 0)),
    capacity: clamp(stats.capacity + (effect.capacity ?? 0), 120),
    readiness: clamp(stats.readiness + (effect.readiness ?? 0)),
    cohesion: clamp(stats.cohesion + (effect.cohesion ?? 0)),
    reputation: clamp(stats.reputation + (effect.reputation ?? 0)),
  };
}

export function difference(after: Stats, before: Stats): Effect {
  return Object.fromEntries((Object.keys(after) as (keyof Stats)[])
    .filter(key => after[key] !== before[key]).map(key => [key, after[key] - before[key]]));
}

const diminishingReturns: Partial<Record<ActionId, Partial<Record<keyof Stats, readonly [deduction: number, floor: number]>>>> = {
  PRINT_POSTERS: { signups: [2, 6] },
  BUILD_BOOTH: { readiness: [10, 10], capacity: [6, 5], signups: [1, 3] },
  REHEARSE: { readiness: [7, 9], capacity: [2, 3] },
  CLUB_ALLIANCE: { signups: [2, 5], readiness: [4, 5], capacity: [1, 2] },
  RESOLVE_CONFLICT: { cohesion: [5, 10] },
};

export function actionEffect(state: GameState, id: ActionId, useOffer = true) {
  const effect = { ...actionDetails[id].effect };
  const previous = state.counts[id] ?? 0;
  for (const [key, [deduction, floor]] of Object.entries(diminishingReturns[id] ?? {})) {
    const stat = key as keyof Stats;
    effect[stat] = Math.max(floor, (effect[stat] ?? 0) - deduction * previous);
  }
  if (id === 'BUILD_BOOTH' && state.flags.includes('venue')) effect.budget = -80;
  if (id === 'PRINT_POSTERS' && state.flags.includes('posterFatigue')) effect.signups = Math.max(0, effect.signups! - 5);
  const offerId = state.incident?.offerId;
  const offer = useOffer && offerId ? offers[offerId] : null;
  if (offer?.action === id) {
    for (const [key, value] of Object.entries(offer.effect)) {
      const stat = key as keyof Stats;
      effect[stat] = (effect[stat] ?? 0) + value;
    }
  }
  return effect;
}

export function previewEffect(state: GameState, effect: Effect) {
  return difference(applyEffect(state.stats, effect), state.stats);
}

export function actionBlock(state: GameState, id: ActionId, useOffer = true) {
  if (id === 'SEEK_SPONSOR' && state.flags.includes('sponsor')) return '本局已获得赞助';
  if (id === 'SEEK_SPONSOR' && state.turn === maxTurns) return '赞助对接已截止';
  if (state.stats.budget + (actionEffect(state, id, useOffer).budget ?? 0) < 0) return '预算不足';
  return '';
}

function adjustMood(mood: GameState['mood'], deltas: Partial<GameState['mood']>): GameState['mood'] {
  return {
    promotion: clamp(mood.promotion + (deltas.promotion ?? 0)),
    finance: clamp(mood.finance + (deltas.finance ?? 0)),
    external: clamp(mood.external + (deltas.external ?? 0)),
  };
}

export function takeAction(state: GameState, id: ActionId, useOffer = true): GameState {
  if (state.phase !== 'ready' || (state.incident && !state.incident.responded) || actionBlock(state, id, useOffer)) return state;
  const action = actionDetails[id];
  const stats = applyEffect(state.stats, actionEffect(state, id, useOffer));
  const offerId = state.incident?.offerId;
  const offerUsed = useOffer && offerId && offers[offerId].action === id ? offerId : undefined;
  const flags = state.flags.filter(flag => flag !== 'posterFatigue' && !(id === 'BUILD_BOOTH' && flag === 'venue'));
  if (action.flag && !flags.includes(action.flag)) flags.push(action.flag);
  return {
    ...state,
    version: state.version + 1,
    lastAction: id,
    phase: state.turn === maxTurns ? 'finished' : 'directing',
    stats, flags, mood: adjustMood(state.mood, action.mood), incident: undefined,
    counts: { ...state.counts, [id]: (state.counts[id] ?? 0) + 1 },
    history: [...state.history, { turn: state.turn, kind: 'action', label: action.label, action: id, offerUsed, delta: difference(stats, state.stats) }],
  };
}

export function directorRequest(state: GameState): DirectorRequest {
  if (state.phase !== 'directing' || !state.lastAction) throw new Error('No action awaiting the director.');
  return {
    sessionId: state.sessionId,
    stateVersion: state.version,
    requestId: `${state.sessionId}:${state.version}`,
    snapshot: {
      seed: state.seed, scenario: state.scenario, turn: state.turn, stats: state.stats, flags: state.flags, mood: state.mood,
      counts: state.counts, lastAction: state.lastAction,
      previousEvents: state.history.flatMap(entry => entry.kind === 'director' && entry.event ? [entry.event] : []),
    },
  };
}

export function commitDirector(state: GameState, result: DirectorResponse): GameState {
  if (state.phase !== 'directing') return state;
  const request = directorRequest(state);
  if (result.sessionId !== request.sessionId || result.stateVersion !== request.stateVersion ||
      result.requestId !== request.requestId ||
      !isLegalDecision(request.snapshot, result.proposal)) return state;

  const { eventId } = result.proposal;
  const event = events[eventId];
  const incident = { ...result.proposal, mode: result.mode, requestId: result.requestId, responded: !event.choices };
  return {
    ...state, version: state.version + 1, phase: 'ready', turn: state.turn + 1, incident,
    history: [...state.history, { turn: state.turn + 1, kind: 'director', label: event.title, event: eventId, incident }],
  };
}

export function respondToIncident(state: GameState, index: 0 | 1): GameState {
  const incident = state.incident;
  if (state.phase !== 'ready' || !incident || incident.responded) return state;
  const event = events[incident.eventId];
  const choice = event.choices?.[index];
  if (!choice || state.stats.budget + (choice.effect.budget ?? 0) < 0) return state;
  const stats = applyEffect(state.stats, choice.effect);
  const flags: Flag[] = [...state.flags];
  if (choice.flag && !flags.includes(choice.flag)) flags.push(choice.flag);
  return {
    ...state, version: state.version + 1, stats, flags,
    mood: adjustMood(state.mood, { [event.npc]: index === 0 ? 8 : -3 }),
    incident: { ...incident, responded: true },
    history: [...state.history, { turn: state.turn, kind: 'response', label: choice.label, event: incident.eventId, choice: index, delta: difference(stats, state.stats) }],
  };
}

export function getAttendance(stats: Stats) {
  const admitted = Math.min(stats.capacity, stats.signups);
  return { admitted, waiting: stats.signups - admitted };
}

export function getOutcome(stats: Stats, scenario: ScenarioId = 'spring') {
  const { goals } = scenarios[scenario];
  const attendance = getAttendance(stats);
  const gaps = {
    readiness: Math.max(0, goals.readiness - stats.readiness),
    signups: Math.max(0, goals.attendance - stats.signups),
    capacity: Math.max(0, goals.attendance - stats.capacity),
    cohesion: Math.max(0, goals.cohesion - stats.cohesion),
  };
  const details = { gaps, ...attendance };
  if (gaps.readiness && gaps.signups) return { ...details, won: false, title: '市集改期了' };
  if (gaps.signups) return { ...details, won: false, title: '摊位搭好了，来的人太少' };
  if (gaps.capacity) return { ...details, won: false, title: '报名够了，场地装不下' };
  if (gaps.readiness) return { ...details, won: false, title: '报名满了，现场还没准备好' };
  if (gaps.cohesion) return { ...details, won: false, title: '开场前，值班表空了' };
  return { ...details, won: true, title: '樱花市集开场了！' };
}
