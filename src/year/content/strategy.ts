import { z } from 'zod';
import { key, stylesSchema, termsDraftSchema, termsSchema } from '../commands';
import type { DealTerms } from '../model';

export type Draft = Partial<DealTerms>;
export const draftOutput = z.strictObject({ groups: z.array(termsDraftSchema).max(4) });
export const replyOutput = z.strictObject({ styles: stylesSchema });
export const yearbookOutput = z.object({
  picks: z.array(z.union([z.number().int(), z.string().regex(/^\d{1,2}$/).transform(Number)])).min(1).max(12),
});

export const strategyInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('draft'), basis: key, window: z.number().int().min(1).max(24), text: z.string().trim().min(2).max(500) }),
  z.strictObject({ kind: z.literal('reply'), basis: key, groups: z.array(z.strictObject({
    terms: termsSchema, variants: z.partialRecord(z.enum(['keep', 'credit', 'reduce']), termsSchema),
  })).min(1).max(4) }),
  z.strictObject({ kind: z.literal('yearbook'), basis: key, facts: z.array(z.string().max(130)).min(1).max(10) }),
]);

const clubWords = { 摄影: 'photo', 音乐: 'music', 技术: 'tech', 旧书: 'book' } as const;
const placeWords = { 湖畔: 'stage', 舞台: 'stage', 工坊: 'workshop', 展廊: 'workshop', 活动室: 'room', 外廊: 'library', 图书馆: 'library', 广场: 'plaza' } as const;
const ownerWords = { 阿南: 'anan', 小予: 'xiaoyu', 江一: 'jiangyi', 阿柠: 'aning', 邱桐: 'qiutong', 吴远: 'wuyuan' } as const;
const monthWindow = { 九: 2, 十: 5, 十一: 8, 十二: 10, 一: 12, 二: 14, 三: 16, 四: 18, 五: 21, 六: 23 } as const;

function matchWord<V>(words: Record<string, V>, text: string) {
  return Object.entries(words).find(([word]) => text.includes(word))?.[1];
}

export function draftFromText(text: string, at: number): Draft[] {
  return text.split(/[；;。\n]+/).map(part => part.trim()).filter(Boolean).slice(0, 4).map(part => {
    const slot = part.match(/第\s*(\d{1,2})\s*(?:窗口|周)/)?.[1];
    const month = part.match(/(十一|十二|十|[一二三四五六九])月/)?.[1] as keyof typeof monthWindow | undefined;
    const cost = part.match(/(?:预算|费用|补贴|支付)\s*[¥￥]?\s*(\d+(?:\.\d{1,2})?)/)?.[1] ??
      part.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/)?.[1];
    const share = part.match(/(\d{1,3})\s*%/)?.[1];
    const hrs = part.match(/(\d+(?:\.5)?)\s*小时/)?.[1];
    const kind = /演出|音乐节|联演/.test(part) ? 'show' : /借|器材/.test(part) ? 'gear' :
      /宣传|海报/.test(part) ? 'publicity' : /工坊|展览|工作坊/.test(part) ? 'workshop' : undefined;
    return { kind, club: matchWord(clubWords, part), place: matchWord(placeWords, part), owner: matchWord(ownerWords, part),
      window: slot ? Number(slot) : month ? monthWindow[month] : /下周|下一窗|下个窗口/.test(part) ? at + 1 : undefined,
      fee: cost === undefined ? undefined : Math.round(Number(cost) * 100),
      share: share === undefined ? undefined : Number(share), units: hrs === undefined ? undefined : Number(hrs) * 2,
      credit: /共同署名|联合署名/.test(part) ? true : /独立署名|只署本社|不联名/.test(part) ? false : undefined };
  });
}
