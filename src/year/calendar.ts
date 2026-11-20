import type { Chapter, SlotRange } from './model';

const start = Date.UTC(2026, 8, 1);
function slot(month: number, day: number) {
  return (Date.UTC(month >= 9 ? 2026 : 2027, month - 1, day) - start) / 1_800_000;
}

const dates = [
  [9, 1], [9, 8], [9, 15], [9, 29], [10, 15], [11, 1], [11, 9], [11, 22],
  [12, 1], [12, 11], [12, 21], [1, 8], [2, 1], [2, 23], [3, 9], [3, 22],
  [4, 1], [4, 13], [5, 1], [5, 13], [5, 24], [6, 1], [6, 11], [6, 21], [7, 1],
];
export const chapters: { id: Chapter; title: string; goal: string; first: number }[] = [
  { id: 'fair', title: '百团大战', goal: '争展位，给社团留下第一批伙伴', first: 1 },
  { id: 'debut', title: '初次亮相', goal: '把十一月的活动真正办出来', first: 6 },
  { id: 'exams', title: '期末风暴', goal: '在备考和已有承诺之间安排人手', first: 9 },
  { id: 'spring', title: '春季重启', goal: '面对旧伙伴和新的樱花季', first: 13 },
  { id: 'festival', title: '校园风云', goal: '协调联办，或把小场做扎实', first: 17 },
  { id: 'handover', title: '换届之夜', goal: '给下届留下清楚的账和交接', first: 22 },
];
export const windows = dates.slice(0, -1).map(([month, day], i) => {
  const [nextMonth, nextDay] = dates[i + 1];
  const chapter = chapters.findLast(item => item.first <= i + 1)!;
  return {
    number: i + 1, chapter, label: `${month}月${day}日`, semester: i < 12 ? '秋季学期' : '春季学期',
    from: slot(month, day), to: slot(nextMonth, nextDay),
  };
});
export const windowAt = (number: number) => windows[number - 1];
export function shift(window: number, offset: number, units: number): SlotRange {
  const { from, to } = windowAt(window);
  if (from + offset + units > to) throw new Error('排班超出战略窗口');
  return { from: from + offset, to: from + offset + units };
}
export function dateAt(tick: number) {
  const d = new Date(start + tick * 1_800_000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
