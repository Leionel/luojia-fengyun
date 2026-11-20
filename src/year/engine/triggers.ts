import { windowAt } from '../calendar';
import type { Transaction } from './transaction';
import { canSchedule, claim, scheduleProject } from './projects';
import { reservationIssue } from './reservations';
import { photoAndMusic } from './diplomacy';

export function lendTable(tx: Transaction, cause: string) {
  const reservation = claim('book-loan:table', 'gear:tables', 'book', 'book-loan', 5, 48, 1);
  reservation.to = windowAt(12).from + 72;
  tx.book([reservation, claim('book-loan:staff', 'person:jiangyi', 'player', 'book-loan', 5, 76, 4)], cause);
  const origin = tx.record('commitment', '旧书社借桌承诺已成立', '一张桌已交给旧书社，江一协助两小时，一月归还。', { key: 'bookLoan', causes: [cause] });
  tx.world.commitments.loan = { id: 'loan', kind: 'loan', projectId: 'book-loan', debtor: 'book', beneficiary: 'player', dueWindow: 12, status: 'active', origin };
}

export function onWindowOpened(tx: Transaction) {
  const w = tx.world;
  if (w.window === 6 && w.facts.photoDeclined && !w.facts.photoMusic) photoAndMusic(tx);
  if (w.window === 9 && w.facts.photoMusic) {
    const dispute = tx.record('conflict', '阿南提出宣传署名争议', '秋季联演属于竞争伙伴，阿南希望独立路线也能给自己一次主办机会。', { causes: [w.facts.photoDeclined, w.facts.photoMusic], actorId: 'anan', key: 'photoDispute' });
    tx.relate('anan', 'player', { alignment: -18 }, dispute, dispute);
  }
  if (w.window === 13) {
    for (const id of ['qiutong', 'wuyuan', 'aning'] as const) {
      w.people[id].status = 'active';
      w.people[id].activity = id === 'aning' ? '春季返回活动室' : '寻找第一项展陈任务';
    }
    tx.record('roster', '春季成员到场', '邱桐、吴远入社，阿柠恢复排班。', { causes: [w.facts.exams] });
  }
  if (w.window === 14 && w.facts.photoDeclined && w.projects['music-photo']?.stage === 'complete') {
    const tone = (w.relationships['photo>player']?.trust ?? 20) < 25 ? '先做一个小合作，按期交片后再谈联办。' : '愿意先互换人手。';
    tx.record('opportunity', '旧对手回来求援', `摄影社缺两小时布展工时。${tone}`, { key: 'springAppeal', causes: [w.facts.photoDeclined, w.facts.photoMusic, w.facts.photoDispute] });
  }
  if ((w.window === 16 || w.window === 20) && w.facts.bookReturned && !w.facts.aidOffer) {
    const shift = claim('old-book-aid', 'person:dushu', 'book', 'spring-aid', w.window, 72, 4);
    if (w.facts['outside:book-w4'] && w.facts['outside:book-w10'] && !reservationIssue(w, [shift])) {
      tx.record('opportunity', '旧书社愿意还一班人手', '交换角已有两次实际安排。杜舒可以带志愿者从侧门做引导。', { key: 'aidOffer', causes: [w.facts.bookLoan, w.facts.bookReturned, w.facts['outside:book-w10']], actorId: 'dushu' });
    }
  }
  if (w.window === 18 && w.facts.photoDeclined) {
    const terms = tx.record('opportunity', '五月的联办席位公开', w.facts.photoRepaired ? '春季补片完成，摄影社可加入五月联办。' : '秋季伙伴仍未重建协作，摄影社先为自己的作品约场。', {
      key: 'mayPhotoTerms', causes: [w.facts.photoDeclined, w.facts.photoRepaired, w.facts.springAppeal],
    });
    if (!w.facts.photoRepaired) {
      const booth = { id: 'photo-may', name: '摄影社五月作品摊', lead: 'photo', owner: 'chenlan',
        place: 'plaza', window: 21, gear: 'camera', signups: 28 } as const;
      const plan = [booth, { ...booth, place: 'library' as const, offset: 84 }].find(item => canSchedule(tx, item));
      if (plan) {
        scheduleProject(tx, plan, terms);
        w.clubs.photo.plan = plan.name;
      }
    }
  }
}

export function onWindowClosing(tx: Transaction) {
  const w = tx.world;
  if (w.window === 14 && w.facts.photoRepairPlanned) {
    const attended = (['jiangyi', 'chenlan'] as const).every(id =>
      w.people[id].status === 'active' && w.reservations[`choice:w14:${id}`]?.status === 'confirmed');
    if (attended) {
      const evidence = tx.record('agreement', '两社完成一次春季协作', '江一和陈岚按约交付补片，摄影社开始考虑五月联办。',
        { key: 'photoRepaired', causes: [w.facts.photoRepairPlanned, w.facts.springAppeal] });
      tx.relate('photo', 'player', { trust: 14, bond: 6 }, evidence);
    } else {
      tx.record('commitment', '春季补片尚未完成', '约定班次有人缺席，摄影社保留独立展位。', { causes: [w.facts.photoRepairPlanned] });
    }
  }
  const loan = w.commitments.loan;
  if (loan?.status === 'active' && w.window === loan.dueWindow) {
    w.reservations['book-loan:table'].status = 'released';
    loan.status = 'fulfilled';
    const returned = tx.record('commitment', '折叠桌已经归还', '旧书社把桌子送回活动室，完成了寒假前的承诺。', { key: 'bookReturned', causes: [loan.origin] });
    tx.relate('book', 'player', { trust: 12, bond: 6 }, returned);
  }
}
