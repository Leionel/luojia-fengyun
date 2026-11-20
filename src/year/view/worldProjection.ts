import { windowAt } from '../calendar';
import { places } from '../content/clubs';
import type { PlaceId, World } from '../model';

export function worldProjection(world: World) {
  const rain = world.window === 16;
  const season = world.window <= 8 ? '秋' : world.window <= 12 ? '冬' : world.window <= 20 ? '春' : '夏';
  const art = rain ? 'sakura-rain' : world.window === 21 ? 'sakura-festival' : {
    秋: 'year-autumn', 冬: 'year-winter', 春: 'sakura-courtyard', 夏: 'year-summer',
  }[season];
  const actors = Object.values(world.people).filter(p => p.status !== 'incoming');
  return {
    art, season,
    places: (Object.keys(places) as PlaceId[]).map(id => ({
      id, ...places[id],
      people: actors.filter(person => person.location === id),
      projects: Object.values(world.projects).filter(project => project.place === id && (
        project.stage === 'scheduled' || project.dueWindow === world.window - 1)),
    })),
    date: windowAt(world.window),
  };
}
