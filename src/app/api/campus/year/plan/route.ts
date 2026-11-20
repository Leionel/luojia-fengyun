import { createHash, randomUUID } from 'node:crypto';
import { draftFromText, draftOutput, replyOutput, strategyInput, yearbookOutput } from '../../../../../year/content/strategy';
import { liveYearAvailable, yearModel } from '../../../../../server/year/provider';

let inFlight = 0;
let recent: number[] = [];

export async function POST(request: Request) {
  if (!request.body || Number(request.headers.get('Content-Length')) > 10000) return Response.json({ error: '请求过大' }, { status: 413 });
  let raw: unknown;
  const reader = request.body.getReader();
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let text = '';
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 10000) {
        await reader.cancel();
        return Response.json({ error: '请求过大' }, { status: 413 });
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    raw = JSON.parse(text + decoder.decode());
  } catch { return Response.json({ error: '请求格式错误' }, { status: 400 }); }
  finally { reader.releaseLock(); }
  const check = strategyInput.safeParse(raw);
  if (!check.success) return Response.json({ error: '请求字段无效' }, { status: 400 });
  const input = check.data;
  const fallback = { basis: input.basis, source: 'rule',
    ...(input.kind === 'draft' ? { groups: draftFromText(input.text, input.window) } :
      input.kind === 'yearbook' ? { picks: [1] } : {}) };
  const now = Date.now();
  recent = recent.filter(at => now - at < 60000);
  if (!liveYearAvailable() || inFlight >= 2 || recent.length >= 24) return Response.json(fallback);
  inFlight++;
  recent.push(now);
  const traceId = randomUUID();
  try {
    const prompt = input.kind === 'draft'
      ? '把虚构校园社团计划变成 JSON {"groups":[]}，最多四个独立组。只抽取明确给出的字段，未明确则省略，严禁猜预算或负责人。字段 kind=show/gear/workshop/publicity, club=photo/music/tech/book, place=plaza/stage/workshop/library/room, owner=anan/xiaoyu/jiangyi/aning/qiutong/wuyuan, window=1..23, fee=整数分（40元=4000）, share=对方分成0..100, units=半小时数2..8, credit=是否共同署名。五月可能是窗口21。仅返回JSON。'
      : input.kind === 'reply'
        ? '你是对方四个虚构校园社团的代表。为每组从其variants已有键选择一项。考虑署名、费用、排班和规模。完整活动偏好保留工时，低预算可接受缩短。按组顺序返回 {"styles":["credit","keep"]}。只返回JSON。'
        : '为校园年度纪念册，从 facts 里选择 1 到 3 张最能说明本年变化的事实卡。只返回 JSON 对象，例如 {"picks":[1,2]}。数组值必须是对象已有的 number。';
    const data = input.kind === 'yearbook' ? { facts: input.facts.map((text, index) => ({ number: index + 1, text })) } : input;
    const { output, tokens } = await yearModel(prompt, data, input.kind === 'draft' ? 600 : 300);
    let parsed = (input.kind === 'draft' ? draftOutput : input.kind === 'reply' ? replyOutput : yearbookOutput).parse(output);
    if ('styles' in parsed && input.kind === 'reply' &&
      (parsed.styles.length !== input.groups.length || parsed.styles.some((style, i) => !input.groups[i].variants[style]))) return Response.json(fallback);
    if ('picks' in parsed && input.kind === 'yearbook') {
      const picks = [...new Set(parsed.picks)].filter(pick => pick > 0 && pick <= input.facts.length).slice(0, 3);
      if (!picks.length) return Response.json(fallback);
      parsed = { picks };
    }
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    console.info('[year-strategy]', { traceId, kind: input.kind, inputHash: hash(input), outputHash: hash(parsed), tokens, millis: Date.now() - now });
    return Response.json({ ...parsed, basis: input.basis, source: 'model', traceId });
  } catch (error) {
    console.info('[year-strategy]', { traceId, kind: input.kind, source: 'rule', type: error instanceof Error ? error.name : 'error' });
    return Response.json(fallback);
  }
  finally { inFlight--; }
}
