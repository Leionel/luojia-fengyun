import type { ActorId, ClubId, Command, Relationship, Reservation, World, WorldEvent } from '../model';
import { places } from '../content/clubs';
import { dateAt } from '../calendar';
import { reservationIssue } from './reservations';

export class Transaction {
  readonly world: World;
  readonly events: WorldEvent[] = [];

  constructor(readonly base: World, readonly command: Command) {
    this.world = structuredClone(base);
  }

  record(type: string, title: string, detail: string, options: {
    source?: WorldEvent['source']; causes?: (string | undefined)[]; actorId?: ActorId; traceId?: string; key?: string;
  } = {}) {
    const event: WorldEvent = {
      id: `${this.command.id}:${this.events.length + 1}`, seq: ++this.world.cursor, commandId: this.command.id,
      window: this.world.window, type, title, detail, source: options.source ?? 'rule',
      causes: [...new Set(options.causes?.filter((value): value is string => Boolean(value)) ?? [])],
      actorId: options.actorId, traceId: options.traceId,
      beforeRevision: this.base.revision, afterRevision: this.base.revision + 1,
    };
    this.events.push(event);
    if (options.key) this.world.facts[options.key] = event.id;
    return event.id;
  }

  pay(from: ClubId, cents: number, explanation: string, cause?: string, to?: ClubId) {
    const account = this.world.clubs[from];
    if (!Number.isSafeInteger(cents) || cents < 0 || account.cash - account.held < cents) throw new Error('可用经费不足');
    account.cash -= cents;
    if (to) this.world.clubs[to].cash += cents;
    this.record('cash', '社团账本更新', `${account.label}支出 ¥${cents / 100}${to ? `，${this.world.clubs[to].label}收款` : ''} · ${explanation}`, { causes: [cause] });
  }

  book(claims: Reservation[], cause?: string) {
    const issue = reservationIssue(this.world, claims);
    if (issue) throw new Error(issue);
    for (const claim of claims) this.world.reservations[claim.id] = claim;
    const assets: Record<string, string> = { tables: '折叠桌', camera: '相机', speakers: '音箱', canopy: '雨棚' };
    const labels = claims.map(({ resourceId, from, to }) => {
      const [kind, id] = resourceId.split(':');
      const name = kind === 'person' ? this.world.people[id as ActorId].name :
        kind === 'venue' ? places[id as keyof typeof places].label : assets[id];
      return `${name} ${dateAt(from)}–${dateAt(to)}`;
    });
    this.record('reservation', '预约已锁定', labels.join(' · '), { causes: [cause] });
  }

  relate(from: string, to: string, changes: Partial<Pick<Relationship, 'trust' | 'alignment' | 'bond'>>, cause?: string, conflict?: string) {
    const key = `${from}>${to}`;
    const tie = this.world.relationships[key] ?? { from, to, trust: 20, alignment: 0, bond: 0, conflicts: [] };
    const limit = (value: number, floor = -100) => Math.min(100, Math.max(floor, value));
    const updated = {
      ...tie, trust: limit(tie.trust + (changes.trust ?? 0)), alignment: limit(tie.alignment + (changes.alignment ?? 0)),
      bond: limit(tie.bond + (changes.bond ?? 0), 0), conflicts: conflict ? [...new Set([...tie.conflicts, conflict])] : tie.conflicts,
    };
    this.world.relationships[key] = updated;
    const name = (id: string) => this.world.clubs[id as ClubId]?.label ?? this.world.people[id as ActorId]?.name ?? id;
    this.record('relationship', '关系出现变化', `${name(from)} → ${name(to)} · 信任 ${tie.trust} → ${updated.trust} · 目标一致 ${tie.alignment} → ${updated.alignment} · 纽带 ${tie.bond} → ${updated.bond}`, { causes: [cause] });
  }
}
