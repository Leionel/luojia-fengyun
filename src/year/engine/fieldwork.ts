import { places } from '../content/clubs';
import { fairPreparation, fieldJobs } from '../view/exploration';
import type { Transaction } from './transaction';

export function completeFieldwork(tx: Transaction, projectId: string, approach?: 'entrance') {
  const job = fieldJobs(tx.world).find(item => item.project.id === projectId);
  if (!job) throw new Error('这项现场工作已经登记，或项目不在筹备期。');
  const { project, place, kind } = job;
  if (approach && kind !== 'poster') throw new Error('引导牌用于招新摊位。');
  const outreach = kind === 'poster' && !approach;
  const previous = outreach ? project.signups : project.capacity;
  if (kind === 'poster') {
    const projected = fairPreparation(project, approach ?? 'poster');
    project.signups = projected.signups;
    project.capacity = projected.capacity;
  }
  else project.capacity = Math.min(places[place].guests, project.capacity + 6);
  const change = outreach ? `报名 ${previous} → ${project.signups}` : `接待上限 ${previous} → ${project.capacity}`;
  const title = outreach ? '招新海报已送达并张贴' : approach ? '招新引导牌已就位' : '现场设备与动线均已检查';
  const evidence = tx.record('fieldwork', title,
    `${project.name} · ${change}。现场成果计入活动复盘。`,
    { source: 'player', key: `field:${project.id}`, causes: [tx.world.facts[`project:${project.id}`]] });
  project.evidence.push(evidence);
}
