import type { Action, ActorId, Skill, World } from '../model';
import { claim } from './projects';
import type { Transaction } from './transaction';

export const skills: Record<Skill, { label: string; mentor: ActorId; ability: string }> = {
  operations: { label: '入口调度', mentor: 'aning', ability: '独立开双入口，候补分流增加四个名额' },
  mediation: { label: '多方协调', mentor: 'jiangyi', ability: '一次邀请三个或更多外社参加谈判' },
  finance: { label: '活动财务', mentor: 'xiaoyu', ability: '缩场时减少赔付与退费处理成本' },
};

export function certified(w: World, skill: Skill, id?: ActorId) {
  return id ? w.campaign?.skills[id]?.includes(skill) : Object.entries(w.campaign?.skills ?? {})
    .some(([actor, list]) => list.includes(skill) && w.people[actor as ActorId].status === 'active');
}

export function startTraining(tx: Transaction, action: Extract<Action, {kind: 'train'}>) {
  const w = tx.world;
  const { mentor, pupil, skill } = action;
  const trainingId = `learn:${pupil}:${skill}:${w.window}`;
  const previous = Object.values(w.campaign!.trainings).filter(item => item.pupil === pupil && item.skill === skill).at(-1);
  const teacher = w.people[mentor];
  const student = w.people[pupil];
  if (mentor === pupil || teacher.club !== 'player' || student.club !== 'player' || teacher.status !== 'active' || student.status !== 'active') {
    throw new Error('请指定在社的导师和学员。');
  }
  if (skills[skill].mentor !== mentor && !certified(w, skill, mentor)) throw new Error('导师须有该岗位资格。');
  if (certified(w, skill, pupil) || previous && previous.window >= w.window) throw new Error('已有成果或同一认证正在进行。');
  if (previous?.performed && !previous.reviewed) throw new Error('先复盘已完成的练习。');
  if (w.window >= 23) throw new Error('本年已进入交接，请留到下一年训练。');
  const event = tx.record('growth', `${teacher.name}带${student.name}练习${skills[skill].label}`, '双方各预留两小时，练习结束后登记一次复盘。',
    { source: 'player', actorId: pupil, causes: [previous?.origin] });
  tx.book([claim(`${event}:mentor`, `person:${mentor}`, 'player', trainingId, w.window, 92, 4),
    claim(`${event}:pupil`, `person:${pupil}`, 'player', trainingId, w.window, 92, 4)], event);
  w.campaign!.trainings[trainingId] = { mentor, pupil, skill, window: w.window, origin: event };
}

export function finishTraining(tx: Transaction) {
  const w = tx.world;
  for (const [id, training] of Object.entries(w.campaign!.trainings)) {
    if (training.window !== w.window) continue;
    const ready = [training.mentor, training.pupil].every(actor => w.people[actor].status === 'active' &&
      Object.values(w.reservations).some(r => r.projectId === id && r.status === 'confirmed' && r.resourceId === `person:${actor}`));
    const event = tx.record('growth', ready ? '练习已完成，等待复盘' : '练习因缺席中止',
      `${w.people[training.pupil].name} · ${skills[training.skill].label}`, { causes: [training.origin], actorId: training.pupil });
    if (ready) training.performed = event;
  }
}

export function reviewTraining(tx: Transaction, id: string) {
  const w = tx.world;
  const entry = w.campaign!.trainings[id];
  if (!entry?.performed || entry.reviewed || certified(w, entry.skill, entry.pupil)) throw new Error('这份练习没有待复盘的成果。');
  const list = w.campaign!.skills[entry.pupil] ?? [];
  const earlier = Object.values(w.campaign!.trainings).filter(item => item !== entry && item.pupil === entry.pupil &&
    item.skill === entry.skill && item.reviewed);
  const name = w.people[entry.pupil].name;
  if (!earlier.length) {
    w.people[entry.pupil].experience++;
    entry.reviewed = tx.record('growth', `${name}已完成第一次复盘`, '再完成一次不同窗口的练习与复盘可获认证。',
      { source: 'player', actorId: entry.pupil, causes: [entry.performed, entry.origin] });
    return;
  }
  w.campaign!.skills[entry.pupil] = [...list, entry.skill];
  w.people[entry.pupil].experience += 2;
  entry.reviewed = tx.record('growth', `${name}取得${skills[entry.skill].label}认证`, skills[entry.skill].ability,
    { source: 'player', actorId: entry.pupil, causes: [entry.performed, entry.origin, ...earlier.map(item => item.reviewed)],
      key: `skill:${entry.pupil}:${entry.skill}` });
}
