import { directorMode } from '../../../server/director';

export function GET() {
  return Response.json({ ok: true, mode: directorMode() }, { headers: { 'Cache-Control': 'no-store' } });
}
