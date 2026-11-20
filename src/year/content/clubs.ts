import type { Club, ClubId, PlaceId } from '../model';

function club(id: ClubId, label: string, goal: string, yuan: number, reputation: number): Club {
  return { id, label, goal, cash: yuan * 100, held: 0, reputation, plan: goal };
}
export function initialClubs(): Record<ClubId, Club> {
  return {
    player: club('player', '珞珈社团', '办好活动并把班交下去', 500, 25),
    photo: club('photo', '摄影社', '争取展示与作品署名', 620, 36),
    music: club('music', '音乐社', '安排一次完整的舞台演出', 720, 44),
    tech: club('tech', '技术社', '在工坊试产并开放展示', 540, 30),
    book: club('book', '旧书社', '把交换角和读书会办下去', 300, 22),
  };
}
export const places: Record<PlaceId, { label: string; x: number; y: number; guests: number }> = {
  plaza: { label: '樱坡广场', x: 51, y: 61, guests: 64 },
  stage: { label: '湖畔舞台', x: 50, y: 24, guests: 86 },
  workshop: { label: '工坊展廊', x: 76, y: 47, guests: 32 },
  library: { label: '图书馆外廊', x: 24, y: 46, guests: 28 },
  room: { label: '活动室', x: 52, y: 85, guests: 24 },
};
