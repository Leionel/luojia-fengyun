import { describe, expect, it } from 'vitest';
import { chapters, windows } from '../calendar';
import { currentDecision } from '../content/chapters';
import { newWorld } from '../content/scenarios';
import type { Action, Receipt, World } from '../model';
import { decode, encode, replay } from '../storage/replay';
import { digest } from '../view/digest';
import { candidates } from './actors';
import { claim } from './projects';
import { makeCommand, execute } from './reducer';
import { reservationIssue } from './reservations';

function play(seed: string, cooperate: boolean, stop = 24, archive = true, repair = true) {
  let world = newWorld('year-test', seed);
  const receipts: Receipt[] = [];
  const act = (action: Action) => {
    const result = execute(world, makeCommand(world, `act-${world.revision}`, action));
    if (!result.ok) throw new Error(`W${world.window}: ${result.message}`);
    world = result.world;
    receipts.push(result.receipt);
  };
  while (!world.ended && (world.window < stop || archive && stop === 24)) {
    const decision = currentDecision(world);
    const choice = world.window === 1 ? (cooperate ? 'join-photo' : 'solo-fair') :
      world.window === 5 && cooperate ? 'hold' : world.window === 14 && !repair ? 'friend-tech' : world.window === 22 ? 'rotate' : undefined;
    if (decision) {
      const option = decision.options.find(item => item.id === choice) ??
        decision.options.find(item => execute(world, makeCommand(world, 'preview', { kind: 'choose', decisionId: decision.id, optionId: item.id })).ok);
      if (!option) throw new Error(`W${world.window}: no legal option`);
      act({ kind: 'choose', decisionId: decision.id, optionId: option.id });
    }
    for (const item of Object.values(world.applications)) if (item.window === world.window && item.status === 'pending') {
      act({ kind: 'application', id: item.id, accept: false });
    }
    act({ kind: 'advance' });
  }
  return { world, receipts, mode: 'demo' as const };
}

function apply(world: World, action: Action) {
  const result = execute(world, makeCommand(world, `round-${world.revision}`, action));
  if (!result.ok) throw new Error(result.message);
  return result.world;
}

