export const actions = [
  'PRINT_POSTERS', 'BUILD_BOOTH', 'REHEARSE', 'CLUB_ALLIANCE', 'SEEK_SPONSOR', 'RESOLVE_CONFLICT',
] as const;
export type ActionId = typeof actions[number];
export type NpcId = 'promotion' | 'finance' | 'external';
export type Mode = 'demo' | 'live_ai' | 'fallback';
export type RunMode = Exclude<Mode, 'fallback'>;
export const scenarioIds = ['spring', 'rain'] as const;
export type ScenarioId = typeof scenarioIds[number];

export const eventIds = [
  'POSTER_BACKLASH', 'FREE_VENUE_OFFER', 'TEAM_DISPUTE', 'SPONSOR_OBLIGATION',
  'VIRAL_MOMENT', 'BUDGET_ALERT', 'FINAL_CHECK', 'GEAR_CHECK', 'QUEUE_SURGE', 'RAIN_WARNING', 'QUIET_TURN',
] as const;
export type EventId = typeof eventIds[number];
export const offerIds = ['RADIO_PUSH', 'TIMED_ENTRY', 'REUSE_SUPPLIES', 'ROUTE_DRILL', 'VOLUNTEER_SHIFT', 'SHARED_BOOTH'] as const;
export type OfferId = typeof offerIds[number];
export type Flag = 'sponsor' | 'venue' | 'posterFatigue' | 'alliance';
export type Stats = {
  budget: number;
  signups: number;
  capacity: number;
  readiness: number;
  cohesion: number;
  reputation: number;
};

export const npcs = {
  promotion: { name: '阿南', role: '宣传部长', trait: '想把大家都拉来，报名低时会要求追加宣传。', color: 'rose' },
  finance: { name: '小予', role: '财务部长', trait: '盯着支出和物料，花钱太快时会叫停检查。', color: 'green' },
  external: { name: '江一', role: '外联部长', trait: '擅长交换资源，优先争取合作与赞助。', color: 'purple' },
} as const;
export const npcIds = Object.keys(npcs) as NpcId[];
export const maxTurns = 5;
export const opening = {
  title: '第一笔钱，怎么花？',
  line: '阿南想花 180 元做物料，小予只肯批 80 元。江一提议找个社团合作，用场地和人手换宣传。',
};

export type Effect = Partial<Stats>;
export type Proposal = { eventId: EventId; offerId: OfferId | null; line: string; reason: string };
export type Incident = Proposal & { mode: Mode; requestId: string; responded?: boolean };
export type LogEntry = {
  turn: number;
  kind: 'action' | 'director' | 'response';
  label: string;
  delta?: Effect;
  action?: ActionId;
  offerUsed?: OfferId;
  choice?: 0 | 1;
  event?: EventId;
  incident?: Incident;
};
export type GameState = {
  sessionId: string;
  seed: string;
  scenario: ScenarioId;
  version: number;
  turn: number;
  phase: 'ready' | 'directing' | 'finished';
  stats: Stats;
  flags: Flag[];
  mood: Record<NpcId, number>;
  counts: Partial<Record<ActionId, number>>;
  incident?: Incident;
  lastAction?: ActionId;
  history: LogEntry[];
};

export type DirectorSnapshot = Pick<GameState, 'seed' | 'scenario' | 'turn' | 'stats' | 'flags' | 'mood' | 'counts'> & {
  lastAction: ActionId;
  previousEvents: EventId[];
};
export type DirectorRequest = {
  sessionId: string;
  stateVersion: number;
  requestId: string;
  snapshot: DirectorSnapshot;
};
export type DirectorResponse = {
  sessionId: string;
  stateVersion: number;
  requestId: string;
  proposal: Proposal;
  mode: Mode;
};
