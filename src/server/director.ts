import { z } from 'zod';
import { proposalSchema } from '../game/contracts';
import { candidates, events, legalDecisions, seededRulesDirector } from '../game/events';
import { npcs, type DirectorRequest, type DirectorResponse } from '../game/model';
import { offers } from '../game/offers';
import { actionDetails } from '../game/rules';

export function directorMode() {
  return process.env.AI_API_KEY && process.env.AI_MODEL ? 'live_ai' : 'demo';
}

const pending = new Map<string, { until: number; result: Promise<DirectorResponse> }>();
const maxSeen = 128;
let inFlight = 0;
const modelSelection = z.strictObject({
  pick: z.number().int().min(1),
  line: proposalSchema.shape.line.max(36).optional(),
  reason: proposalSchema.shape.reason.max(30).optional(),
});

export function runDirector(request: DirectorRequest) {
  const { requestId, snapshot } = request;
  const mode = directorMode();
  if (mode === 'demo') return Promise.resolve(makeResponse(request, seededRulesDirector(snapshot), mode));
  if (legalDecisions(snapshot).length === 1) {
    console.info('[campus/director]', { requestId, status: 'rule-only', requestedModel: false });
    return Promise.resolve(makeResponse(request, seededRulesDirector(snapshot), 'demo'));
  }

  const now = Date.now();
  for (const [id, item] of pending) {
    if (item.until <= now) pending.delete(id);
  }
  const previous = pending.get(requestId);
  if (previous) return previous.result;
  if (inFlight >= 4) {
    console.info('[campus/director]', { requestId, status: 'rejected', cause: 'busy', requestedModel: false });
    return Promise.resolve(makeResponse(request, seededRulesDirector(snapshot), 'fallback'));
  }
  if (pending.size >= maxSeen) {
    const oldest = pending.keys().next().value;
    if (oldest) pending.delete(oldest);
  }

  inFlight += 1;
  const result = askModel(request).finally(() => { inFlight -= 1; });
  pending.set(requestId, { until: now + 120_000, result });
  return result;
}

function makeResponse(
  { sessionId, requestId, stateVersion }: DirectorRequest,
  proposal: DirectorResponse['proposal'],
  mode: DirectorResponse['mode'],
): DirectorResponse {
  return { sessionId, requestId, stateVersion, mode, proposal };
}

async function askModel(request: DirectorRequest): Promise<DirectorResponse> {
  const { requestId, snapshot } = request;
  const decisions = legalDecisions(snapshot);
  const options = candidates(snapshot).map(({ id }) => ({
    event: events[id].title, npc: npcs[events[id].npc].name,
    offers: decisions.flatMap(({ eventId, offerId }, index) => {
      if (eventId !== id || !offerId) return [];
      const offer = offers[offerId];
      return [{ pick: index + 1, name: offer.label, action: actionDetails[offer.action].label, effect: offer.effect }];
    }),
  }));
  const start = Date.now();
  let requestedModel = false;
  console.info('[campus/director]', { requestId, status: 'proposed', candidates: decisions.length });

  try {
    const base = (process.env.AI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const url = new URL(base + '/chat/completions');
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('invalid-url');
    }
    requestedModel = true;
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      signal: AbortSignal.timeout(5200),
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        ...(process.env.AI_MODEL?.startsWith('deepseek-') ? { reasoning_effort: 'none' } : {}),
        max_tokens: 110,
        messages: [
          { role: 'system', content: '你是校园市集导演。选一个给定的 pick，让事件接续上一行动并权衡缺口。只输出短 JSON，例如 {"pick":1,"reason":"现场动线最紧"}。可补一条不编造细节的台词 line，最多20字。' },
          { role: 'user', content: JSON.stringify({
            turn: snapshot.turn + 1, scenario: snapshot.scenario, stats: snapshot.stats,
            last: actionDetails[snapshot.lastAction].label, previousEvents: snapshot.previousEvents, options,
          }) },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error('provider-http');
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length > 1500) throw new Error('provider-format');
    const selection = modelSelection.parse(JSON.parse(content));
    const chosen = decisions[selection.pick - 1];
    if (!chosen) throw new Error('illegal-decision');
    const event = events[chosen.eventId];
    const proposal = { ...chosen, line: selection.line ?? event.line, reason: selection.reason ?? event.reason };

    console.info('[campus/director]', {
      requestId, status: 'validated', requestedModel, eventId: proposal.eventId, offerId: proposal.offerId, durationMs: Date.now() - start,
      providerRequestId: response.headers.get('x-request-id')?.slice(0, 100),
    });
    return makeResponse(request, proposal, 'live_ai');
  } catch (error) {
    const cause = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'invalid-or-unavailable';
    console.info('[campus/director]', { requestId, status: 'rejected', requestedModel, cause, durationMs: Date.now() - start });
    return makeResponse(request, seededRulesDirector(snapshot), 'fallback');
  }
}