describe('annual planning and A/B milestones', () => {
  it('starts September and closes June with all six chapter transitions, no state resets', () => {
    const run = play('fair-01', false);
    expect(windows).toHaveLength(24);
    expect(chapters.map(c => c.first)).toEqual([1, 6, 9, 13, 17, 22]);
    expect(run.world).toMatchObject({ window: 24, ended: true, ending: { steward: 'rotation' } });
    expect(run.world.projects['player-nov'].stage).toBe('complete');
    expect(run.world.projects['player-may'].stage).toBe('complete');
    const events = run.receipts.flatMap(r => r.events);
    expect(events.filter(e => e.type === 'chapter')).toHaveLength(5);
    expect(events.filter(e => e.type === 'choice')).toHaveLength(18);
    for (const event of events) {
      expect(event.causes.every(id => events.some(e => e.id === id && e.seq < event.seq))).toBe(true);
    }
    expect(run.world.ending?.retainedCents).toBe(run.world.clubs.player.cash);
  });

  it('replays stable commands exactly and refuses mismatched imports and duplicate IDs', () => {
    const first = play('fair-01', true);
    expect(decode(encode(first))).toEqual(first);
    expect(play('fair-01', true).world).toEqual(first.world);
    expect(() => decode(encode(first).replace(first.receipts[0].digest, 'deadbeef'))).toThrow();
    expect(() => replay(first.world.yearId, first.world.seed, [first.receipts[0], first.receipts[0]])).toThrow(/重复/);
  });

  it('settles venue, actor and equipment overlaps without double spending or overbooking', () => {
    const start = newWorld('cases', 'fair-01');
    const first = apply(start, { kind: 'choose', decisionId: 'w1', optionId: 'join-photo' });
    expect(first.clubs.player.cash).toBe(46000);
    const current = first.reservations['fair-show:venue'];
    const overlap = claim('other', current.resourceId, 'photo', 'other', 1, 68, 4);
    expect(reservationIssue(first, [overlap])).toMatch(/余量/);
    expect(reservationIssue(first, [{...overlap, from: current.to, to: current.to + 4}])).toBeNull();
    const cameras = [claim('cam1', 'gear:camera', 'photo', 'one', 1, 96, 10, 2), claim('cam2', 'gear:camera', 'photo', 'two', 1, 98, 3)];
    expect(reservationIssue(first, cameras)).toMatch(/余量/);
    const exam = play('fair-01', true, 9, false).world;
    expect(reservationIssue(exam, [claim('task', 'person:aning', 'player', 'proj', 9, 80, 5)])).toMatch(/工时/);
    expect(execute(first, makeCommand(start, 'stale', { kind: 'advance' })).ok).toBe(false);
  });

  it('lets two people and the rivals take different plans from the same seed', () => {
    const solo = play('fair-01', false, 6, false).world;
    const joint = play('fair-01', true, 6, false).world;
    expect(solo.people.anan.activity).not.toBe(joint.people.anan.activity);
    expect(solo.people.jiangyi.activity).not.toBe(joint.people.jiangyi.activity);
    expect(solo.projects['music-photo']).toMatchObject({ lead: 'music', partners: ['photo'], stage: 'scheduled' });
    expect(solo.reservations['music-photo:gear'].status).toBe('confirmed');
    expect(joint.projects['music-photo']).toBeUndefined();
    expect(solo.clubs.photo.cash - joint.clubs.photo.cash).toBe(3500);
    expect(solo.clubs.music.cash - joint.clubs.music.cash).toBe(-3500);
  });

  it('records an autonomous application and spends only after approval or a current grant', () => {
    const s = apply(newWorld('test', 'fair-01'), { kind: 'choose', decisionId: 'w1', optionId: 'solo-fair' });
    const asked = apply(s, { kind: 'advance' });
    const application = asked.applications['apply:1:anan'];
    expect(application.status).toBe('pending');
    expect(asked.clubs.player.cash).toBe(s.clubs.player.cash);
    expect(execute(asked, makeCommand(asked, 'jump', { kind: 'advance' })).ok).toBe(false);
    const approved = apply(asked, { kind: 'application', id: application.id, accept: true });
    expect(approved.clubs.player.cash).toBe(s.clubs.player.cash - 1800);
    expect(approved.applications[application.id].status).toBe('approved');
    const grant = apply(s, { kind: 'grant', actorId: 'anan', enabled: true });
    const spent = apply(grant, { kind: 'advance' });
    expect(spent.grants.anan?.spent).toBe(1800);
    expect(spent.clubs.player.cash).toBe(s.clubs.player.cash - 1800);
  });

  it('adopts a valid model move, filters invalid picks, and changes a real reservation', () => {
    const s = apply(newWorld('test', 'fair-01'), { kind: 'choose', decisionId: 'w1', optionId: 'join-photo' });
    const scout = candidates(s).find(item => item.actorId === 'anan' && item.work === 'scout')!;
    const base = apply(s, { kind: 'advance' });
    const live = execute(s, makeCommand(s, 'model', { kind: 'advance', selection: { intentIds: ['outdated', scout.id], traceId: 'live-verified' } }));
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    expect(live.world.people.anan.location).toBe('room');
    expect(base.people.anan.location).toBe('plaza');
    expect(live.world.reservations[scout.id]).toMatchObject({ resourceId: 'person:anan' });
    expect(live.receipt.events.some(event => event.source === 'model' && event.traceId === 'live-verified')).toBe(true);
  });

  it('executes a joint registration shift only while both participants can commit', () => {
    const agreed = apply(newWorld('test', 'fair-01'), { kind: 'choose', decisionId: 'w1', optionId: 'join-photo' });
    const desk = candidates(agreed).find(item => item.work === 'joint-desk')!;
    const next = apply(agreed, { kind: 'advance', selection: { intentIds: [desk.id], traceId: 'live-desk' } });
    expect(next.reservations[`${desk.id}:chenlan`]).toMatchObject({ resourceId: 'person:chenlan', owner: 'photo' });
    expect(next.people.chenlan.activity).toBe('协助联合登记台');
    expect(next.projects['fair-show']).toMatchObject({ signups: 45, attendance: 40 });
    agreed.people.chenlan.status = 'leave';
    expect(candidates(agreed).some(item => item.work === 'joint-desk')).toBe(false);
  });

  it('preserves autumn-to-spring causes for both the refusal and equipment-loan chain', () => {
    const solo = play('fair-01', false, 17, false);
    const joint = play('fair-01', true, 17, false);
    const w = solo.world;
    expect(w.facts).toHaveProperty('springAppeal');
    expect(w.facts).toHaveProperty('photoRepaired');
    expect(w.commitments.loan.status).toBe('fulfilled');
    expect(w.commitments.aid.status).toBe('fulfilled');
    const events = solo.receipts.flatMap(receipt => receipt.events);
    const offer = events.find(event => event.id === w.facts.aidOffer);
    expect(offer?.causes).toContain(w.facts.bookLoan);
    expect(joint.world.facts).not.toHaveProperty('aidOffer');
    expect(joint.world.facts).not.toHaveProperty('springAppeal');
  });

  it('turns a skipped reconciliation into a separately booked May photography stall', () => {
    const repaired = play('fair-01', false, 19, false);
    const separate = play('fair-01', false, 19, false, false);
    expect(repaired.world.projects['photo-may']).toBeUndefined();
    expect(separate.world.projects['photo-may']).toMatchObject({ lead: 'photo', dueWindow: 21, stage: 'scheduled' });
    expect(separate.world.reservations['photo-may:gear']).toMatchObject({ resourceId: 'gear:camera', status: 'confirmed' });
  });

  it('supports free venues if spending has exhausted operating cash', () => {
    const w6 = play('fair-01', false, 6, false).world;
    w6.clubs.player.cash = 0;
    expect(execute(w6, makeCommand(w6, 'plain', { kind: 'choose', decisionId: 'w6', optionId: 'room-show' })).ok).toBe(true);
    const w17 = play('fair-01', true, 17, false).world;
    w17.clubs.player.cash = 0;
    expect(execute(w17, makeCommand(w17, 'plain', { kind: 'choose', decisionId: 'w17', optionId: 'room-exhibit' })).ok).toBe(true);
    expect(digest(w17)).toMatch(/^[a-f0-9]{8}$/);
  });
});
