import type { World } from '../model';
export type Option = { id: string; label: string; preview: string };
type Decision = { title: string; story: string; options: Option[] };
const option = (id: string, label: string, preview: string): Option => ({ id, label, preview });
const decisions: Record<number, Decision> = {
  1: { title: '九月的第一个摊位', story: '陈岚拿来两社联摆的草案。她想在主路放摄影样片，阿南想把新生留下。', options: [
    option('join-photo', '和摄影社联摆', '支出 ¥40 · 广场一处共用展位 · 双方共同署名'),
    option('solo-fair', '出 ¥80 争主路展位', '和摄影社竞选，竞位结果按报价和种子裁决'),
  ] },
  3: { title: '人群涌到门口', story: '把人留下需要有人登记，阿南也想先把热度拉起来。', options: [
    option('register', '安排登记班次', '阿南在广场登记 2 小时，留下报名信息'),
    option('campaign', '再做一次宣传', '支出 ¥30，在现场组织一轮宣传'),
  ] },
  5: { title: '旧书社要办交换角', story: '杜舒想借一张折叠桌和两个小时的人手，寒假前归还。', options: [
    option('lend', '借桌并派江一协助', '冻结一张折叠桌到一月 · 江一协助 2 小时'),
    option('hold', '留给自己的活动', '资源仍归本社，杜舒会独自排班'),
  ] },
  6: { title: '十一月活动立项', story: '舞台和展廊可以承载不同规模。先确认档期，再决定放多少报名。', options: [
    option('stage-show', '预约湖畔舞台', '锁定 ¥48、音箱与江一的演出时段'),
    option('workshop-show', '改办工坊小场', '锁定 ¥48、展廊及阿柠的执行班次'),
    option('room-show', '在活动室办分享会', '无需新支出 · 两小时分享 · 容量较小'),
  ] },
  7: { title: '排好品牌活动的现场', story: '小予要求把支出写进活动账本，阿柠想知道入口要站几个人。', options: [
    option('queue-plan', '排演入口动线', '投入 ¥20，增加十人接待能力'),
    option('protect-funds', '保留机动经费', '按既有场地和人手开放'),
  ] },
  8: { title: '节目马上开场', story: '要向更多同学放号，还是把现有名单和动线收好？', options: [
    option('open-invites', '再开放一批报名', '增加十四人报名，超出场地的人留在候补'),
    option('cap-invites', '按入口能力发邀请', '将报名控制在已布置的容量以内'),
  ] },
  9: { title: '备考日程公布', story: '阿柠未来几周只剩两小时。今天的决定会影响她的排班和来年意愿。', options: [
    option('study', '安排阿柠备考', '暂停她的项目任务；记录本人决定和支持'),
    option('limited', '保留阿柠的两小时班次', '按上限预约本人同意的一个班次'),
  ] },
  10: { title: '谁接冬季值班', story: '空班需要有人认领。替班记在周历，缩场则换成较短安排。', options: [
    option('substitute', '请江一接班', '江一预约 2 小时，阿柠仍可复习'),
    option('shorten', '冬季活动缩场', '释放待办压力，小予记下缩场原因'),
  ] },
  12: { title: '寒假前清点物品', story: '对照预约和收据，把已经能交接的东西交清。', options: [
    option('review', '和对方核对清单', '优先收归借出的桌子；有合作则留下收据'),
    option('handoff-notice', '给接班人留备注', '账目保留到下一章并由规则检查到期'),
  ] },
  14: { title: '摄影社要补春季的片', story: '陈岚带着工时缺口来谈，秋天的选择还记在双方的档案里。', options: [
    option('repair', '给摄影社一个修复机会', '¥40 付给摄影社，提出共同补片，并预约江一 2 小时'),
    option('friend-tech', '同技术社做展廊备选', '不动旧账；安排江一与技术社联络'),
  ] },
  15: { title: '新成员到工坊报到', story: '邱桐和吴远在找可以跟着做的事。先定一个方向。', options: [
    option('showroom', '和邱桐安排展陈', '阿柠与邱桐各预约两小时作为新成员试做'),
    option('prototype', '和吴远看工具试产', '林起与吴远各预约两小时作为工坊试做'),
  ] },
  16: { title: '雨水挡住广场入口', story: '场地改了，答应过的物资和班次仍需要落实。', options: [
    option('side-gate', '把志愿者调到侧门', '有互惠支援时用旧书社班次，否则自筹 ¥45'),
    option('corridor', '转移到图书馆外廊', '保留现金，活动地点转向外廊'),
  ] },
  17: { title: '五月要做哪一种活动', story: '舞台能聚人，工坊能做出更扎实的作品。先预约主场。', options: [
    option('lead-show', '申请校园风云主舞台', '锁定 ¥60、音箱与江一的演出时段'),
    option('small-exhibit', '预约工坊作品展', '锁定 ¥35，保留较低接待上限'),
    option('room-exhibit', '在活动室做开放日', '无需新支出 · 由邱桐负责现场'),
  ] },
  19: { title: '联办伙伴怎样署名', story: '五月排期已经临近。和曾有往来的社团共同组织，或留给新成员独立完成。', options: [
    option('co-credit', '邀请有往来的伙伴联办', '信任较高的伙伴可认领班次，并进入项目记录'),
    option('self-run', '把版面留给新生作品', '用新人成果完成独立展出'),
  ] },
  21: { title: '五月现场最后一次调度', story: '确认人员和现场容量后，主持人会正式开门。', options: [
    option('room-for-more', '付 ¥20 扩一班入口', '扩大接待能力，若场地接近上限则收益变小'),
    option('room-under-control', '保守开放并登记候补', '不会额外花钱，留下真实核销结果'),
  ] },
  22: { title: '谁愿意接过活动室钥匙', story: '找人接班前先问本人意向，也可以选轮值。', options: [
    option('nominate-ning', '邀请阿柠接班', '本人在社且有项目经历时同意'),
    option('nominate-jiang', '邀请江一接班', '本人在社且有项目经历时同意'),
    option('rotate', '安排部长轮值', '设轮值组六月份的临时负责人'),
  ] },
  23: { title: '给下届留下什么', story: '检查哪些约定已经完成，哪些还得留在交接袋里。', options: [
    option('publish-handover', '公开交接清单', '公开未完成义务及实际结余'),
    option('private-handover', '向接班人面对面移交', '保留相同义务，更新交接方式'),
  ] },
  24: { title: '最后一次社团会议', story: '从九月的展位到六月的活动室，用一年里真实发生的事交班。', options: [
    option('archive', '封存年度档案并交班', '生成负责人、结余、项目和待续义务的摘要'),
  ] },
};
const ordinarySpring: Decision = {
  title: '春季交换展位', story: '摄影社暂时不缺人手。春季可以从一次小合作开始，也可以先做工坊展。', options: decisions[14].options,
};

export function currentDecision(world: World) {
  if (world.ended || world.choices[String(world.window)]) return null;
  const decision = world.window === 14 && !world.facts.springAppeal ? ordinarySpring : decisions[world.window];
  if (world.window === 22 && world.campaign) {
    const additional = [
      ...(world.campaign.skills.qiutong?.length ? [option('nominate-qiu', '提名邱桐参加投票', '用实习认证与活动经历竞选')] : []),
      ...(world.campaign.skills.wuyuan?.length ? [option('nominate-wu', '提名吴远参加投票', '用实习认证与活动经历竞选')] : []),
    ];
    return { ...decision, id: 'w22', options: [...decision.options, ...additional] };
  }
  return decision ? { ...decision, id: `w${world.window}` } : null;
}
