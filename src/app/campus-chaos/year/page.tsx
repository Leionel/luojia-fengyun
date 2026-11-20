import type { Metadata } from 'next';
import { liveYearAvailable } from '../../../server/year/provider';
import { YearShell } from '../../../ui/year/YearShell';
import { scenarioIds, type ScenarioId } from '../../../year/model';
import './year.css';
import './explore.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: '珞珈社团风云 · 完整学年',
  description: '从九月抢展位，到六月交钥匙。',
};

export default async function AcademicYear({ searchParams }: { searchParams: Promise<{ mode?: string; seed?: string; scenario?: string }> }) {
  const { mode, seed, scenario } = await searchParams;
  const initialScenario = scenarioIds.find(id => id === scenario) as ScenarioId | undefined;
  return <YearShell liveAvailable={liveYearAvailable()} initiallyLive={mode !== 'demo'}
    initialScenario={initialScenario ?? 'struggling'}
    seed={typeof seed === 'string' && /^[a-zA-Z0-9-]{1,32}$/.test(seed) ? seed : 'fair-01'} />;
}
