import { describe, expect, it } from 'vitest';
import { currentDecision } from '../content/chapters';
import { newWorld } from '../content/scenarios';
import { draftFromText } from '../content/strategy';
import { scenarioIds, type Action, type CampaignOrigin, type DealTerms, type World } from '../model';
import { copyArchive, decode, encode, type Archive } from '../storage/replay';
import { digest } from '../view/digest';
import { worldProjection } from '../view/worldProjection';
import { execute, makeCommand } from './reducer';
import { buildYearbook, nextOrigin, routeScores } from './succession';

const origin: CampaignOrigin = { scenario: 'struggling' };
const terms: DealTerms = { kind: 'show', club: 'music', place: 'stage', owner: 'jiangyi', window: 6,
  fee: 2000, share: 10, credit: false, units: 4 };

function session(seed = 'fair-01', initial: CampaignOrigin = origin) {
  const archive: Archive = { world: newWorld('campaign', seed, initial), receipts: [], mode: 'demo' };
  function act(action: Action) {
    const { world, receipts } = archive;
    const result = execute(world, makeCommand(world, `cmd-${world.revision}`, action));
    if (!result.ok) throw new Error(`W${world.window} ${action.kind} · ${result.message}`);
    archive.world = result.world;
    receipts.push(result.receipt);
  }
  function step(choice?: string) {
    const world = archive.world;
    const decision = currentDecision(world);
    if (decision) {
      const preferred = decision.options.find(item => item.id === choice);
      const legal = [...new Set([preferred, ...decision.options])].find(option => option &&
        execute(world, makeCommand(world, 'test-preview', { kind: 'choose', decisionId: decision.id, optionId: option.id })).ok);
      if (!legal) throw new Error(`W${world.window} no legal choice`);
      act({ kind: 'choose', decisionId: decision.id, optionId: legal.id });
    }
    for (const item of Object.values(archive.world.applications)) if (item.window === world.window && item.status === 'pending') {
      act({ kind: 'application', id: item.id, accept: false });
    }
    act({ kind: 'advance' });
  }
  function until(window: number) {
    while (archive.world.window < window && !archive.world.ended) step();
  }
  return { archive, act, step, until };
}

