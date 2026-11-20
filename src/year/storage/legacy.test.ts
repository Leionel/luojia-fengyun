import { expect, it } from 'vitest';
import { restoreRun } from '../../game/save';
import { quickSaveKey } from './migration';

const p1Waiting = '{"version":1,"seed":"sakura-01","sessionId":"frozen-p1","scenario":"spring","mode":"live_ai","moves":[{"kind":"action","action":"CLUB_ALLIANCE"}]}';
const p1Ongoing = '{"version":1,"seed":"sakura-01","sessionId":"frozen-p1","scenario":"rain","mode":"demo","moves":[{"kind":"action","action":"CLUB_ALLIANCE"},{"kind":"incident","proposal":{"eventId":"RAIN_WARNING","offerId":"VOLUNTEER_SHIFT","line":"积水挡住了主入口。","reason":"雨备场安排动线。"},"mode":"demo"},{"kind":"response","choice":0}]}';
const p1Finished = JSON.stringify({
  version: 1, seed: 'sakura-01', sessionId: 'frozen-win', scenario: 'spring', mode: 'demo',
  moves: [
    { kind: 'action', action: 'PRINT_POSTERS' },
    { kind: 'incident', mode: 'demo', proposal: { eventId: 'GEAR_CHECK', offerId: 'SHARED_BOOTH', reason: '志愿者有空协助现场或宣传。', line: '有人愿意留下来帮忙。我们可以一起布置，也可以让他们把活动带进班群。' } },
    { kind: 'response', choice: 0 },
    { kind: 'action', action: 'PRINT_POSTERS' },
    { kind: 'incident', mode: 'demo', proposal: { eventId: 'QUEUE_SURGE', offerId: 'REUSE_SUPPLIES', reason: '现有报名人数超过了场地接待上限。', line: '候补名单已经排起来了。可以付钱加开候场区，也可以暂停一批预约，先把现场排好。' } },
    { kind: 'response', choice: 0 },
    { kind: 'action', action: 'BUILD_BOOTH', offerUsed: 'REUSE_SUPPLIES' },
    { kind: 'incident', mode: 'demo', proposal: { eventId: 'VIRAL_MOMENT', offerId: 'TIMED_ENTRY', reason: '准备度与社团声誉达到了传播条件。', line: '刚发的摊位预告被转了好几手。继续加名额，就得抽人出来改现场动线。' } },
    { kind: 'response', choice: 0 },
    { kind: 'action', action: 'REHEARSE', offerUsed: 'TIMED_ENTRY' },
    { kind: 'incident', mode: 'demo', proposal: { eventId: 'BUDGET_ALERT', offerId: 'REUSE_SUPPLIES', reason: '近期搭建了摊位，或预算已经偏低。', line: '工坊还能再订一批装饰。也能退掉一些，省给开场当天的机动开销。' } },
    { kind: 'response', choice: 0 },
    { kind: 'action', action: 'RESOLVE_CONFLICT' },
  ],
});

it('reopens frozen P1 formats through the original reducer', () => {
  expect(quickSaveKey).toBe('campus-chaos-p1');
  expect(restoreRun(p1Waiting)).toMatchObject({ recoveredFromWaiting: true, state: { turn: 2, stats: { budget: 460 } } });
  expect(restoreRun(p1Ongoing)).toMatchObject({ recoveredFromWaiting: false, state: { turn: 2, stats: { budget: 255 } } });
  expect(restoreRun(p1Finished)).toMatchObject({ recoveredFromWaiting: false, state: { phase: 'finished' } });
  expect(restoreRun(p1Ongoing.replace('RAIN_WARNING', 'QUIET_TURN'))).toBeNull();
});
