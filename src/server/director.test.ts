import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/campus/director/route';
import { legalDecisions, seededRulesDirector } from '../game/events';
import { directorRequest, initialState, takeAction } from '../game/rules';

const start = (id: string) => directorRequest(takeAction(initialState('sakura-01', id), 'CLUB_ALLIANCE'));
const send = (input: unknown) => POST(new Request('http://localhost/api/campus/director', {
  method: 'POST', body: JSON.stringify(input),
}));
const provider = (content: unknown) => Response.json({
  choices: [{ message: { content: JSON.stringify(content) } }],
}, { headers: { 'x-request-id': 'test-provider-id' } });

function configureProvider() {
  vi.stubEnv('AI_API_KEY', 'unit-test');
  vi.stubEnv('AI_MODEL', 'unit-test');
  vi.stubEnv('AI_API_BASE_URL', 'http://localhost:3212/v1');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('campus director endpoint', () => {
  it('validates the envelope and returns demo without a model request', async () => {
    vi.stubEnv('AI_API_KEY', '');
    const model = vi.fn();
    vi.stubGlobal('fetch', model);
    const request = start('demo-test');
    expect((await send({ ...request, stateVersion: 0 })).status).toBe(400);
    expect(await (await send(request)).json()).toMatchObject({
      mode: 'demo', proposal: seededRulesDirector(request.snapshot),
    });
    expect(model).not.toHaveBeenCalled();
  });

  it('uses a legal model choice distinct from the demo event and deduplicates concurrent requests', async () => {
    configureProvider();
    vi.stubEnv('AI_MODEL', 'deepseek-v4-flash');
    const request = start('live-branch-test');
    const local = seededRulesDirector(request.snapshot);
    const legal = legalDecisions(request.snapshot);
    const index = legal.findIndex(candidate => candidate.eventId !== local.eventId);
    const other = legal[index];
    const proposal = { ...other, line: '今天我想跟你商量接下来的安排。', reason: '承接刚才的联动选择。' };
    const model = vi.fn(async () => provider({ pick: index + 1, line: proposal.line, reason: proposal.reason }));
    vi.stubGlobal('fetch', model);
    const results = await Promise.all([send(request), send(request)]);
    for (const result of results) expect(await result.json()).toMatchObject({ mode: 'live_ai', proposal });
    expect(model).toHaveBeenCalledTimes(1);
    expect(model).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      body: expect.stringContaining('"reasoning_effort":"none"'),
    }));
  });

  it('falls back on HTTP errors, timeout, invalid schema, and illegal events', async () => {
    configureProvider();
    const model = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockRejectedValueOnce(new DOMException('Deadline', 'TimeoutError'))
      .mockResolvedValueOnce(provider({ pick: 'text', reason: '测试' }))
      .mockResolvedValueOnce(provider({ pick: 999, reason: '不在候选里' }));
    vi.stubGlobal('fetch', model);
    for (let index = 0; index < 4; index += 1) {
      const request = start(`fallback-${index}`);
      expect(await (await send(request)).json()).toMatchObject({
        mode: 'fallback', proposal: seededRulesDirector(request.snapshot),
      });
    }
  });
});
