import { scenarios } from '../content/scenarios';
import type { ActorId, CampaignOrigin, World, YearRoute } from '../model';
import type { Transaction } from './transaction';
import { digest } from '../view/digest';

export function routeScores(w: World) {
  const campaign = w.campaign!;
  const projects = Object.values(w.projects).filter(p => p.lead === 'player' && p.stage === 'complete');
  const partnered = projects.filter(p => p.partners.length);
  const partners = new Set(partnered.flatMap(p => p.partners));
  if (w.facts.aidFulfilled) partners.add('book');
  const hits = projects.filter(p => p.attendance >= 50 && (p.quality ?? 0) >= 70);
  const works = projects.filter(p => p.place === 'workshop' && !p.partners.length && (p.quality ?? 0) >= 80);
  const trained = Object.entries(campaign.skills).filter(([, skills]) => skills.length);
  const proofs = Object.entries(w.facts).filter(([key]) => key.startsWith('skill:') || key.startsWith('peer:'));
  const returning = (['anan', 'aning', 'jiangyi', 'xiaoyu'] as const).filter(id => w.people[id].status === 'active');
  const projectsEvidence = (list: typeof projects) => list.map(p => p.evidence.at(-1)!).filter(Boolean);
  return ([
    { name: '校园联盟型', score: partners.size * 3 + partnered.length,
      met: partners.size >= 2 && partnered.some(p => p.partners.length >= 2),
      evidence: [...projectsEvidence(partnered), w.facts.aidFulfilled].filter(Boolean) },
    { name: '明星社团', score: hits.length * 4 + Math.floor(w.clubs.player.reputation / 25),
      met: hits.length >= 2 && w.clubs.player.reputation >= 65, evidence: projectsEvidence(hits) },
    { name: '精英成果型', score: works.length * 4 + works.filter(p => w.facts[`peer:${p.id}`]).length,
      met: works.length >= 2 && works.some(p => w.facts[`peer:${p.id}`]),
      evidence: [...projectsEvidence(works), ...proofs.filter(([id]) => id.startsWith('peer:')).map(([, id]) => id)] },
    { name: '温暖共同体型', score: trained.length * 4 + returning.length,
      met: trained.length >= 2 && returning.length >= 3 && campaign.queue?.stage !== 'unresolved',
      evidence: [...proofs.filter(([id]) => id.startsWith('skill:')).map(([, id]) => id), w.facts.exams].filter(Boolean) },
  ] satisfies { name: YearRoute; score: number; met: boolean; evidence: string[] }[]).sort((a, b) => Number(b.met) - Number(a.met) || b.score - a.score);
}

export function nominees(w: World) {
  const nominated = w.choices['22']?.split('-')[1];
  if (!nominated) return [];
  const first = ({ ning: 'aning', jiang: 'jiangyi', qiu: 'qiutong', wu: 'wuyuan' } as Record<string, ActorId>)[nominated];
  const eligible = Object.values(w.people).filter(p => p.club === 'player' && p.status === 'active' && p.experience >= 2 &&
    (w.relationships[`${p.id}>player`]?.trust ?? 20) >= 10);
  return eligible.filter(p => p.id === first || Boolean(w.campaign?.skills[p.id]?.length))
    .sort((a, b) => Number(b.id === first) - Number(a.id === first) || b.experience - a.experience).slice(0, 2);
}

