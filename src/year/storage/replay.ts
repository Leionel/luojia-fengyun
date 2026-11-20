import { z } from 'zod';
import { commandSchema, key, originSchema } from '../commands';
import { contentVersion, rulesVersion, type CampaignOrigin, type Receipt, type World } from '../model';
import { newWorld } from '../content/scenarios';
import { execute, makeCommand } from '../engine/reducer';
import { digest } from '../view/digest';

export type Mode = 'demo' | 'live';
export type Archive = { world: World; mode: Mode; receipts: Receipt[]; recovered?: boolean };
export const genesis = (world: World) => world.campaign?.enabledAt ? undefined : world.campaign?.origin;
const envelope = z.strictObject({
  rules: z.literal(rulesVersion), content: z.literal(contentVersion), yearId: key, seed: key,
  origin: originSchema.optional(),
  mode: z.enum(['demo', 'live']), trail: z.array(z.strictObject({
    command: commandSchema, digest: z.string().regex(/^[a-f0-9]{8}$/),
  })).max(500), head: z.string().regex(/^[a-f0-9]{8}$/),
});

export function replay(yearId: string, seed: string, trail: {command: Receipt['command']; digest: string}[], origin?: CampaignOrigin) {
  let world = newWorld(yearId, seed, origin);
  const receipts: Receipt[] = [];
  const ids = new Set<string>();
  for (const entry of trail) {
    if (ids.has(entry.command.id)) throw new Error('存档含有重复的操作收据');
    const result = execute(world, entry.command);
    if (!result.ok || result.receipt.digest !== entry.digest) throw new Error('存档记录无法复现');
    receipts.push(result.receipt);
    world = result.world;
    ids.add(entry.command.id);
  }
  return { world, receipts };
}

export function encode(archive: Archive) {
  return JSON.stringify({
    rules: rulesVersion, content: contentVersion, yearId: archive.world.yearId, seed: archive.world.seed, mode: archive.mode,
    origin: genesis(archive.world),
    trail: archive.receipts.map(({command, digest: resultDigest}) => ({command, digest: resultDigest})), head: digest(archive.world),
  }, null, 2);
}

export function decode(input: string): Archive {
  if (input.length > 2_000_000) throw new Error('存档体积超过可读上限');
  let raw: unknown;
  try { raw = JSON.parse(input); }
  catch { throw new Error('无法读取 JSON 格式，请选用游戏导出的文件'); }
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) throw new Error('存档格式或规则版本不匹配');
  const item = parsed.data;
  const result = replay(item.yearId, item.seed, item.trail, item.origin);
  if (digest(result.world) !== item.head) throw new Error('存档摘要不匹配');
  return { ...result, mode: item.mode };
}

export function copyArchive(original: Archive, yearId: string): Archive {
  let world = newWorld(yearId, original.world.seed, genesis(original.world));
  const receipts: Receipt[] = [];
  for (const receipt of original.receipts) {
    const command = makeCommand(world, receipt.command.id, receipt.command.action);
    const result = execute(world, command);
    if (!result.ok) throw new Error('无法重建年度档案副本');
    receipts.push(result.receipt);
    world = result.world;
  }
  return { world, receipts, mode: original.mode };
}