describe('C and D campaign', () => {
  it('parses plans into editable groups and leaves unstated terms for the player', () => {
    const drafts = draftFromText('和音乐社在第6窗口湖畔舞台联演，江一负责，2小时，预算¥20，对方分成10%，独立署名；和旧书社借相机', 1);
    expect(drafts).toEqual([terms, { kind: 'gear', club: 'book' }]);
    expect(draftFromText('拉技术社五月做工坊', 1)[0]).toMatchObject({ club: 'tech', window: 21 });
  });

  it('prices a counteroffer without charging, accepts only selected terms, and settles the signed project once', () => {
    const { archive, act, until, step } = session();
    const before = digest(archive.world);
    const preview = execute(archive.world, makeCommand(archive.world, 'quote-preview', { kind: 'quote', terms: [terms] }));
    expect(preview.ok).toBe(true);
    expect(digest(archive.world)).toBe(before);
    act({ kind: 'quote', terms: [terms, { ...terms, club: 'tech', owner: 'aning', kind: 'workshop' }], reply: {
      traceId: 'test-model', styles: ['credit', 'keep'],
    } });
    expect(archive.world.clubs.player.held).toBe(0);
    const [music, tech] = Object.values(archive.world.campaign!.deals);
    expect(music).toMatchObject({ outcome: 'counter', terms: { credit: true, share: 30 } });
    expect(archive.receipts[0].events[0]).toMatchObject({ traceId: 'test-model', source: 'model' });
    act({ kind: 'counter', id: music.id, version: 1, terms: { ...music.terms, fee: 4000 } });
    const stale = execute(archive.world, makeCommand(archive.world, 'old-quote', { kind: 'respond',
      deals: [{ id: music.id, version: 1 }], accept: true }));
    expect(stale.ok).toBe(false);
    const multi = execute(archive.world, makeCommand(archive.world, 'overlap', { kind: 'respond',
      deals: [{ id: music.id, version: 2 }, { id: tech.id, version: 1 }], accept: true }));
    expect(multi.ok).toBe(false);
    expect(archive.world.clubs.player.held).toBe(0);
    act({ kind: 'respond', deals: [{ id: music.id, version: 2 }], accept: true });
    expect(archive.world.campaign!.deals[tech.id].state).toBe('quoted');
    expect(archive.world.clubs.player.held).toBe(4000);
    until(6);
    const rivalBefore = archive.world.clubs.music.cash;
    step('room-show');
    const outcome = archive.world.campaign!.deals[music.id];
    expect(outcome).toMatchObject({ state: 'fulfilled', held: 0, prepared: expect.any(String) });
    expect(archive.world.clubs.music.cash - rivalBefore).toBe(7600);
    expect(decode(encode(archive))).toEqual(archive);
  });

  it('supports reassigning, shrinking, postponing, and carrying an actual unpaid cancellation fee', () => {
    const { archive, act, until, step } = session();
    act({ kind: 'quote', terms: [{ ...terms, fee: 4000 }] });
    const deal = Object.values(archive.world.campaign!.deals)[0];
    act({ kind: 'respond', accept: true, deals: [{ id: deal.id, version: 1 }] });
    act({ kind: 'amend', id: deal.id, version: 2, operation: 'reassign', owner: 'xiaoyu' });
    act({ kind: 'amend', id: deal.id, version: 3, operation: 'resize' });
    act({ kind: 'amend', id: deal.id, version: 4, operation: 'reschedule' });
    expect(archive.world.campaign!.deals[deal.id]).toMatchObject({ terms: { window: 7, owner: 'xiaoyu', units: 2, fee: 3000 } });
    until(7);
    act({ kind: 'amend', id: deal.id, version: 5, operation: 'cancel' });
    expect(archive.world.campaign!.deals[deal.id].state).toBe('defaulted');
    expect(archive.world.campaign!.debts).toMatchObject([{ club: 'music', cents: 375 }]);
    while (!archive.world.ended) step(archive.world.window === 22 ? 'rotate' : undefined);
    const second = nextOrigin(archive.world)!;
    const fresh = newWorld('next', 'fair-01', second);
    expect(fresh.campaign?.origin.carry).toMatchObject({ season: 2, parent: 'campaign', steward: 'rotation' });
    expect(fresh.clubs.player.cash).toBe(archive.world.clubs.player.cash);
    expect(fresh.campaign?.debts).toMatchObject([{ club: 'music', cents: 375 }]);
    expect(fresh.reservations).toEqual({});
  });

  it('certifies two separately performed and reviewed practices and unlocks three-club negotiation', () => {
    const { archive, act, step } = session();
    const practice = { kind: 'train', mentor: 'jiangyi', pupil: 'xiaoyu', skill: 'mediation' } as const;
    const groups = [terms, { ...terms, club: 'book' as const }, { ...terms, club: 'tech' as const }];
    const blocked = execute(archive.world, makeCommand(archive.world, 'no-mediation', { kind: 'quote', terms: groups }));
    expect(blocked.ok).toBe(false);
    for (const n of [1, 2]) {
      act(practice);
      step();
      const id = `learn:xiaoyu:mediation:${n}`;
      act({ kind: 'review', id });
      const duplicate = execute(archive.world, makeCommand(archive.world, 'twice', { kind: 'review', id }));
      expect(duplicate.ok).toBe(false);
    }
    expect(archive.world.campaign!.skills.xiaoyu).toEqual(['mediation']);
    act({ kind: 'quote', terms: groups });
    expect(Object.values(archive.world.campaign!.deals)).toHaveLength(3);
  });

  it('drives the same overflow to queue diversion or an actual exam-period dispute', () => {
    const relief = session('fair-01', { scenario: 'legacy' });
    const pressure = session('fair-01', { scenario: 'legacy' });
    relief.step(); pressure.step();
    expect(relief.archive.world.campaign?.queue?.amount).toBe(23);
    relief.act({ kind: 'queue', method: 'stagger' });
    expect(relief.archive.world.campaign!.queue).toMatchObject({ stage: 'diverted', resolved: 13, refunded: 10 });
    expect(relief.archive.world.clubs.player.cash).toBe(78200);
    pressure.until(5);
    expect(pressure.archive.world.campaign!.queue?.stage).toBe('unresolved');
    expect(pressure.archive.world.facts.queuePressure).toBeDefined();
  });

  it('awards all four qualifications and a mixed yearbook only from completed evidence', () => {
    const { archive } = session();
    const w = archive.world;
    const base = { lead: 'player', window: 21, stage: 'complete', signups: 52, attendance: 52,
      dueWindow: 21, capacity: 60, heldCents: 0, evidence: ['proof'], owner: 'aning', quality: 85 } as const;
    for (const [id, place, partners] of [['show1', 'stage', ['photo', 'music']], ['show2','plaza', []],
      ['work1','workshop', []], ['work2','workshop', []]] as const) {
      w.projects[id] = { ...base, id, name: id, place, partners: [...partners], evidence: ['proof'] };
    }
    w.facts['peer:work1'] = 'peer';
    w.clubs.player.reputation = 70;
    w.campaign!.skills = { anan: ['finance'], xiaoyu: ['mediation'] };
    const routes = routeScores(w);
    expect(routes.map(route => route.met)).toEqual([true, true, true, true]);
    w.campaign!.routes = routes;
    w.ending = { steward: 'trusteeship', resolution: '托管', retainedCents: 0, activeCommitments: [], sources: [] };
    w.ended = true;
    expect(buildYearbook(w)?.title.split(' × ')).toHaveLength(4);
  });

  it('maps the calendar to four seasons, plus weather and celebration', () => {
    const w = newWorld('map', 'fair-01', origin);
    for (const [window, art] of [[1, 'year-autumn'], [9, 'year-winter'], [13, 'sakura-courtyard'],
      [16, 'sakura-rain'], [21, 'sakura-festival'], [24, 'year-summer']] as const) {
      w.window = window;
      expect(worldProjection(w).art).toBe(art);
    }
  });

  it('records the in-scene delivery once and restores its effects from the archive', () => {
    const { archive, act } = session();
    act({ kind: 'choose', decisionId: 'w1', optionId: 'join-photo' });
    const field = { kind: 'fieldwork', projectId: 'fair-show' } as const;
    act(field);
    expect(archive.world.projects['fair-show'].signups).toBe(45);
    expect(archive.world.clubs.player.cash).toBe(46000);
    expect(execute(archive.world, makeCommand(archive.world, 'duplicate-delivery', field)).ok).toBe(false);
    expect(decode(encode(archive))).toEqual(archive);
  });

  it('makes recruitment materials exclusive, with different realized attendance and queue results', () => {
    const posters = session('fair-01', { scenario: 'legacy' });
    const signs = session('fair-01', { scenario: 'legacy' });
    for (const game of [posters, signs]) {
      game.act({ kind: 'choose', decisionId: 'w1', optionId: 'join-photo' });
      game.act({ kind: 'fieldwork', projectId: 'fair-show', ...(game === signs ? { approach: 'entrance' as const } : {}) });
      expect(execute(game.archive.world, makeCommand(game.archive.world, 'duplicate-kit', {
        kind: 'fieldwork', projectId: 'fair-show', approach: 'entrance',
      })).ok).toBe(false);
      game.step();
      expect(decode(encode(game.archive))).toEqual(game.archive);
    }
    expect(posters.archive.world.projects['fair-show']).toMatchObject({ signups: 69, capacity: 40, attendance: 40 });
    expect(signs.archive.world.projects['fair-show']).toMatchObject({ signups: 63, capacity: 46, attendance: 46 });
    expect(posters.archive.world.campaign?.queue?.amount).toBe(29);
    expect(signs.archive.world.campaign?.queue?.amount).toBe(17);
  });

  it('upgrades a copy of an A/B archive at its saved window without rewriting previous outcomes', () => {
    const prior = newWorld('original', 'fair-01');
    const move = execute(prior, makeCommand(prior, 'p1', {kind: 'choose', decisionId: 'w1', optionId: 'join-photo'}));
    if (!move.ok) throw new Error(move.message);
    const old: Archive = { world: move.world, receipts: [move.receipt], mode: 'demo' };
    const copied = copyArchive(old, 'copied');
    const enabled = execute(copied.world, makeCommand(copied.world, 'upgrade', { kind: 'enable-campaign' }));
    if (!enabled.ok) throw new Error(enabled.message);
    const next = { ...copied, world: enabled.world, receipts: [...copied.receipts, enabled.receipt] };
    expect(old.world.campaign).toBeUndefined();
    expect(next.world.clubs).toEqual(old.world.clubs);
    expect(next.world.window).toBe(old.world.window);
    expect(next.world.campaign?.enabledAt).toBe(2);
    expect(decode(encode(next))).toEqual(next);
  });

  it('transfers the room to trusteeship when nobody can run a rotation', () => {
    const { archive, act } = session();
    archive.world.window = 24;
    archive.world.choices['22'] = 'rotate';
    archive.world.choices['24'] = 'archive';
    for (const person of Object.values(archive.world.people)) if (person.club === 'player') person.status = 'leave';
    act({ kind: 'advance' });
    expect(archive.world.ending?.steward).toBe('trusteeship');
    expect(buildYearbook(archive.world)?.title).toBe('档案托管');
    expect(nextOrigin(archive.world)?.carry?.steward).toBe('trusteeship');
  });

  it('closes and replays every scenario across different deterministic strategies', () => {
    const count = Number(process.env.CAMPUS_YEAR_SIM_COUNT ?? 24);
    let total = 0;
    const routeCounts: Record<string, number> = {};
    const windows = new Set<number>();
    for (let i = 0; i < count; i++) {
      const profile = i % 6;
      const { archive, step, act } = session(`sim-${i}`, { scenario: profile === 3 ? 'legacy' : scenarioIds[i % scenarioIds.length] });
      const milestoneOptions: Partial<Record<number, string>>[] = [
        { 1: 'join-photo', 22: 'rotate' },
        { 1: 'solo-fair', 6: 'workshop-show', 14: 'friend-tech', 17: 'small-exhibit', 19: 'self-run' },
        { 1: 'join-photo', 5: 'lend', 14: 'friend-tech', 16: 'side-gate', 19: 'co-credit' },
        { 1: 'join-photo', 6: 'stage-show', 7: 'queue-plan', 8: 'open-invites', 17: 'lead-show', 19: 'co-credit', 21: 'room-for-more' },
        { 1: 'join-photo', 9: 'study', 22: 'nominate-jiang' },
        {},
      ];
      while (!archive.world.ended) {
        const world = archive.world;
        windows.add(world.window);
        if (profile === 4 && world.window <= 3) {
          for (const training of Object.values(world.campaign!.trainings).filter(item => item.performed && !item.reviewed)) {
            act({ kind: 'review', id: `learn:${training.pupil}:${training.skill}:${training.window}` });
          }
          if (world.window < 3) {
            act({ kind: 'train', mentor: 'aning', pupil: 'anan', skill: 'operations' });
            act({ kind: 'train', mentor: 'jiangyi', pupil: 'xiaoyu', skill: 'mediation' });
          }
        }
        if (profile !== 5 && world.campaign!.queue?.stage === 'open') {
          const queue = { kind: 'queue', method: 'stagger' } as const;
          if (execute(archive.world, makeCommand(archive.world, 'try-queue', queue)).ok) act(queue);
        }
        const options = currentDecision(world)?.options;
        const desired = milestoneOptions[profile][world.window] ?? (profile === 5 ? options?.[(i + world.window * 31) % options.length].id : undefined);
        step(desired);
      }
      const title = buildYearbook(archive.world)!.title;
      routeCounts[title] = (routeCounts[title] ?? 0) + 1;
      expect(decode(encode(archive)).world).toEqual(archive.world);
      total++;
    }
    expect(windows.size).toBe(24);
    console.info('[campus simulated years]', { total, windows: windows.size, routeCounts });
  }, 480_000);
});
