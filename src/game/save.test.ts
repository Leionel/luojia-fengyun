import { expect, it } from 'vitest';
import { commitLocalDirector, restoreRun, serializeRun } from './save';
import { initialState, respondToIncident, takeAction } from './rules';

it('replays the mode, scene, committed incidents and chosen actions without accepting stored state', () => {
  const action = takeAction(initialState('sakura-01', 'test-save', 'rain'), 'CLUB_ALLIANCE');
  const next = respondToIncident(commitLocalDirector(action, 'demo'), 0);
  const saved = serializeRun(next, 'demo');
  expect(restoreRun(saved)).toEqual({ state: next, mode: 'demo', recoveredFromWaiting: false });
  expect(restoreRun(saved.replace('RAIN_WARNING', 'FREE_VENUE_OFFER'))).toBeNull();
});

it('resumes a pending day locally exactly once', () => {
  const pending = takeAction(initialState('sakura-01', 'test-recover'), 'CLUB_ALLIANCE');
  const resolved = restoreRun(serializeRun(pending, 'live_ai'));
  expect(resolved?.state).toMatchObject({ turn: 2, stats: { budget: 460, signups: 15 }, incident: { mode: 'fallback' } });
  expect(resolved?.recoveredFromWaiting).toBe(true);
  expect(restoreRun(serializeRun(resolved!.state, 'live_ai'))?.state).toEqual(resolved?.state);
});
