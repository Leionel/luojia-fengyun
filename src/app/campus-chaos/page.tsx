import { CampusGame } from '../../ui/CampusGame';
import { directorMode } from '../../server/director';

export const dynamic = 'force-dynamic';

export default async function CampusPage({ searchParams }: { searchParams: Promise<{ seed?: string; scenario?: string; mode?: string }> }) {
  const { seed, scenario, mode } = await searchParams;
  const validSeed = typeof seed === 'string' && /^[a-zA-Z0-9-]{1,48}$/.test(seed) ? seed : 'sakura-01';
  const liveAvailable = directorMode() === 'live_ai';
  return <CampusGame startingMode={mode === 'demo' || !liveAvailable ? 'demo' : 'live_ai'} liveAvailable={liveAvailable}
    startingSeed={validSeed} startingScenario={scenario === 'rain' ? 'rain' : 'spring'}
    allowResume={seed === undefined && scenario === undefined && mode === undefined} />;
}
