import { afterEach, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/campus/year/decide/route';
import { newWorld } from '../../year/content/scenarios';
import { execute, makeCommand } from '../../year/engine/reducer';
import { directorInput } from '../../year/view/directorInput';
import { validateSelection } from './planner';

const start = newWorld('verify', 'fair-01');
const chosen = execute(start, makeCommand(start, 'choice', { kind: 'choose', decisionId: 'w1', optionId: 'join-photo' }));
if (!chosen.ok) throw new Error(chosen.message);
const input = directorInput(chosen.world);

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('keeps valid members of a mixed model reply and limits one move per person', () => {
  const other = input.options.findIndex(option => option.actorId !== input.options[0].actorId);
  expect(validateSelection(input, { picks: [1, 2, other + 1, 999, 'a'] })).toEqual({
    intentIds: [input.options[0].id, input.options[other].id], invalid: 3,
  });
});

it('validates the online response envelope and falls back on a provider failure', async () => {
  vi.stubEnv('AI_API_KEY', 'test-only');
  vi.stubEnv('AI_MODEL', 'deepseek-v4-flash');
  vi.stubEnv('AI_API_BASE_URL', 'http://localhost:3212/v1');
  const content = JSON.stringify({ picks: [2] });
  const transport = vi.fn()
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content } }] }))
    .mockRejectedValueOnce(new Error('unavailable'));
  vi.stubGlobal('fetch', transport);
  const send = (payload: unknown) => POST(new Request('http://localhost/api/campus/year/decide', {
    method: 'POST', body: JSON.stringify(payload),
  }));
  const real = await (await send(input)).json();
  expect(real).toMatchObject({ status: 'live', revision: input.revision, selection: { intentIds: [input.options[1].id] } });
  expect(await (await send(input)).json()).toMatchObject({ status: 'fallback', revision: input.revision });
  expect((await send({ ...input, options: [false] })).status).toBe(400);
  expect((await send({ oversized: 'x'.repeat(13000) })).status).toBe(413);
});
