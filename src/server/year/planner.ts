import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DirectorRequest } from '../../year/commands';
import { liveYearAvailable, selectWithModel } from './provider';

const outputSchema = z.strictObject({ picks: z.array(z.unknown()).max(32) });
let inFlight = 0;
let recent: number[] = [];

export function validateSelection(input: DirectorRequest, raw: unknown) {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) return { intentIds: [], invalid: 1 };
  const seen = new Set<string>();
  const intentIds: string[] = [];
  let invalid = 0;
  for (const pick of parsed.data.picks) {
    const option = typeof pick === 'number' && Number.isInteger(pick) ? input.options[pick - 1] : undefined;
    if (!option || seen.has(option.actorId)) { invalid++; continue; }
    seen.add(option.actorId);
    intentIds.push(option.id);
  }
  return { intentIds, invalid };
}

export async function decide(input: DirectorRequest) {
  const { yearId, revision, basisDigest } = input;
  const envelope = { yearId, revision, basisDigest };
  const fallback = { ...envelope, status: 'fallback', invalid: 0 };
  const now = Date.now();
  recent = recent.filter(timestamp => now - timestamp < 60000);
  if (!liveYearAvailable() || inFlight >= 3 || recent.length >= 36) return fallback;
  recent.push(now);
  inFlight++;
  const traceId = randomUUID();
  const hash = (object: unknown) => createHash('sha256').update(JSON.stringify(object)).digest('hex');
  const options = input.options.map(({ name, goal, label, basis }, i) => ({ pick: i + 1, name, goal, label, basis }));
  try {
    const { output, providerId, tokens } = await selectWithModel(input.window, options);
    const adopted = validateSelection(input, output);
    console.info('[year-director]', { traceId, yearId, revision, window: input.window, inputHash: hash(options), outputHash: hash(output),
      adopted: adopted.intentIds, invalid: adopted.invalid, millis: Date.now() - now, model: process.env.AI_MODEL, tokens, providerId });
    return adopted.intentIds.length ? { ...envelope, status: 'live', invalid: adopted.invalid, selection: { traceId, intentIds: adopted.intentIds } }
      : { ...fallback, invalid: adopted.invalid };
  } catch (error) {
    console.info('[year-director]', { traceId, yearId, revision, status: 'fallback', millis: Date.now() - now, type: error instanceof Error ? error.name : 'error' });
    return fallback;
  } finally { inFlight--; }
}
