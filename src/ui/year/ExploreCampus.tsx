'use client';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CloudRain, DoorOpen, Hammer, MapPin, MessageSquare, Package, Signpost, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { places } from '../../year/content/clubs';
import { currentDecision, type Option } from '../../year/content/chapters';
import type { Action, ActorId, Person, PlaceId, TurnResult, World } from '../../year/model';
import { decisionArea, deskPoints, entrances, exitPoint, fairPreparation, fieldBoards, fieldFinish, fieldJobs, fieldPickup, routePickup, interiorArt, interiorSpawn, start,
  type Interior, type Point } from '../../year/view/exploration';
import { worldProjection } from '../../year/view/worldProjection';
import { useCampusWalk, type WalkTarget } from './useCampusWalk';

export type Interaction = 'decision' | 'strategy' | 'development' | 'ledger' | 'calendar' | 'yearbook';
type Tooltip = { id: string; name: string; line: string; go?: Interaction; call?: string; showChoices?: boolean };
type Prop = WalkTarget & { icon?: typeof BookOpen; person?: Person; description?: string; booth?: string; waypoint?: boolean };
type SceneChoice = { option: Option; legality: TurnResult };
type Approach = 'poster' | 'entrance';

const avatars: Record<ActorId, string> = {
  anan: 'anan', xiaoyu: 'xiaoyu', jiangyi: 'jiangyi', aning: 'visitor-gold',
  chenlan: 'visitor-blue', hemu: 'visitor-rose', linqi: 'visitor-rose', dushu: 'visitor-gold',
  qiutong: 'visitor-gold', wuyuan: 'visitor-blue',
};
const anchors: Record<PlaceId, Point> = {
  plaza: { x: 49, y: 58 }, stage: { x: 56, y: 41 }, workshop: { x: 73, y: 48 },
  library: { x: 25, y: 48 }, room: { x: 43, y: 82 },
};
const desks: Record<Interior, { label: string; go: Interaction; icon: typeof BookOpen }> = {
  room: { label: '社团事务桌', go: 'decision', icon: BookOpen },
  workshop: { label: '带教工作台', go: 'development', icon: Hammer },
  stage: { label: '舞台排班板', go: 'calendar', icon: BookOpen },
  library: { label: '校刊与活动账本', go: 'ledger', icon: BookOpen },
};

function actorBrief(world: World, actor: Person): Tooltip {
  const { id, name, activity, role } = actor;
  if (actor.status === 'leave') return { id, name, line: activity, go: 'calendar', call: '看这周的班次' };
  if (world.ended && world.campaign) return { id, name, line: '这一年发生的事都收进年鉴了。', go: 'yearbook', call: '一起翻年鉴' };
  if (world.window === 1 && currentDecision(world) && (id === 'chenlan' || id === 'anan')) return {
    id, name, line: id === 'chenlan' ? '我带来两张摄影样片。要在主路一起摆摊吗？' : '等你拍板，我就能把招新桌摆起来。',
    showChoices: true, call: '看看两处展台',
  };
  if (id === 'xiaoyu') return { id, name, line: `我在${activity}。这笔钱从哪来、去了哪，都写在这里。`,
    go: 'ledger', call: '打开账本' };
  if (world.campaign && (actor.club !== 'player' || id === 'jiangyi')) return {
    id, name, line: `${activity}。如果有想一起做的活动，可以当面聊聊。`, go: 'strategy', call: '谈一个合作',
  };
  if (world.campaign && (id === 'aning' || id === 'qiutong' || id === 'wuyuan')) return {
    id, name, line: `我在忙这件事：${activity}。也可以到工作台排一次练习。`, go: 'development', call: '去带教工作台',
  };
  return { id, name, line: `${role} · ${activity}`, go: 'calendar', call: '查看现场安排' };
}

