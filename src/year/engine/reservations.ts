import { windowAt } from '../calendar';
import type { ActorId, Reservation, World } from '../model';

const assets: Record<string, number> = {
  'venue:plaza': 1, 'venue:stage': 1, 'venue:workshop': 1, 'venue:library': 1, 'venue:room': 1,
  'gear:camera': 2, 'gear:speakers': 1, 'gear:tables': 2, 'gear:canopy': 1,
};
const graduationPeriod = (window: number) => window >= 9 && window <= 11;

export function availability(world: World, actorId: ActorId, window = world.window) {
  const person = world.people[actorId];
  if (person.status !== 'active') return 0;
  return actorId === 'aning' && graduationPeriod(window) ? 4 : person.weeklyUnits;
}

export function reservationIssue(world: World, claims: Reservation[]) {
  const active = Object.values(world.reservations).filter(r => r.status === 'confirmed');
  for (const claim of claims) {
    const { resourceId: resource, from, to, units } = claim;
    const actorId = resource.startsWith('person:') ? resource.slice(7) as ActorId : undefined;
    const limit = actorId && world.people[actorId] ? 1 : assets[resource];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > windowAt(24).to ||
        !Number.isInteger(units) || !limit || units < 1 || units > limit || world.reservations[claim.id] ||
        active.some(reservation => reservation.id === claim.id)) return '预约范围、数量或编号无效';
    const any = active.filter(r => r.resourceId === resource && r.from < to && from < r.to);
    for (const tick of [from, ...any.map(r => r.from).filter(start => start > from)]) {
      if (any.reduce((sum, r) => sum + (r.from <= tick && tick < r.to ? r.units : 0), units) > limit) return '这个时段已经没有余量';
    }
    if (actorId) {
      const weekSize = 48 * 7;
      for (let week = Math.floor(from / weekSize); week <= Math.floor((to - 1) / weekSize); week++) {
        const start = week * weekSize;
        const end = start + weekSize;
        const rulesWindow = Math.max(1, Math.min(24, Array.from({ length: 24 }, (_, i) => windowAt(i + 1)).findLast(w => w.from <= Math.max(start, from))!.number));
        const hours = [...active, claim].filter(r => r.resourceId === resource).reduce((sum, r) =>
          sum + Math.max(0, Math.min(end, r.to) - Math.max(start, r.from)), 0);
        if (hours > availability(world, actorId, rulesWindow)) return '成员这周没有足够工时';
      }
    }
    active.push(claim);
  }
  return null;
}
