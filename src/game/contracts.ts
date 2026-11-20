import { z } from 'zod';
import { actions, eventIds, offerIds, scenarioIds } from './model';

const score = z.number().int().min(0).max(100);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,48}$/);
const envelope = {
  sessionId: id,
  stateVersion: z.number().int().min(1).max(15),
  requestId: z.string().regex(/^[a-zA-Z0-9-]{1,48}:\d{1,2}$/),
};
const shortText = z.string().trim().min(1).max(90).regex(/^[^<>\r\n\t\x00-\x1f]+$/);

export const proposalSchema = z.strictObject({
  eventId: z.enum(eventIds),
  offerId: z.enum(offerIds).nullable(),
  line: shortText,
  reason: shortText,
});

export const requestSchema = z.strictObject({
  ...envelope,
  snapshot: z.strictObject({
    seed: id,
    scenario: z.enum(scenarioIds),
    turn: z.number().int().min(1).max(4),
    stats: z.strictObject({
      budget: z.number().int().min(0).max(1000),
      signups: z.number().int().min(0).max(200),
      capacity: z.number().int().min(0).max(120),
      readiness: score, cohesion: score, reputation: score,
    }),
    flags: z.array(z.enum(['sponsor', 'venue', 'posterFatigue', 'alliance'])).max(4),
    mood: z.strictObject({ promotion: score, finance: score, external: score }),
    counts: z.partialRecord(z.enum(actions), z.number().int().min(0).max(5)),
    lastAction: z.enum(actions),
    previousEvents: z.array(z.enum(eventIds)).max(3),
  }),
}).refine(body => body.requestId === `${body.sessionId}:${body.stateVersion}`);

export const responseSchema = z.strictObject({
  ...envelope,
  proposal: proposalSchema,
  mode: z.enum(['demo', 'live_ai', 'fallback']),
});
