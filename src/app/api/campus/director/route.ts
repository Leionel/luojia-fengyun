import { requestSchema } from '../../../../game/contracts';
import { runDirector } from '../../../../server/director';

export async function POST(request: Request) {
  if (Number(request.headers.get('Content-Length')) > 8192) {
    return Response.json({ error: '局面数据过长' }, { status: 413 });
  }
  try {
    const content = await request.text();
    if (content.length > 8192) return Response.json({ error: '局面数据过长' }, { status: 413 });
    const result = requestSchema.safeParse(JSON.parse(content));
    if (!result.success) return Response.json({ error: '局面数据无效' }, { status: 400 });
    return Response.json(await runDirector(result.data));
  } catch {
    return Response.json({ error: '无法读取局面' }, { status: 400 });
  }
}
