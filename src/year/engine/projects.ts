import { shift } from '../calendar';
import { places } from '../content/clubs';
import type { ActorId, ClubId, PlaceId, Project, Reservation } from '../model';
import { reservationIssue } from './reservations';
import type { Transaction } from './transaction';

export function claim(id: string, resourceId: string, owner: ClubId, projectId: string, window: number, offset: number, duration: number, units = 1): Reservation {
  return { id, resourceId, owner, projectId, ...shift(window, offset, duration), units, status: 'confirmed' };
}

type ProjectPlan = { id: string; name: string; lead: ClubId; place: PlaceId; owner: ActorId; partners?: ClubId[];
  window: number; offset?: number; gear?: string; signups: number; cost?: number; setup?: boolean; externalClaims?: boolean };

export function projectClaims(plan: ProjectPlan) {
  const { id, place, lead, owner, window, offset = 68, gear } = plan;
  return [
    claim(`${id}:venue`, `venue:${place}`, lead, id, window, offset, 4),
    claim(`${id}:staff`, `person:${owner}`, lead, id, window, offset, 4),
    ...(gear ? [claim(`${id}:gear`, `gear:${gear}`, lead, id, window, offset, 4)] : []),
  ];
}

export function scheduleProject(tx: Transaction, plan: ProjectPlan, cause: string) {
  const { lead, id, place, name, owner, partners = [], window, signups, cost = 0 } = plan;
  if (tx.world.projects[id]) throw new Error('这项活动已经排上日程');
  const account = tx.world.clubs[lead];
  if (account.cash - account.held < cost) throw new Error('没有足够经费锁定活动');
  if (!plan.externalClaims) tx.book(projectClaims(plan), cause);
  if (cost) {
    account.held += cost;
    tx.record('held', '活动经费已预留', `${account.label}为「${name}」预留 ¥${cost / 100}`, { causes: [cause] });
  }
  const project: Project = {
    id, name, lead, partners, place, owner, stage: 'scheduled',
    capacity: Math.min(places[place].guests, 28 + partners.length * 12 + (plan.setup ? 15 : 0)),
    signups, attendance: 0, dueWindow: window, heldCents: cost, evidence: [cause],
  };
  tx.world.projects[id] = project;
  tx.world.facts[`project:${id}`] = tx.record('project', '活动排上日程', `${name} · ${places[place].label}`, { causes: [cause] });
}

export function canSchedule(tx: Transaction, plan: ProjectPlan) {
  return !tx.world.projects[plan.id] && tx.world.clubs[plan.lead].cash - tx.world.clubs[plan.lead].held >= (plan.cost ?? 0)
    && !reservationIssue(tx.world, projectClaims(plan));
}

export function finishProjects(tx: Transaction) {
  for (const project of Object.values(tx.world.projects)) {
    if (project.stage !== 'scheduled' || project.dueWindow !== tx.world.window) continue;
    const cost = project.heldCents;
    const active = Object.values(tx.world.reservations).some(r =>
      r.projectId === project.id && r.status === 'confirmed' && r.resourceId === `person:${project.owner}`);
    const evidence = tx.world.facts[`project:${project.id}`];
    if (cost) {
      tx.world.clubs[project.lead].held -= cost;
      project.heldCents = 0;
    }
    if (!active || tx.world.people[project.owner].status !== 'active') {
      project.stage = 'postponed';
      project.evidence.push(tx.record('project', '活动改期', `${project.name}缺少到场负责人，预约已释放。`, { causes: [evidence] }));
    } else {
      if (cost) tx.pay(project.lead, cost, project.name, evidence);
      project.stage = 'complete';
      project.attendance = Math.min(project.signups, project.capacity);
      if (tx.world.campaign) {
        const experience = tx.world.people[project.owner].experience;
        project.quality = Math.min(100, 45 + Math.min(30, experience * 3) +
          Math.min(15, project.evidence.length * 4) + (project.place === 'workshop' ? 14 : 5) + project.partners.length * 3);
      }
      tx.world.clubs[project.lead].reputation += Math.ceil(project.attendance / 12);
      tx.world.people[project.owner].experience += 2;
      project.evidence.push(tx.record('project', '活动已举行', `${project.name}接待 ${project.attendance} 人，候补 ${project.signups - project.attendance} 人。${project.quality === undefined ? '' : `质量 ${project.quality}。`}`, { causes: [evidence], actorId: project.owner }));
      if (tx.world.campaign && project.lead === 'player' && project.place === 'workshop' && project.quality! >= 80) {
        tx.record('project', '工坊作品已完成同行验收', `${project.name} · 质量 ${project.quality}`,
          { causes: [project.evidence.at(-1)], key: `peer:${project.id}` });
      }
    }
    for (const commitment of Object.values(tx.world.commitments)) {
      if (commitment.projectId !== project.id || commitment.status !== 'active') continue;
      const partnerAttended = Object.values(tx.world.reservations).some(r => r.projectId === project.id && r.owner === commitment.debtor &&
        r.status === 'confirmed' && r.resourceId.startsWith('person:') && tx.world.people[r.resourceId.slice(7) as ActorId]?.status === 'active');
      commitment.status = project.stage === 'complete' && (commitment.debtor === project.lead || partnerAttended) ? 'fulfilled' : 'overdue';
      const ok = commitment.status === 'fulfilled';
      const fact = tx.record('commitment', ok ? '合作已兑现' : '合作未兑现', project.name, { causes: [commitment.origin, project.evidence.at(-1)] });
      tx.relate(commitment.beneficiary, commitment.debtor, { trust: ok ? 12 : -20, bond: ok ? 6 : 0 }, fact, ok ? undefined : fact);
    }
    for (const reservation of Object.values(tx.world.reservations)) if (reservation.projectId === project.id) reservation.status = 'released';
  }
}
