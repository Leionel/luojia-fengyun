import { CloudRain, DoorOpen, Flower2, MapPin, Maximize, MoveRight, Users } from 'lucide-react';
import type { CSSProperties } from 'react';
import { events } from '../game/events';
import { npcIds, npcs, type GameState, type NpcId } from '../game/model';
import { getAttendance, getOutcome } from '../game/rules';
import { scenarios } from '../game/scenarios';

const sprite = { promotion: 'anan', finance: 'xiaoyu', external: 'jiangyi' } as const;
const visitors = [
  [69, 79], [28, 71], [77, 66], [22, 61], [82, 78], [55, 90],
  [20, 77], [42, 85], [82, 62], [68, 88], [29, 85], [86, 84],
];
const visitorColors = ['gold', 'blue', 'rose'];
const posterPositions = [[32, 42], [67, 43], [24, 39], [75, 40], [42, 43], [59, 43]];

export function moodText(mood: number) {
  if (mood < 47) return '有顾虑';
  if (mood >= 73) return '干劲十足';
  return '在准备';
}

export function Avatar({ id }: { id: NpcId }) {
  return <span className={`avatar ${npcs[id].color}`}><img src={`/art/${sprite[id]}.png`} alt="" /></span>;
}

function point(x: number, y: number): CSSProperties {
  return { left: `${x}%`, top: `${y}%` };
}

export function Courtyard({ state, started, onStart, onSetup, onFullscreen, cinema }: {
  state: GameState; started: boolean; onStart: () => void; onSetup: () => void; onFullscreen: () => void; cinema: boolean;
}) {
  const won = state.phase === 'finished' && getOutcome(state.stats, state.scenario).won;
  const raining = state.scenario === 'rain' && !won;
  const art = won ? 'sakura-festival' : raining ? 'sakura-rain' : 'sakura-courtyard';
  const speaker = state.incident && state.incident.eventId !== 'QUIET_TURN' ? events[state.incident.eventId].npc : null;
  const rainRoute = state.history.findLast(entry => entry.kind === 'response' && entry.event === 'RAIN_WARNING')?.choice;
  const { admitted, waiting } = getAttendance(state.stats);
  const target = scenarios[state.scenario].goals.attendance;
  const printed = state.counts.PRINT_POSTERS ?? 0;
  const posterCount = Math.min(posterPositions.length, 1 + printed * 2 + Number(state.flags.includes('alliance')));
  const visitorCount = Math.min(visitors.length, Math.floor(admitted / (won ? 3 : 5)));
  const queued = [[37, 78], [34, 84], [31, 89], [28, 93]].slice(0, Math.min(4, Math.ceil(waiting / 3)));
  const boothLevel = state.stats.readiness >= 82 || won ? 2
    : state.stats.readiness >= 49 || state.counts.BUILD_BOOTH ? 1 : 0;
  const positions: Record<NpcId, number[]> = {
    promotion: printed ? [35, 59] : [39, 64],
    finance: [59, state.stats.budget < 300 ? 62 : 69],
    external: state.flags.includes('alliance') ? [67, 55] : [52, 76],
  };

  // Leave the full-screen incident panel free while keeping the playable scene centered.
  const worldPoint = (x: number, y: number) => cinema ? point(12 + .67 * x, 11 + .69 * y) : point(x, y);
  return (
    <section className="courtyard" aria-label="樱坡广场">
      <div className={`scene ${raining ? 'raining' : ''} ${won ? 'festival' : ''}`}>
        <img className="scene-art" key={art} src={`/art/${art}.webp`} alt="" fetchPriority="high" />
        {raining && <div className="raindrops" aria-hidden="true">{Array.from({ length: 16 }, (_, i) =>
          <i key={i} style={{ left: `${i * 6.5}%`, animationDelay: `-${i * .17}s` }} />)}</div>}
        <div className="scene-badge">{raining ? <CloudRain size={15} /> : <MapPin size={14} />} {raining ? '樱坡广场 · 小雨' : '樱坡广场'}</div>
        <div className="scene-day">{state.phase === 'finished' ? (won ? '市集进行中' : '市集改期') : `第 ${state.turn} 天 · 筹备中`}</div>
        {!cinema && <button className="scene-fullscreen" aria-label="全屏游玩" title="全屏游玩" onClick={onFullscreen}><Maximize size={17} /></button>}
        {started && <div className={`entrance ${waiting ? 'has-queue' : ''}`}>
          <Users size={16} /><span>{won ? '入场' : '预计入场'} <b>{admitted}</b>{!won && <> / {target}</>}</span>
          {waiting > 0 && <strong>候补 {waiting} 人</strong>}
        </div>}
        {rainRoute !== undefined && <div className="scene-route" style={rainRoute === 0 ? worldPoint(21, 56) : worldPoint(76, 43)}>
          <DoorOpen size={13} /> {rainRoute === 0 ? '侧门入场' : '连廊入场'}
        </div>}
        {posterPositions.slice(0, posterCount).map(([x, y], index) => (
          <i className={`poster poster-${index % 3}`} style={worldPoint(x, y)} key={index} />
        ))}
        <img className="booth" key={boothLevel} style={worldPoint(50, 60)} src={`/art/booth-${boothLevel}.png`} alt="" />
        {started && visitors.slice(0, visitorCount).map(([x, y], index) => (
          <img className="visitor" style={{ ...worldPoint(x, y), zIndex: Math.round(y) }} key={index}
            src={`/art/visitor-${visitorColors[index % visitorColors.length]}.png`} alt="" />
        ))}
        {started && queued.map(([x, y], index) => (
          <img className="visitor waiting-visitor" style={{ ...worldPoint(x, y), zIndex: y }} key={index}
            src={`/art/visitor-${visitorColors[index % visitorColors.length]}.png`} alt="" />
        ))}
        {npcIds.map(id => {
          const [x, y] = positions[id];
          return <div className={`scene-npc ${npcs[id].color} ${speaker === id ? 'active-speaker' : ''}`} key={id}
            style={{ ...worldPoint(x, y), zIndex: speaker === id ? 94 : Math.round(y) }}
            title={`${npcs[id].name} · ${moodText(state.mood[id])}`}>
            {speaker === id && <b className="speech-marker" aria-hidden="true">…</b>}
            <img src={`/art/${sprite[id]}.png`} alt="" />
            <span>{npcs[id].name}{state.mood[id] < 47 ? ' !' : state.mood[id] >= 73 ? ' ↑' : ''}</span>
          </div>;
        })}
        {!started && <div className="start-layer">
          <div className="start-pass">
            <Flower2 size={23} className="pass-flower" />
            <h2>社长，到你了</h2>
            <p>拿着 ¥{state.stats.budget}，带三位部长筹办樱花市集。</p>
            <button className="primary" onClick={onStart}>接手社团 <MoveRight size={17} /></button>
            <button className="start-options" onClick={onSetup}>选择场次与导演</button>
          </div>
        </div>}
        {won && <div className="celebration" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <i key={index} style={{ left: `${(index * 23) % 100}%`, animationDelay: `${index * 0.05}s` }} />
          ))}
        </div>}
      </div>
      <div className="scene-caption">
        <span><i className="dot rose" /> 海报 {posterCount}</span>
        <span><i className="dot purple" /> {['临时桌', '市集摊位', '摊位就绪'][boothLevel]}</span>
        <span><i className="dot green" /> 围观 {started ? visitorCount : 0}</span>
      </div>
    </section>
  );
}
