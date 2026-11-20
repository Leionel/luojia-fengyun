export const rulesVersion = '3-ab.1';
export const contentVersion = '2026-ab.1';
export const chapterIds = ['fair', 'debut', 'exams', 'spring', 'festival', 'handover'] as const;
export type Chapter = typeof chapterIds[number];
export type ClubId = 'player' | 'photo' | 'music' | 'tech' | 'book';
export type ActorId = 'anan' | 'xiaoyu' | 'jiangyi' | 'aning' | 'chenlan' | 'hemu' | 'linqi' | 'dushu' | 'qiutong' | 'wuyuan';
export type PlaceId = 'plaza' | 'stage' | 'workshop' | 'library' | 'room';
export type Provenance = 'player' | 'rule' | 'model';
export type SlotRange = { from: number; to: number };
export type Work = 'outreach' | 'study' | 'practice' | 'scout' | 'posters' | 'catalog' | 'joint-desk' | 'rest';
export type Club = { id: ClubId; label: string; goal: string; cash: number; held: number; reputation: number; plan: string };
export type Person = {
  id: ActorId; club: ClubId; name: string; role: string; goal: string; weeklyUnits: number;
  energy: number; experience: number; status: 'active' | 'leave' | 'incoming';
  location: PlaceId; activity: string;
};
export type Relationship = { from: string; to: string; trust: number; alignment: number; bond: number; conflicts: string[] };
export type Reservation = SlotRange & {
  id: string; resourceId: string; owner: ClubId; projectId: string; units: number;
  status: 'confirmed' | 'released';
};
export type Grant = { actorId: ActorId; work: 'posters'; maxCents: number; spent: number; expiresWindow: number };
export type Application = { id: string; actorId: ActorId; work: 'posters'; cents: number; window: number; status: 'pending' | 'approved' | 'declined' | 'expired' };
export type Project = {
  id: string; name: string; lead: ClubId; partners: ClubId[]; place: PlaceId; owner: ActorId;
  stage: 'scheduled' | 'complete' | 'postponed'; capacity: number; signups: number; attendance: number;
  dueWindow: number; heldCents: number; evidence: string[]; quality?: number;
};
export type Commitment = {
  id: string; projectId: string; kind: 'joint' | 'loan' | 'aid'; debtor: ClubId; beneficiary: ClubId;
  dueWindow: number; status: 'active' | 'fulfilled' | 'overdue'; origin: string;
};
export const scenarioIds = ['struggling', 'legacy', 'tech', 'culture'] as const;
export type ScenarioId = typeof scenarioIds[number];
export type Skill = 'operations' | 'mediation' | 'finance';
export type DealTerms = {
  kind: 'show' | 'gear' | 'workshop' | 'publicity';
  club: Exclude<ClubId, 'player'>; place: PlaceId; owner: ActorId; window: number;
  fee: number; share: number; credit: boolean; units: number;
};
export type Deal = {
  id: string; version: number; terms: DealTerms; state: 'quoted' | 'signed' | 'refused' | 'fulfilled' | 'defaulted' | 'expired';
  outcome: 'accepted' | 'counter'; offeredAt: number; expires: number; origin: string;
  held: number; prepared?: string; completed?: string; updated?: string;
};
export type Growth = { mentor: ActorId; pupil: ActorId; skill: Skill; window: number; origin: string; performed?: string; reviewed?: string };
export type YearRoute = '校园联盟型' | '明星社团' | '精英成果型' | '温暖共同体型';
export type Carry = { season: number; parent: string; balance: number; steward: ActorId | 'rotation' | 'trusteeship';
  skills: Partial<Record<ActorId, Skill[]>>; ties: Record<string, Relationship>; debts: { club: Exclude<ClubId, 'player'>; cents: number; title: string }[] };
export type CampaignOrigin = { scenario: ScenarioId; carry?: Carry };
export type Campaign = {
  origin: CampaignOrigin; deals: Record<string, Deal>; trainings: Record<string, Growth>; skills: Partial<Record<ActorId, Skill[]>>;
  enabledAt?: number;
  queue?: { amount: number; origin: string; due: number; stage: 'open' | 'diverted' | 'unresolved'; resolved: number; refunded: number };
  playerVote?: ActorId | 'rotation';
  ballot?: { voter: ActorId | 'player'; vote: ActorId | 'rotation'; reason: string; causes: string[] }[];
  debts: Carry['debts'];
  routes?: { name: YearRoute; score: number; met: boolean; evidence: string[] }[];
};
export type World = {
  yearId: string; seed: string; revision: number; cursor: number; window: number; ended: boolean;
  clubs: Record<ClubId, Club>; people: Record<ActorId, Person>; relationships: Record<string, Relationship>;
  reservations: Record<string, Reservation>; projects: Record<string, Project>;
  commitments: Record<string, Commitment>; grants: Partial<Record<ActorId, Grant>>; applications: Record<string, Application>;
  choices: Record<string, string>; facts: Record<string, string>;
  campaign?: Campaign;
  ending?: { steward: ActorId | 'rotation' | 'trusteeship'; resolution: string; retainedCents: number; activeCommitments: string[]; sources: string[] };
};
export type Intent = { id: string; actorId: ActorId; work: Work; location: PlaceId; label: string; basis: string; causeIds: string[] };
export type Selection = { intentIds: string[]; traceId: string };
export type Action =
  | { kind: 'choose'; decisionId: string; optionId: string }
  | { kind: 'grant'; actorId: ActorId; enabled: boolean }
  | { kind: 'application'; id: string; accept: boolean }
  | { kind: 'quote'; terms: DealTerms[]; reply?: { styles: ('keep' | 'credit' | 'reduce')[]; traceId: string } }
  | { kind: 'respond'; deals: { id: string; version: number }[]; accept: boolean }
  | { kind: 'counter'; id: string; version: number; terms: DealTerms }
  | { kind: 'amend'; id: string; version: number; operation: 'reassign' | 'reschedule' | 'resize' | 'cancel'; owner?: ActorId }
  | { kind: 'train'; mentor: ActorId; pupil: ActorId; skill: Skill }
  | { kind: 'review'; id: string }
  | { kind: 'queue'; method: 'expand' | 'stagger' | 'small' }
  | { kind: 'debt'; index: number }
  | { kind: 'vote'; nominee: ActorId | 'rotation' }
  | { kind: 'enable-campaign' }
  | { kind: 'fieldwork'; projectId: string; approach?: 'entrance' }
  | { kind: 'advance'; selection?: Selection; fallback?: boolean };
export type Command = { id: string; yearId: string; expectedRevision: number; basisDigest: string; action: Action };
export type WorldEvent = {
  id: string; seq: number; commandId: string; window: number; title: string; detail: string; type: string;
  source: Provenance; causes: string[]; actorId?: ActorId; traceId?: string;
  beforeRevision: number; afterRevision: number;
};
export type Receipt = { command: Command; events: WorldEvent[]; digest: string };
export type TurnResult = { ok: true; world: World; receipt: Receipt } | { ok: false; message: string };
