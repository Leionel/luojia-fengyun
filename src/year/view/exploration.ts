import { places } from '../content/clubs';
import type { PlaceId, World } from '../model';

export type Point = { x: number; y: number };
export type Interior = Exclude<PlaceId, 'plaza'>;
export const start: Point = { x: 51, y: 77 };
export const entrances: Record<Interior, Point> = {
  stage: { x: 50, y: 37 }, workshop: { x: 83, y: 53 },
  library: { x: 17, y: 52 }, room: { x: 52, y: 87 },
};
export const interiorSpawn: Point = { x: 52, y: 79 };
export const exitPoint: Point = { x: 52, y: 89 };
export const fieldPickup: Point = { x: 25, y: 57 };
export const routePickup: Point = { x: 72, y: 64 };
export const fieldBoards: Record<PlaceId, Point> = {
  plaza: { x: 63, y: 59 }, stage: { x: 26, y: 53 }, workshop: { x: 29, y: 48 },
  room: { x: 31, y: 53 }, library: { x: 28, y: 55 },
};
export const fieldFinish: Point = { x: 73, y: 60 };
export const deskPoints: Record<Interior, Point> = {
  room: { x: 69, y: 48 }, library: { x: 65, y: 48 }, stage: { x: 50, y: 44 }, workshop: { x: 67, y: 53 },
};
export const interiorArt: Record<Interior, string> = { room: 'walk-room', library: 'walk-library', stage: 'walk-stage', workshop: 'walk-workshop' };

const decisionAreas: Partial<Record<number, PlaceId>> = {
  5: 'library', 6: 'stage', 9: 'library', 10: 'room', 12: 'room', 14: 'workshop',
  15: 'workshop', 17: 'stage', 22: 'room', 23: 'room', 24: 'room',
};

export function decisionArea(world: World): PlaceId {
  if (world.window === 7 || world.window === 8) return world.projects['player-nov']?.place ?? 'plaza';
  if (world.window === 19 || world.window === 21) return (world.projects['player-may'] ?? world.projects['player-exhibit'])?.place ?? 'plaza';
  return decisionAreas[world.window] ?? 'plaza';
}

export function fairPreparation(project: World['projects'][string], approach: 'poster' | 'entrance') {
  const signups = project.signups + (approach === 'poster' ? 6 : 0);
  const capacity = Math.min(places[project.place].guests, project.capacity + (approach === 'entrance' ? 6 : 0));
  const admitted = Math.min(signups, capacity);
  return { signups, capacity, admitted, waitlist: signups - admitted };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, (b.y - a.y) * 9 / 16);
}

export function walkable(point: Point, place: PlaceId): Point {
  const margin = place === 'plaza' ? 11 : 13;
  const front = place === 'plaza' ? 34 : 39;
  const max = place === 'plaza' || point.x >= 41 && point.x <= 62 ? 90 : 82;
  return {
    x: Math.max(margin, Math.min(100 - margin, point.x)),
    y: Math.max(front, Math.min(max, point.y)),
  };
}

export function toward(point: Point, destination: Point, time: number, place: PlaceId) {
  const range = distance(point, destination);
  if (!range) return point;
  const ratio = Math.min(1, time * 22 / range);
  return walkable({ x: point.x + (destination.x - point.x) * ratio, y: point.y + (destination.y - point.y) * ratio }, place);
}

export function fieldJobs(world: World) {
  if (!world.campaign || world.ended) return [];
  return Object.values(world.projects)
    .filter(project => project.lead === 'player' && project.stage === 'scheduled' && project.dueWindow >= world.window &&
      project.dueWindow <= world.window + 2 && !world.facts[`field:${project.id}`])
    .sort((a, b) => a.dueWindow - b.dueWindow)
    .map(project => ({
      project, place: project.place,
      location: places[project.place].label,
      kind: project.id === 'fair-show' ? 'poster' as const : 'setup' as const,
    }));
}
