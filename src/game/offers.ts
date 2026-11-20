import { offerIds, type ActionId, type DirectorSnapshot, type Effect, type NpcId, type OfferId } from './model';

type Offer = { npc: NpcId; action: ActionId; label: string; effect: Effect; eligible?: (s: DirectorSnapshot) => boolean };

export const offers: Record<OfferId, Offer> = {
  RADIO_PUSH: {
    npc: 'promotion', action: 'PRINT_POSTERS', label: '广播站加推',
    effect: { signups: 5, readiness: -3 },
  },
  TIMED_ENTRY: {
    npc: 'promotion', action: 'REHEARSE', label: '分时入场',
    effect: { capacity: 5, signups: -2 },
    eligible: s => s.stats.budget >= 40 && (s.stats.signups >= 12 || s.mood.promotion >= 58),
  },
  REUSE_SUPPLIES: {
    npc: 'finance', action: 'BUILD_BOOTH', label: '回收旧物料',
    effect: { budget: 35, readiness: -5 },
  },
  ROUTE_DRILL: {
    npc: 'finance', action: 'REHEARSE', label: '加测两条动线',
    effect: { capacity: 5, budget: -10 },
    eligible: s => s.stats.budget >= 50 && s.mood.finance >= 42,
  },
  VOLUNTEER_SHIFT: {
    npc: 'external', action: 'CLUB_ALLIANCE', label: '借一班志愿者',
    effect: { capacity: 5, cohesion: -3 },
  },
  SHARED_BOOTH: {
    npc: 'external', action: 'BUILD_BOOTH', label: '合搭第二条入口',
    effect: { capacity: 6, budget: -15 },
    eligible: s => s.stats.budget >= 95 && s.mood.external >= 46,
  },
};

export function eligibleOffers(snapshot: DirectorSnapshot, npc: NpcId) {
  return offerIds.filter(id => {
    const offer = offers[id];
    return offer.npc === npc && (offer.eligible?.(snapshot) ?? true);
  });
}
