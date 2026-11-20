import type { World } from '../model';
import { candidates } from '../engine/actors';
import { digest } from './digest';

export function directorInput(world: World) {
  return {
    yearId: world.yearId, revision: world.revision, basisDigest: digest(world), window: world.window,
    options: candidates(world).map(({ id, actorId, label, basis }) => ({
      id, actorId, name: world.people[actorId].name, goal: world.people[actorId].goal, label, basis,
    })),
  };
}