export function ExploreCampus({ world, selected, started, hasSaves, onSelect, onScene, onOpen, onAction, busy,
  decision, choices, onAdvance, settling, error }: {
  world: World; selected: PlaceId; onSelect: (place: PlaceId) => void; onScene: () => void;
  started: boolean; hasSaves: boolean; decision?: string; choices: SceneChoice[];
  onOpen: (action: Interaction, opener: HTMLElement | null) => void;
  onAction: (action: Action) => void | Promise<void>; busy: boolean; onAdvance?: () => void;
  settling: boolean; error?: string;
}) {
  const view = useMemo(() => worldProjection(world), [world]);
  const jobs = useMemo(() => fieldJobs(world), [world]);
  const [scene, setScene] = useState<PlaceId>('plaza');
  const [speech, setSpeech] = useState<Tooltip | null>(null);
  const [bag, setBag] = useState<{ projectId: string; approach: Approach } | null>(null);
  const [checks, setChecks] = useState<Record<string, PlaceId>>({});
  const [completed, setCompleted] = useState<{id: string; window: number}>();
  const [feedback, setFeedback] = useState('');
  const [transition, setTransition] = useState(0);
  const current = view.places.find(place => place.id === (scene === 'plaza' ? selected : scene))!;
  const image = `/art/${scene === 'plaza' ? view.art : interiorArt[scene]}.webp`;
  const carried = jobs.find(item => item.project.id === bag?.projectId && item.kind === 'poster');
  const fair = jobs.find(item => item.kind === 'poster');
  const setup = jobs.find(item => item.kind === 'setup' && item.place === scene);
  const targets: Prop[] = [];
  const worksite = decisionArea(world);
  const savesNote = !started && hasSaves ? '以此开新学年' : undefined;
  const station = (id: string, point: Point, label: string, action: (source: HTMLElement | null) => void, icon: typeof BookOpen, kind: WalkTarget['kind'] = 'station') =>
    targets.push({ id, point, label, run: action, icon, kind,
      waypoint: kind === 'door' && Boolean(decision && (id === `door:${worksite}` || id === 'exit' && scene !== worksite)) });

  function complete(id: string, approach?: 'entrance') {
    if (busy) return;
    setFeedback('');
    setCompleted({ id, window: world.window });
    void onAction({ kind: 'fieldwork', projectId: id, ...(approach ? { approach } : {}) });
  }

  function go(place: PlaceId) {
    if (place === scene) return;
    const spawn = place === 'plaza' && scene !== 'plaza' ? { ...entrances[scene], y: Math.min(86, entrances[scene].y + (scene === 'room' ? -9 : 5)) } : interiorSpawn;
    walk.reset(spawn);
    setScene(place);
    onSelect(place);
    onScene();
    setSpeech(null);
    setFeedback('');
    setTransition(value => value + 1);
  }

  if (scene === 'plaza') {
    for (const [id, point] of Object.entries(entrances) as [Interior, Point][]) {
      station(`door:${id}`, point, `进入${places[id].label}`, () => go(id), DoorOpen, 'door');
    }
  } else {
    station('exit', exitPoint, '返回樱坡广场', () => go('plaza'), DoorOpen, 'door');
    const desk = desks[scene];
    station('desk', deskPoints[scene], desk.label, source => onOpen(world.campaign ? desk.go : 'decision', source), desk.icon);
  }
  if (decision && scene === worksite) {
    choices.forEach(({ option, legality }, i) => {
      const opening = decision === 'w1';
      const x = choices.length === 1 ? 50 : choices.length === 2 ? 32 + i * 36 : 23 + i * 27;
      const label = opening ? (option.id === 'join-photo' ? '联摆桌 · ¥40' : '竞位台 · ¥80') : option.label;
      targets.push({ id: `choice:${option.id}`, point: { x, y: opening ? 64 : 77 }, label, kind: 'choice',
        booth: opening ? `booth-${i}` : undefined, icon: opening ? undefined : Signpost, unavailable: !legality.ok,
        description: legality.ok ? (savesNote ?? (opening ? (option.id === 'join-photo' ? '一起摆摊' : '独立署名') : undefined)) : legality.message,
        run: () => {
          if (busy || !legality.ok) return;
          setSpeech(null);
          setFeedback('');
          void onAction({ kind: 'choose', decisionId: decision, optionId: option.id });
        },
      });
    });
  }
  if (scene === 'room' && fair) {
    const kits = [
      { id: 'poster-pickup', point: fieldPickup, label: '招新海报', approach: 'poster', icon: Package },
      { id: 'route-pickup', point: routePickup, label: '入口引导牌', approach: 'entrance', icon: Signpost },
    ] as const;
    for (const { id, point, label, approach, icon } of kits) {
      if (carried && bag?.approach === approach) continue;
      const result = fairPreparation(fair.project, approach);
      targets.push({ id, point, label: `${carried ? '换成' : '拿起'}${label}`, kind: 'task', icon,
        description: `预计接待 ${result.admitted} · 候补 ${result.waitlist}`,
        run: () => {
          if (busy) return;
          setBag({ projectId: fair.project.id, approach });
          setFeedback(`${approach === 'poster' ? '拿到了海报' : '拿到了引导牌'} · 送去${fair.location}`);
        },
      });
    }
  }
  if (carried?.place === scene && bag) {
    const entrance = bag.approach === 'entrance';
    station('poster-board', fieldBoards[scene], entrance ? '在入口立起引导牌' : '把海报贴到招新板',
      () => complete(carried.project.id, entrance ? 'entrance' : undefined), entrance ? Signpost : Package, 'task');
  }
  if (setup) {
    const ready = checks[setup.project.id] === scene;
    station('setup-test', ready ? fieldFinish : fieldBoards[scene], ready ? '确认入口动线' : '检查现场设备', () => {
      if (busy) return;
      if (ready) complete(setup.project.id);
      else { setChecks({ ...checks, [setup.project.id]: scene }); setFeedback('设备检查完成 · 再去另一侧确认入口'); }
    }, Hammer, 'task');
  }

  for (const place of view.places) {
    if (scene !== 'plaza' && scene !== place.id) continue;
    place.people.forEach((person, i) => {
      const base = scene === 'plaza' ? anchors[person.location] : { x: 48, y: 57 };
      const index = Object.keys(avatars).indexOf(person.id);
      targets.push({ id: person.id, label: `和${person.name}说话`, kind: 'person', person,
        point: { x: base.x + (i % 4 - 1) * (scene === 'plaza' ? 7.1 : 10), y: base.y - Math.floor(i / 4) * 9 + i % 2 * 6 },
        patrol: { phase: index * 1.45, pace: person.status === 'leave' ? .23 : .48 + index % 3 * .05,
          span: person.status === 'leave' ? 1.4 : person.activity.includes('整理') ? 2.6 : 3.7 + index % 2 },
        run: source => {
          const brief = actorBrief(world, person);
          if (speech?.id === person.id && brief.showChoices) showOpening();
          else if (speech?.id === person.id && brief.go) { setSpeech(null); onOpen(brief.go, source); }
          else { setSpeech(brief); setFeedback(''); }
        },
      });
    });
  }

  const walk = useCampusWalk(targets, scene);
  const priorYear = useRef(world.yearId);
  useEffect(() => {
    const previous = priorYear.current;
    if (previous === world.yearId) return;
    priorYear.current = world.yearId;
    if (previous === 'preview') return; // The first on-site decision starts the year in place.
    setScene('plaza');
    walk.reset(start);
    setBag(null);
    setChecks({});
    setCompleted(undefined);
    setSpeech(null);
    setFeedback('');
    // Reset local navigation when switching slots, preserving the opening route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.yearId]);
  const nearby = targets.find(target => target.id === walk.nearby);
  const talking = speech && targets.some(target => target.id === speech.id) ? speech : null;
  const fieldResult = completed?.window === world.window && world.facts[`field:${completed.id}`];
  const thing = bag?.approach === 'entrance' ? '引导牌' : '海报';
  const objective = carried ? `${thing}在手 · 到${carried.location}布置` :
    fair ? '去活动室选海报或引导牌 · 本次只能送一种' :
      setup ? `现场任务 · ${setup.project.name}` :
      decision && scene !== worksite ? `本期决策在${places[worksite].label}` :
      decision && !started ? '在两处展台选择做法即可开局' : null;
  const activeField = fieldResult ? '已登记 · 现场成果记入账本' : feedback || objective;

  function tapFloor(event: PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setSpeech(null);
    walk.moveTo({ x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 });
  }

  function showOpening() {
    setSpeech(null);
    if (scene === 'plaza') walk.moveTo({ x: 50, y: 71 });
  }

  return <section className="yr-map yr-explore" aria-label="校园地图" data-scene={scene}
    style={{ '--scene': `url(${image})` } as CSSProperties}>
    <img className="yr-map-image walk-background" key={image} src={image} fetchPriority="high" alt="" />
    <div className="walk-transition" key={transition} aria-hidden="true"/>
    <div className="yr-map-markers walk-floor" aria-label="可行走区域" onPointerDown={tapFloor}>
      {scene === 'plaza' && current.projects.length > 0 && <img className="walk-prop" src="/art/booth-1.png" alt=""
        style={{ left: `${current.id === 'plaza' ? 70 : anchors[current.id].x}%`, top: `${current.id === 'plaza' ? 54 : anchors[current.id].y - 5}%` }}/>}
      {targets.map(target => <button key={target.id} type="button"
        className={`walk-target walk-${target.kind}${target.id === nearby?.id ? ' walk-near' : ''}`}
        ref={element => { if (element) walk.nodes.current.set(target.id, element); else walk.nodes.current.delete(target.id); }}
        aria-label={target.label}
        data-target={target.id}
        data-waypoint={target.waypoint || undefined}
        aria-disabled={target.unavailable || undefined}
        style={{ left: `${target.point.x}%`, top: `${target.point.y}%`, '--walk-depth': Math.ceil(target.point.y) } as CSSProperties}
        onPointerEnter={() => {
          const destination = target.id.startsWith('door:') ? target.id.slice(5) as Interior : undefined;
          if (destination) { const art = new Image(); art.src = `/art/${interiorArt[destination]}.webp`; }
        }}
        onClick={event => { if (!target.unavailable) walk.walkTo(target, event.currentTarget); }}>
        {target.person ? <>
          <span className="walk-character"><img src={`/art/${avatars[target.person.id]}.png`} alt=""/></span>
          <span className="walk-name">{target.person.name}</span>
        </> : <>
          {target.booth && <img className="walk-choice-booth" src={`/art/${target.booth}.png`} alt=""/>}
          <span className="walk-target-label">{target.icon && <target.icon size={16}/>}<strong>{target.label}</strong></span>
          {target.description && <small>{target.description}</small>}
        </>}
      </button>)}
      <div ref={walk.player} className="walk-player" data-testid="walking-player" style={{ left: `${start.x}%`, top: `${start.y}%` }}>
        <span className="walk-character"><img src="/art/visitor-blue.png" alt=""/></span>
        {carried && (bag?.approach === 'entrance' ? <Signpost className="walk-carry" size={18}/> : <Package className="walk-carry" size={18}/>)}
        <span className="walk-name">你</span>
      </div>
    </div>
    <header className="yr-map-caption"><MapPin size={15}/>
      <strong>{scene === 'plaza' ? `${view.season}日校园` : places[scene].label}</strong>
      <span>{view.date.number === 16 && <CloudRain size={15}/>} {view.date.label}</span>
    </header>
    <div className="walk-hud">
      {activeField && <p className="walk-goal" role="status"><Package size={16}/>{activeField}</p>}
      {error && <p className="walk-goal" role="alert">{error}</p>}
      {talking ? <div className="walk-speech">
        <header><MessageSquare size={15}/><strong>{talking.name}</strong>
          <button aria-label="收起对话" className="walk-close" onClick={() => setSpeech(null)}><X size={15}/></button>
        </header>
        <p>{talking.line}</p>
        {(talking.showChoices || talking.go) && <button className="walk-speech-action"
          onClick={event => talking.showChoices ? showOpening() : onOpen(talking.go!, event.currentTarget)}>{talking.call}</button>}
      </div> : <button className="walk-interact" disabled={!nearby} aria-label={nearby?.label ?? '互动'}
        onClick={event => nearby && walk.activate(nearby.id, event.currentTarget)}>
        <kbd>E</kbd> <span>{nearby?.label ?? '靠近人物或入口'}</span>
      </button>}
      <small className="walk-keyboard">WASD / 方向键移动 · 走进门口换场 · 靠近后按 E</small>
    </div>
    {(onAdvance || settling) && <button type="button" className="walk-close-period"
      title={carried ? '手上的物资尚未布置' : undefined}
      disabled={busy || !onAdvance} onClick={onAdvance}>{settling ? '部长们正在收尾' : '收工结算'}{!settling && <ArrowRight size={15}/>}</button>}
    <div className="walk-dpad" aria-label="触屏移动">
      {([[ArrowUp, '向上走', 'ArrowUp'], [ArrowLeft, '向左走', 'ArrowLeft'],
        [ArrowDown, '向下走', 'ArrowDown'], [ArrowRight, '向右走', 'ArrowRight']] as const).map(([Icon, label, key]) =>
        <button key={key} type="button" aria-label={label} className={key}
          onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); walk.hold(key, true); }}
          onPointerUp={() => walk.hold(key, false)} onPointerCancel={() => walk.hold(key, false)}
          onLostPointerCapture={() => walk.hold(key, false)}><Icon size={19}/></button>)}
    </div>
    <div className="walk-location" aria-label="地点动态">
      <strong>{current.label}</strong>
      {current.projects.map(p => <span key={p.id}>
        {p.name} · {[p.lead, ...p.partners].map(id => world.clubs[id].label).join(' × ')}
        <small> · {p.stage === 'complete' ? `入场 ${p.attendance} · 候补 ${p.signups - p.attendance}` : `报名 ${p.signups} · 容量 ${p.capacity}`}</small>
      </span>)}
    </div>
  </section>;
}
