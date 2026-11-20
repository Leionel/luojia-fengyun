import { describe, expect, it } from 'vitest';
import { candidates, events, legalDecisions, seededRulesDirector } from './events';
import { actions, type ActionId, type GameState, type ScenarioId } from './model';
import { actionBlock, actionEffect, commitDirector, directorRequest, getOutcome, initialState, previewEffect, respondToIncident, takeAction } from './rules';

function nextDay(state: GameState, choice: 0 | 1): GameState {
  if (state.phase !== 'directing') return state;
  const { snapshot, ...request } = directorRequest(state);
  const proposal = seededRulesDirector(snapshot);
  const next = commitDirector(state, { ...request, mode: 'demo', proposal });
  return respondToIncident(next, choice);
}

function play(seed: string, route: ActionId[], scenario: ScenarioId = 'spring') {
  return route.reduce((state, move) => nextDay(takeAction(state, move), 0), initialState(seed, 'routes', scenario));
}

describe('five-day state machine', () => {
  it('applies action and events once and rejects stale or illegal proposals', () => {
    const selected = takeAction(initialState('sakura'), 'PRINT_POSTERS');
    expect(selected.stats).toMatchObject({ budget: 420, signups: 17, readiness: 30, cohesion: 58 });
    expect(takeAction(selected, 'REHEARSE')).toBe(selected);
    const { snapshot, ...request } = directorRequest(selected);
    const proposal = seededRulesDirector(snapshot);
    const reply = { ...request, mode: 'demo' as const, proposal };
    expect(commitDirector(selected, { ...reply, stateVersion: 0 })).toBe(selected);
    expect(commitDirector(selected, { ...reply, sessionId: 'different-session' })).toBe(selected);
    expect(commitDirector(selected, { ...reply, proposal: { ...proposal, eventId: 'VIRAL_MOMENT' } })).toBe(selected);
    const next = commitDirector(selected, reply);
    expect(next.turn).toBe(2);
    expect(commitDirector(next, reply)).toBe(next);
    expect(takeAction(next, 'REHEARSE')).toBe(next);
    const resolved = respondToIncident(next, 0);
    expect(respondToIncident(resolved, 0)).toBe(resolved);
    expect(takeAction(resolved, 'REHEARSE').version).toBe(4);
  });

  it('uses the venue voucher once, honors costs and restricts sponsorship', () => {
    const alliance = takeAction(initialState('sakura'), 'CLUB_ALLIANCE');
    const { snapshot, ...envelope } = directorRequest(alliance);
    expect(candidates(snapshot).some(option => option.id === 'FREE_VENUE_OFFER')).toBe(true);
    const event = events.FREE_VENUE_OFFER;
    const next = commitDirector(alliance, {
      ...envelope, mode: 'demo', proposal: { eventId: 'FREE_VENUE_OFFER', offerId: 'VOLUNTEER_SHIFT', line: event.line, reason: event.reason },
    });
    const shared = respondToIncident(next, 0);
    expect(actionEffect(shared, 'BUILD_BOOTH').budget).toBe(-80);
    expect(actionEffect(takeAction(shared, 'BUILD_BOOTH'), 'BUILD_BOOTH').budget).toBe(-150);
    const broke = { ...shared, stats: { ...shared.stats, budget: 79 } };
    expect(takeAction(broke, 'BUILD_BOOTH')).toBe(broke);
    const sponsor = takeAction(initialState('sakura'), 'SEEK_SPONSOR');
    expect(candidates(directorRequest(sponsor).snapshot).map(item => item.id)).toEqual(['SPONSOR_OBLIGATION']);
    expect(takeAction(nextDay(sponsor, 1), 'SEEK_SPONSOR').stats.budget).toBe(560);
    expect(actionBlock({ ...shared, turn: 5 }, 'SEEK_SPONSOR')).toBe('赞助对接已截止');
  });

  it('limits attendance by capacity and gives repeated moves smaller marginal gains', () => {
    const initial = initialState('sakura-01');
    expect(getOutcome({ ...initial.stats, signups: 50, readiness: 70 })).toMatchObject({
      won: false, title: '报名够了，场地装不下', admitted: 20, waiting: 30,
    });
    const next = nextDay(takeAction(initial, 'PRINT_POSTERS'), 0);
    expect(actionEffect(next, 'PRINT_POSTERS', false).signups).toBe(10);
    const nearCap = { ...next, stats: { ...next.stats, readiness: 96 } };
    expect(previewEffect(nearCap, actionEffect(nearCap, 'BUILD_BOOTH', false)).readiness).toBe(4);
  });

  it('keeps the same event while legal proposals change the final price and capacity', () => {
    const started = takeAction(initialState('sakura-01'), 'CLUB_ALLIANCE');
    const { snapshot, ...request } = directorRequest(started);
    const options = legalDecisions(snapshot);
    expect(options).toContainEqual({ eventId: 'TEAM_DISPUTE', offerId: 'REUSE_SUPPLIES' });
    expect(options).toContainEqual({ eventId: 'TEAM_DISPUTE', offerId: 'ROUTE_DRILL' });
    const enter = (offerId: 'REUSE_SUPPLIES' | 'ROUTE_DRILL' | 'SHARED_BOOTH') => commitDirector(started, {
      ...request, mode: 'live_ai', proposal: { eventId: 'TEAM_DISPUTE', offerId, line: '先排好班。', reason: '现有分工冲突。' },
    });
    expect(enter('SHARED_BOOTH')).toBe(started);
    const reused = respondToIncident(enter('REUSE_SUPPLIES'), 0);
    const drilled = respondToIncident(enter('ROUTE_DRILL'), 0);
    expect(reused.stats).toEqual(drilled.stats);
    const withOffer = takeAction(drilled, 'REHEARSE');
    const without = takeAction(drilled, 'REHEARSE', false);
    expect(withOffer.stats.capacity - without.stats.capacity).toBe(5);
    expect(without.stats.budget - withOffer.stats.budget).toBe(10);
    expect(takeAction(reused, 'REHEARSE').stats).toEqual(without.stats);
    expect(withOffer.history.at(-1)?.offerUsed).toBe('ROUTE_DRILL');
    expect(actionEffect(withOffer, 'REHEARSE').budget).toBe(-40);
  });

  it('supports distinct winning strategies, setbacks, and exact seed replays', () => {
    const marketing: ActionId[] = ['PRINT_POSTERS', 'PRINT_POSTERS', 'BUILD_BOOTH', 'REHEARSE', 'RESOLVE_CONFLICT'];
    const cooperation: ActionId[] = ['CLUB_ALLIANCE', 'REHEARSE', 'CLUB_ALLIANCE', 'BUILD_BOOTH', 'CLUB_ALLIANCE'];
    const first = play('sakura-01', marketing);
    expect(first).toEqual(play('sakura-01', marketing));
    expect(first.phase).toBe('finished');
    expect(getOutcome(first.stats).won).toBe(true);
    expect(getOutcome(play('sakura-01', cooperation).stats).won).toBe(true);
    expect(getOutcome(play('sakura-01', ['CLUB_ALLIANCE', 'REHEARSE', 'PRINT_POSTERS', 'REHEARSE', 'CLUB_ALLIANCE']).stats).won).toBe(true);
    const rain = play('sakura-01', ['CLUB_ALLIANCE', 'REHEARSE', 'PRINT_POSTERS', 'REHEARSE', 'CLUB_ALLIANCE'], 'rain');
    expect(rain.history.some(entry => entry.event === 'RAIN_WARNING')).toBe(true);
    expect(getOutcome(rain.stats, 'rain').won).toBe(true);
    expect(getOutcome(play('sakura-01', Array(5).fill('RESOLVE_CONFLICT')).stats).won).toBe(false);
    expect(getOutcome(play('sakura-01', Array(5).fill('REHEARSE')).stats).title).toBe('摊位搭好了，来的人太少');
  });

  it('completes 480 seeded games across two scenarios with valid resource ranges', () => {
    const endings = new Set<string>();
    const encountered = new Set<string>();
    const wins = { spring: 0, rain: 0 };
    for (const scenario of ['spring', 'rain'] as const) for (let index = 1; index <= 240; index += 1) {
      let rng = Math.imul(index, 0x9e3779b9) >>> 0;
      const random = (max: number) => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        return Math.floor(rng / 4294967296 * max);
      };
      let state = initialState(`sakura-${index}`, 'simulation', scenario);
      for (let turn = 1; turn <= 5; turn += 1) {
        const legal = actions.filter(action => !actionBlock(state, action));
        const move = legal[random(legal.length)];
        const desired = random(2) === 0 ? 0 : 1;
        const action = takeAction(state, move);
        const next = nextDay(action, desired);
        state = next.incident && !next.incident.responded ? respondToIncident(next, 1) : next;
        expect(state.stats.budget).toBeGreaterThanOrEqual(0);
        expect(state.stats.signups).toBeGreaterThanOrEqual(0);
        expect(state.stats.capacity).toBeGreaterThanOrEqual(0);
        expect(state.stats.capacity).toBeLessThanOrEqual(120);
        for (const score of [state.stats.readiness, state.stats.cohesion, state.stats.reputation, ...Object.values(state.mood)]) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
      expect(state.phase).toBe('finished');
      expect(state.history.filter(entry => entry.kind === 'action')).toHaveLength(5);
      state.history.forEach(entry => { if (entry.event) encountered.add(entry.event); });
      const outcome = getOutcome(state.stats, scenario);
      endings.add(outcome.title);
      if (outcome.won) wins[scenario] += 1;
    }
    for (const count of Object.values(wins)) {
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(240);
    }
    expect(encountered.size).toBe(Object.keys(events).length);
    expect(endings).toContain('报名够了，场地装不下');
    console.info('480 seeded games:', { wins, endings: [...endings], events: [...encountered] });
  });
});
