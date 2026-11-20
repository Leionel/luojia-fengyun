import type { ActorId, ClubId, Person, PlaceId } from '../model';

function person(id: ActorId, club: ClubId, name: string, role: string, goal: string, hours: number, location: PlaceId): Person {
  return { id, club, name, role, goal, weeklyUnits: hours * 2, energy: 8, experience: 0, status: 'active', location, activity: '安排本周日程' };
}
export function initialPeople(): Record<ActorId, Person> {
  return {
    anan: person('anan', 'player', '阿南', '宣传部长', '争取一次有署名的主办', 8, 'plaza'),
    xiaoyu: person('xiaoyu', 'player', '小予', '财务部长', '留住经费并完成对账', 6, 'room'),
    jiangyi: person('jiangyi', 'player', '江一', '外联部长', '兑现两次互惠协作', 7, 'plaza'),
    aning: person('aning', 'player', '阿柠', '现场执行', '办成一次活动，也留出备考时间', 8, 'workshop'),
    chenlan: person('chenlan', 'photo', '陈岚', '摄影联络', '争取展位和作品署名', 6, 'plaza'),
    hemu: person('hemu', 'music', '何木', '节目负责人', '保住完整的舞台时段', 6, 'stage'),
    linqi: person('linqi', 'tech', '林起', '工坊负责人', '完成可展出的作品', 6, 'workshop'),
    dushu: person('dushu', 'book', '杜舒', '旧书社长', '稳定经营交换角', 5, 'library'),
    qiutong: { ...person('qiutong', 'player', '邱桐', '展陈新人', '找导师做一次展陈', 5, 'workshop'), status: 'incoming' },
    wuyuan: { ...person('wuyuan', 'player', '吴远', '工坊新人', '完成一个能使用的工具', 5, 'workshop'), status: 'incoming' },
  };
}