export function closeCampaign(tx: Transaction) {
  const w = tx.world;
  const campaign = w.campaign!;
  const voters = Object.values(w.people).filter(p => p.club === 'player' && p.status === 'active');
  const options = nominees(w);
  const ballot: NonNullable<World['campaign']>['ballot'] = voters.map(voter => {
    const ranked = options.map((person, index) => {
      const trained = Object.values(campaign.trainings).filter(t => t.pupil === person.id && t.reviewed);
      const experience = Math.min(12, person.experience);
      const score = experience + trained.length * 2 + (index ? 0 : 2) + (voter.id === person.id ? 5 : 0) +
        (voter.id === 'xiaoyu' && w.facts.handover ? 2 : 0) - (campaign.queue?.stage === 'unresolved' ? 3 : 0);
      return { person, score, trained };
    }).sort((a, b) => b.score - a.score ||
      digest([w.seed, voter.id, a.person.id]).localeCompare(digest([w.seed, voter.id, b.person.id])));
    const leading = ranked[0];
    const vote = leading?.score >= 4 ? leading.person.id : 'rotation' as const;
    const reason = vote === 'rotation' ? '希望临时轮值先完成未了事项' :
      leading.trained.length ? '认可已交付的练习与带教成果' : '认可有效项目和本人愿意承担交接';
    const causes = (vote === 'rotation' ? [w.facts.queuePressure, w.facts.handover] :
      [w.facts.steward, ...leading.trained.map(t => t.reviewed!)]).filter(Boolean);
    tx.record('ballot', `${voter.name}投给${vote === 'rotation' ? '轮值组' : w.people[vote].name}`, reason,
      { actorId: voter.id, causes });
    return { voter: voter.id, vote, reason, causes };
  });
  if (campaign.playerVote) {
    const vote = campaign.playerVote === 'rotation' || options.some(p => p.id === campaign.playerVote) ? campaign.playerVote : 'rotation';
    ballot.push({ voter: 'player', vote, reason: '玩家公开选择', causes: [w.facts.playerVote].filter(Boolean) });
  }
  campaign.ballot = ballot;
  const activeCommitments = Object.values(w.commitments).filter(item => item.status !== 'fulfilled').map(item => item.id);
  const winner = options.find(candidate => ballot.filter(item => item.vote === candidate.id).length > ballot.length / 2);
  const head = winner ? winner.id :
    voters.length < 2 || (w.clubs.player.cash < 3000 && campaign.debts.length) ? 'trusteeship' : 'rotation';
  campaign.routes = routeScores(w);
  const sources = [...new Set([w.facts.handover, w.facts.steward, ...campaign.routes.slice(0, 2).flatMap(route => route.evidence)].filter(Boolean))];
  w.ending = { steward: head, resolution: head === 'rotation' ? '部长组按轮值表接班' :
    head === 'trusteeship' ? '活动室交由指导委员会托管' : `${w.people[head].name}获多数票，接过钥匙`,
    retainedCents: w.clubs.player.cash, activeCommitments, sources };
}

export function nextOrigin(w: World): CampaignOrigin | undefined {
  if (!w.ended || !w.ending || !w.campaign) return;
  const season = (w.campaign.origin.carry?.season ?? 1) + 1;
  if (season > 20) return;
  const debts = [...w.campaign.debts];
  for (const obligation of Object.values(w.commitments)) {
    if (obligation.status === 'fulfilled' || obligation.debtor !== 'player' || obligation.beneficiary === 'player') continue;
    debts.push({ club: obligation.beneficiary, cents: 1800, title: '上届遗留承诺' });
  }
  return { scenario: w.campaign.origin.scenario, carry: {
    season, parent: w.yearId, balance: w.ending.retainedCents, steward: w.ending.steward,
    skills: structuredClone(w.campaign.skills), ties: structuredClone(w.relationships), debts,
  } };
}

export function buildYearbook(w: World) {
  const campaign = w.campaign;
  if (!w.ended || !campaign?.routes || !w.ending) return;
  const winners = campaign.routes.filter(route => route.met);
  const title = winners.length ? winners.map(route => route.name).join(' × ') : w.ending.steward === 'trusteeship' ? '档案托管' :
    w.ending.steward === 'rotation' ? '轮值接管' : '修复进行中';
  return { title,
    setting: scenarios[campaign.origin.scenario].label, ending: w.ending,
    attendance: Object.values(w.projects).filter(p => p.lead === 'player').reduce((sum, p) => sum + p.attendance, 0),
    routes: campaign.routes, debts: campaign.debts, ballot: campaign.ballot ?? [] };
}
