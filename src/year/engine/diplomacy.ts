import { claim, canSchedule, scheduleProject } from './projects';
import type { Transaction } from './transaction';
import { digest } from '../view/digest';

export function fair(tx: Transaction, cooperative: boolean, origin: string) {
  const plan = { window: 1, id: 'fair-show', name: cooperative ? '主路联摆' : '新生招募摊位',
    lead: 'player' as const, place: 'plaza' as const, owner: 'anan' as const, gear: 'tables',
    signups: (cooperative ? 39 : 34) + (tx.world.campaign?.origin.scenario === 'legacy' ? 24 : 0) };
  if (cooperative) {
    tx.pay('player', 4000, '分担招新物料', origin);
    const joint = tx.record('agreement', '摄影社接受联摆', '主路展位挂两家社团的名字，摄影社协助招募。', { causes: [origin], key: 'photoJoined' });
    scheduleProject(tx, { ...plan, partners: ['photo'] }, joint);
    tx.world.commitments.fair = { id: 'fair', kind: 'joint', projectId: plan.id, debtor: 'player', beneficiary: 'photo', dueWindow: 1, status: 'active', origin: joint };
    tx.relate('photo', 'player', { alignment: 12 }, joint);
  } else {
    tx.pay('player', 8000, '独立招新与展位物料', origin);
    const declined = tx.record('agreement', '摄影社另找合作方', '本社决定独立招新，摄影社保留自己的档期和设备。', { causes: [origin], key: 'photoDeclined' });
    tx.relate('photo', 'player', { alignment: -6 }, declined);
    const tie = parseInt(digest([tx.world.seed, 'fair-bids']), 16) % 2;
    const competitor = { ...plan, id: 'photo-fair', name: '摄影社作品摊', lead: 'photo' as const, owner: 'chenlan' as const, gear: 'camera' };
    const awarded = tx.record('competition', '主路展位分配完成', tie ? '同价竞位由摄影社取得，本社改去工坊。' : '同价竞位由本社取得，摄影社改去工坊。', { causes: [declined], key: 'fairAward' });
    scheduleProject(tx, tie ? { ...plan, place: 'workshop' } : plan, awarded);
    scheduleProject(tx, tie ? competitor : { ...competitor, place: 'workshop' }, awarded);
  }
}

export function outsideClubs(tx: Transaction) {
  const world = tx.world;
  const tracks = [
    { schedule: [4, 10], id: 'book', label: '旧书交换角', place: 'library', actor: 'dushu', gear: 'tables' },
    { schedule: [2, 11, 18], id: 'tech', label: '工坊开放试做', place: 'workshop', actor: 'linqi', gear: 'camera' },
    { schedule: [3, 16], id: 'music', label: '节目预演', place: 'stage', actor: 'hemu', gear: 'speakers' },
    { schedule: [7, 15], id: 'photo', label: '摄影作品走查', place: 'plaza', actor: 'chenlan', gear: 'camera' },
  ] as const;
  for (const track of tracks) {
    if (!(track.schedule as readonly number[]).includes(world.window)) continue;
    const primary = { id: `${track.id}-w${world.window}`, name: track.label, lead: track.id, owner: track.actor, place: track.place,
      gear: track.gear, window: world.window, offset: 84, signups: 22 };
    const smaller = { ...primary, place: 'room' as const, name: `${track.label} · 小场`, offset: 96, signups: 14 };
    const plan = [primary, smaller].find(candidate => canSchedule(tx, candidate));
    if (!plan) {
      world.clubs[track.id].plan = '本窗口活动取消';
      tx.record('competition', '外社活动取消', `${world.clubs[track.id].label}无法预约主场或备选场，时间和物料留给之后的项目。`);
      continue;
    }
    const origin = tx.record('rival', `${world.clubs[track.id].label}自行安排`, plan.name, { actorId: track.actor, key: `outside:${plan.id}` });
    world.clubs[track.id].plan = plan.name;
    world.people[track.actor].location = plan.place;
    world.people[track.actor].activity = plan.name;
    scheduleProject(tx, plan, origin);
  }
}

export function photoAndMusic(tx: Transaction) {
  const world = tx.world;
  const plan = { id: 'music-photo', name: '秋夜留声联演', lead: 'music' as const, owner: 'hemu' as const, place: 'stage' as const,
    partners: ['photo' as const], window: 8, gear: 'speakers', signups: 57 };
  const show = { ...plan, offset: 116 };
  if (!canSchedule(tx, show)) return;
  const camera = claim('music-photo:camera', 'gear:camera', 'photo', plan.id, 8, 116, 4);
  const photographer = claim('music-photo:camera-staff', 'person:chenlan', 'photo', plan.id, 8, 116, 4);
  const joint = tx.record('agreement', '摄影社和音乐社签了联演', '音乐社拿舞台和音箱，摄影社提供拍摄。这一档已被占用。', { causes: [world.facts.photoDeclined], key: 'photoMusic' });
  scheduleProject(tx, show, joint);
  tx.book([camera, photographer], joint);
  tx.pay('music', 3500, '购买摄影联演服务', joint, 'photo');
  world.clubs.photo.plan = plan.name;
  world.clubs.music.plan = plan.name;
  world.commitments.photoMusic = { id: 'photoMusic', projectId: plan.id, kind: 'joint', debtor: 'photo', beneficiary: 'music', dueWindow: 8, status: 'active', origin: joint };
  tx.relate('photo', 'music', { alignment: 15 }, joint);
}
