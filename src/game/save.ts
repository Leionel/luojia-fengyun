import { z } from 'zod';
import { proposalSchema } from './contracts';
import { seededRulesDirector } from './events';
import { actions, offerIds, scenarioIds, type GameState, type Mode, type RunMode } from './model';
import { commitDirector, directorRequest, initialState, respondToIncident, takeAction } from './rules';

export const storageKey = 'campus-chaos-p1';
const identifier = z.string().regex(/^[a-zA-Z0-9-]{1,48}$/);
const saveSchema = z.strictObject({
  version: z.literal(1),
  seed: identifier,
  sessionId: identifier,
  scenario: z.enum(scenarioIds),
  mode: z.enum(['live_ai', 'demo']),
  moves: z.array(z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('action'), action: z.enum(actions), offerUsed: z.enum(offerIds).optional() }),
    z.strictObject({ kind: z.literal('incident'), proposal: proposalSchema, mode: z.enum(['live_ai', 'demo', 'fallback']) }),
    z.strictObject({ kind: z.literal('response'), choice: z.union([z.literal(0), z.literal(1)]) }),
  ])).max(13),
});

export function serializeRun(state: GameState, mode: RunMode) {
  return JSON.stringify({
    version: 1, seed: state.seed, sessionId: state.sessionId, scenario: state.scenario, mode,
    moves: state.history.map(entry => {
      if (entry.kind === 'action') return { kind: 'action', action: entry.action, offerUsed: entry.offerUsed };
      if (entry.kind === 'response') return { kind: 'response', choice: entry.choice };
      const { eventId, offerId, reason, line, mode } = entry.incident!;
      return { kind: 'incident', proposal: { eventId, offerId, reason, line }, mode };
    }),
  });
}

export function commitLocalDirector(state: GameState, mode: Mode) {
  const { snapshot, ...envelope } = directorRequest(state);
  return commitDirector(state, { ...envelope, mode, proposal: seededRulesDirector(snapshot) });
}

export function restoreRun(encoded: string) {
  try {
    if (encoded.length > 12000) return null;
    const save = saveSchema.parse(JSON.parse(encoded));
    let state = initialState(save.seed, save.sessionId, save.scenario);
    for (const move of save.moves) {
      let next: GameState;
      if (move.kind === 'action') {
        next = takeAction(state, move.action, Boolean(move.offerUsed));
        if (next.history.at(-1)?.offerUsed !== move.offerUsed) return null;
      } else if (move.kind === 'response') {
        next = respondToIncident(state, move.choice);
      } else {
        const { snapshot: _, ...envelope } = directorRequest(state);
        next = commitDirector(state, { ...envelope, mode: move.mode, proposal: move.proposal });
      }
      if (next === state) return null;
      state = next;
    }
    const recoveredFromWaiting = state.phase === 'directing';
    if (recoveredFromWaiting) state = commitLocalDirector(state, save.mode === 'live_ai' ? 'fallback' : 'demo');
    return { state, mode: save.mode, recoveredFromWaiting };
  } catch {
    return null;
  }
}
