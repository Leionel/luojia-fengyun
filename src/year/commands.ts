import { z } from 'zod';
import { scenarioIds } from './model';

export const key = z.string().min(1).max(96).regex(/^[A-Za-z0-9:.\-]+$/);
const revision = z.number().int().min(0).max(500);
const basis = z.string().regex(/^[a-f0-9]{8}$/);
export const actorSchema = z.enum(['anan', 'xiaoyu', 'jiangyi', 'aning', 'chenlan', 'hemu', 'linqi', 'dushu', 'qiutong', 'wuyuan']);
export const clubSchema = z.enum(['photo', 'music', 'tech', 'book']);
export const placeSchema = z.enum(['plaza', 'stage', 'workshop', 'library', 'room']);
export const skillSchema = z.enum(['operations', 'mediation', 'finance']);
export const termsSchema = z.strictObject({
  kind: z.enum(['show', 'gear', 'workshop', 'publicity']), club: clubSchema, place: placeSchema, owner: actorSchema,
  window: z.number().int().min(1).max(23), fee: z.number().int().min(0).max(60000),
  share: z.number().int().min(0).max(100), credit: z.boolean(), units: z.number().int().min(2).max(8),
});
export const termsDraftSchema = termsSchema.partial();
export const stylesSchema = z.array(z.enum(['keep', 'credit', 'reduce'])).min(1).max(4);
const rev = z.number().int().min(1).max(500);
export const originSchema = z.strictObject({
  scenario: z.enum(scenarioIds),
  carry: z.strictObject({
    season: z.number().int().min(2).max(20), parent: key, balance: z.number().int().min(0).max(9999999),
    steward: z.union([actorSchema, z.enum(['rotation', 'trusteeship'])]),
    skills: z.partialRecord(actorSchema, z.array(skillSchema).max(3)),
    ties: z.record(z.string().max(40), z.strictObject({
      from: z.string().max(20), to: z.string().max(20), trust: z.number().int().min(-100).max(100),
      alignment: z.number().int().min(-100).max(100), bond: z.number().int().min(0).max(100), conflicts: z.array(key).max(40),
    })),
    debts: z.array(z.strictObject({ club: clubSchema, cents: z.number().int().min(0).max(60000), title: z.string().max(80) })).max(80),
  }).optional(),
});
export const selectionSchema = z.strictObject({ intentIds: z.array(key).max(12), traceId: key });
export const commandSchema = z.strictObject({
  id: key, yearId: key, expectedRevision: revision, basisDigest: basis,
  action: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('choose'), decisionId: key, optionId: key }),
    z.strictObject({ kind: z.literal('grant'), actorId: z.literal('anan'), enabled: z.boolean() }),
    z.strictObject({ kind: z.literal('application'), id: key, accept: z.boolean() }),
    z.strictObject({ kind: z.literal('quote'), terms: z.array(termsSchema).min(1).max(4), reply: z.strictObject({ styles: stylesSchema, traceId: key }).optional() }),
    z.strictObject({ kind: z.literal('respond'), deals: z.array(z.strictObject({ id: key, version: rev })).min(1).max(4), accept: z.boolean() }),
    z.strictObject({ kind: z.literal('counter'), id: key, version: rev, terms: termsSchema }),
    z.strictObject({ kind: z.literal('amend'), id: key, version: rev, operation: z.enum(['reassign', 'reschedule', 'resize', 'cancel']), owner: actorSchema.optional() }),
    z.strictObject({ kind: z.literal('train'), mentor: actorSchema, pupil: actorSchema, skill: skillSchema }),
    z.strictObject({ kind: z.literal('review'), id: key }),
    z.strictObject({ kind: z.literal('queue'), method: z.enum(['expand', 'stagger', 'small']) }),
    z.strictObject({ kind: z.literal('debt'), index: z.number().int().min(0).max(79) }),
    z.strictObject({ kind: z.literal('vote'), nominee: z.union([actorSchema, z.literal('rotation')]) }),
    z.strictObject({ kind: z.literal('enable-campaign') }),
    z.strictObject({ kind: z.literal('fieldwork'), projectId: key, approach: z.literal('entrance').optional() }),
    z.strictObject({ kind: z.literal('advance'), selection: selectionSchema.optional(), fallback: z.boolean().optional() }),
  ]),
});
export const directorRequestSchema = z.strictObject({
  yearId: key, revision, basisDigest: basis, window: z.number().int().min(1).max(24),
  options: z.array(z.strictObject({
    id: key, actorId: key, name: z.string().max(16), goal: z.string().max(90),
    label: z.string().max(90), basis: z.string().max(100),
  })).min(1).max(16),
});
export const directorReplySchema = z.strictObject({
  yearId: key, revision, basisDigest: basis, selection: selectionSchema.optional(),
  status: z.enum(['live', 'fallback']), invalid: z.number().int().nonnegative(),
});
export type DirectorRequest = z.infer<typeof directorRequestSchema>;
