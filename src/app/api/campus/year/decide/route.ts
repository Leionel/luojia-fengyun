import { directorRequestSchema } from '../../../../../year/commands';
import { decide } from '../../../../../server/year/planner';

export async function POST(request: Request) {
  if (!request.body || Number(request.headers.get('Content-Length')) > 12000) {
    return Response.json({ error: '请求缺失或过大' }, { status: 413 });
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 12000) {
        await reader.cancel();
        return Response.json({ error: '请求过大' }, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    const input = directorRequestSchema.safeParse(JSON.parse(text + decoder.decode()));
    if (!input.success) return Response.json({ error: '年度导演请求不合法' }, { status: 400 });
    return Response.json(await decide(input.data));
  } catch {
    return Response.json({ error: '无法读取年度导演请求' }, { status: 400 });
  } finally { reader.releaseLock(); }
}
