'use client';

import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, Coins, Download, Flower2, GripHorizontal, Maximize, Minimize, RotateCcw, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { chapters, dateAt, windowAt } from '../../year/calendar';
import { currentDecision } from '../../year/content/chapters';
import { places } from '../../year/content/clubs';
import { execute, makeCommand, quietWindow } from '../../year/engine/reducer';
import type { Action, PlaceId, ScenarioId, World, WorldEvent } from '../../year/model';
import { newWorld, scenarios } from '../../year/content/scenarios';
import { nextOrigin, nominees } from '../../year/engine/succession';
import { hasQuickSave } from '../../year/storage/migration';
import type { Mode } from '../../year/storage/replay';
import { ExploreCampus, type Interaction } from './ExploreCampus';
import { useYear } from './useYear';
import { StrategyPanel } from './StrategyPanel';
import { DevelopmentPanel, Yearbook } from './CampaignPanels';
import { useFloatingPanel } from './useFloatingPanel';

type Tab = 'people' | 'clubs' | 'calendar' | 'ledger' | 'strategy' | 'development' | 'yearbook';
const tabs: {id: Tab; label: string}[] = [{ id: 'people', label: '人物' }, { id: 'clubs', label: '社团' }, { id: 'calendar', label: '周历' }, { id: 'ledger', label: '账本' }];
const extendedTabs: typeof tabs = [{ id: 'strategy', label: '谈判' }, { id: 'development', label: '带教' }];
const cash = (amount: number) => (amount / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const groupLabels: Record<PlaceId, string> = { plaza: '广场', stage: '舞台', workshop: '工坊', library: '外廊', room: '活动室' };

function Log({ events, initialFocus }: {events: WorldEvent[]; initialFocus?: string}) {
  const [focus, setFocus] = useState<string | null>(initialFocus ?? null);
  const byId = new Map(events.map(event => [event.id, event]));
  const current = focus && byId.get(focus);
  const render = (event: WorldEvent) => <li key={event.id} className={`yr-log-event ${event.source}`}>
    <span>第 {event.window} 窗口 · {event.source === 'model' ? '实时 AI' : event.source === 'player' ? '玩家' : '规则'}</span>
    <strong>{event.title}</strong><p>{event.detail}</p>
    {event.traceId && <small>模型记录 {event.traceId.slice(0, 8)}</small>}
    {event.causes.length > 0 && <div className="yr-causes">{event.causes.map(cause => {
      const original = byId.get(cause);
      return original ? <button key={cause} onClick={() => setFocus(cause)}>起因 · {original.title}</button> : null;
    })}</div>}
  </li>;
  return <>{current && <div className="yr-root-event"><button className="yr-ghost" onClick={() => setFocus(null)}>返回全部记录</button><ul>{render(current)}</ul></div>}
    {!current && <ul className="yr-log">{events.toReversed().map(render)}</ul>}{!events.length && <p>确认第一个展位方案后，账本会记录发生的事。</p>}</>;
}

function Detail({ world, history, tab, logFocus }: {world: World; history: WorldEvent[]; tab: Tab; logFocus?: string}) {
  if (tab === 'ledger') return <Log events={history} initialFocus={logFocus} />;
  if (tab === 'people') return <div className="yr-rows">{Object.values(world.people).filter(person => person.status !== 'incoming').map(person => (
    <article key={person.id} className="yr-row"><header><strong>{person.name} · {person.role}</strong><small>{groupLabels[person.location]}</small></header>
      <p>{person.activity}</p><small>目标 · {person.goal}／精力 {person.energy}／经历 {person.experience}</small></article>
  ))}</div>;
  if (tab === 'clubs') return <div className="yr-rows">
    {Object.values(world.clubs).map(club => <article className="yr-row" key={club.id}>
      <header><strong>{club.label}</strong><small>¥{cash(club.cash)}{club.held ? ` · 冻结 ¥${cash(club.held)}` : ''}</small></header>
      <p>{club.plan}</p><small>公共声誉 {club.reputation}</small>
      {Object.values(world.relationships).filter(tie => tie.from === club.id).map(tie => <small className="yr-tie" key={tie.to}>
        → {world.clubs[tie.to as keyof World['clubs']]?.label ?? tie.to} · 信任 {tie.trust} · 一致 {tie.alignment} · 纽带 {tie.bond}{tie.conflicts.length ? ` · 争议 ${tie.conflicts.length}` : ''}
      </small>)}
    </article>)}
  </div>;
  const today = windowAt(world.window).from;
  const upcoming = Object.values(world.reservations).filter(item => item.status === 'confirmed' && item.to > today).sort((a,b) => a.from - b.from);
  return <div className="yr-rows">
    {upcoming.map(item => {
      const [type, id] = item.resourceId.split(':');
      const label = type === 'person' ? world.people[id as keyof World['people']]?.name : type === 'venue' ? places[id as PlaceId]?.label : { tables: '折叠桌', camera: '相机', speakers: '音箱', canopy: '雨棚' }[id];
      return <article className="yr-row" key={item.id}><header><strong>{label}</strong><small>{world.clubs[item.owner].label}</small></header>
        <p>{dateAt(item.from)} – {dateAt(item.to)}</p><small>{world.projects[item.projectId]?.name ?? (item.projectId === 'book-loan' ? '短期借用承诺' : '自主排班')}</small></article>;
    })}
    {!upcoming.length && <p>当前没有尚未结束的预约。</p>}
    {Object.values(world.commitments).map(item => <article className="yr-row" key={item.id}>
      <header><strong>{world.clubs[item.debtor].label} → {world.clubs[item.beneficiary].label}</strong>
        <small>{item.status === 'fulfilled' ? '已兑现' : item.status === 'overdue' ? '逾期' : '待兑现'}</small></header>
      <p>{item.kind === 'loan' ? '归还折叠桌' : item.kind === 'aid' ? '侧门引导' : '联办分工'} · 第 {item.dueWindow} 窗口到期</p>
    </article>)}
  </div>;
}

export function YearShell({ liveAvailable, initiallyLive, seed, initialScenario }: {liveAvailable: boolean; initiallyLive: boolean; seed: string; initialScenario: ScenarioId}) {
  const game = useYear();
  const [mode, setMode] = useState<Mode>(liveAvailable && initiallyLive ? 'live' : 'demo');
  const [focusPlace, setFocusPlace] = useState<{ window: number; place: PlaceId } | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [logFocus, setLogFocus] = useState<string | undefined>();
  const [quick, setQuick] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panelHidden, setPanelHidden] = useState(false);
  const [scenario, setScenario] = useState(initialScenario);
  const shell = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const floating = useFloatingPanel(panel, expanded);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { setQuick(hasQuickSave()); }, []);
  useEffect(() => {
    const change = () => setExpanded(document.fullscreenElement === shell.current);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !dialog.current?.open) setExpanded(false); };
    document.addEventListener('fullscreenchange', change);
    window.addEventListener('keydown', key);
    return () => { document.removeEventListener('fullscreenchange', change); window.removeEventListener('keydown', key); };
  }, []);

  async function fullscreen() {
    if (expanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setExpanded(false);
    } else {
      try { if (shell.current?.requestFullscreen) await shell.current.requestFullscreen(); }
      catch { /* Fill the viewport if the browser refuses native full screen. */ }
      setExpanded(true);
    }
  }

  function openTab(name: Tab, button: HTMLElement | null, eventId?: string) {
    setTab(name);
    setLogFocus(eventId);
    opener.current = button;
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  function openFromScene(action: Interaction, source: HTMLElement | null) {
    if (!game.archive && action !== 'decision') return;
    if (action !== 'decision') { openTab(action, source); return; }
    setPanelHidden(false);
    requestAnimationFrame(() => {
      if (!expanded) panel.current?.scrollIntoView({ block: 'nearest' });
      panel.current?.focus({ preventScroll: true });
    });
  }

  const archive = game.archive;
  const previewWorld = useMemo(() => newWorld('preview', seed, { scenario }), [seed, scenario]);
  const world = archive?.world ?? previewWorld;
  const year = 2025 + (world.campaign?.origin.carry?.season ?? 1);
  const navigation = [...tabs, ...(world.campaign ? extendedTabs : []), ...(world.ended && world.campaign ? [{ id: 'yearbook', label: '年鉴' } as const] : [])];
  const carry = nextOrigin(world);
  const period = windowAt(world.window);
  const history = archive?.receipts.flatMap(receipt => receipt.events) ?? [];
  const currentProject = Object.values(world.projects).find(project => project.lead === 'player' && project.dueWindow === world.window);
  const place = focusPlace?.window === world.window ? focusPlace.place : currentProject?.place ??
    (world.window === 6 && world.projects['music-photo'] ? 'stage' : world.window === 14 ? 'workshop' : world.window >= 22 ? 'room' : 'plaza');
  const headlines = history.filter(event => ['agreement','opportunity','year_end','project','rival','conflict','commitment','chapter'].includes(event.type)).slice(-3).toReversed();
  const decision = useMemo(() => currentDecision(world), [world]);
  const applications = Object.values(world.applications).filter(item => item.window === world.window && item.status === 'pending');
  const disabled = game.busy || game.waiting;
  const sceneChoices = useMemo(() => decision?.options.map(option => ({
    option, legality: execute(world, makeCommand(world, 'preview', { kind: 'choose', decisionId: decision.id, optionId: option.id })),
  })) ?? [], [world, decision]);
  const grant = world.grants.anan;
  const hasGrant = Boolean(grant && grant.expiresWindow >= world.window);
  const source = archive?.receipts.findLast(receipt => receipt.command.action.kind === 'advance')?.events;
  const sourceLabel = source?.some(event => event.source === 'model') ? '上次结算 · 实时 AI' :
    source?.some(event => event.type === 'director') ? '上次结算 · 规则接管' : '规则可复现';

  function actFromScene(action: Action) {
    if (archive) return game.submit(action);
    if (action.kind === 'choose') return game.start(seed, mode, false, { scenario }, action);
  }

  return <div className={`yr-shell ${expanded ? 'yr-expanded' : ''}`} ref={shell}>
    <header className="yr-header">
      <Link className="yr-brand" href="/campus-chaos/year"><Flower2 size={20} /><span>珞珈社团风云</span></Link>
      <div className="yr-header-tools"><span className="yr-mode">{archive?.mode === 'live' ? '实时导演' : '固定种子'}</span>
        {expanded && <button className="yr-ghost" onClick={() => setPanelHidden(hidden => !hidden)} aria-controls="yr-decision">
          {panelHidden ? '打开决策' : '隐藏决策'}
        </button>}
        <button className="yr-ghost yr-full" onClick={() => void fullscreen()}>{expanded ? <Minimize size={16} /> : <Maximize size={16} />} <span>{expanded ? '退出全屏' : '全屏'}</span></button>
        <Link href="/campus-chaos">{quick ? '五日存档' : '五日挑战'}</Link>
      </div>
    </header>
    <main className="yr-main">
      <div className="yr-heading"><div><p><CalendarDays size={15} /> {year}–{year+1} 学年 · {period.semester}</p><h1>{archive ? period.chapter.title : '从九月，到六月'}</h1>
        <div>{archive ? period.chapter.goal : '争下第一处展位，把社团交给下一任。'}</div></div>
        <div className="yr-budget"><Coins size={19} /><div><small>可用经费</small><strong>¥{cash(world.clubs.player.cash - world.clubs.player.held)}</strong></div></div>
      </div>
      <ol className="yr-timeline" aria-label="学年章节">{chapters.map(chapter => <li key={chapter.id}
        aria-current={period.chapter.id === chapter.id ? 'step' : undefined} className={chapter.first <= world.window ? 'visited' : ''}>
        <i /><span>{chapter.title}</span></li>)}</ol>
      <div className="yr-play">
        <ExploreCampus world={world} selected={place} started={Boolean(archive)} hasSaves={Boolean(game.saves.length)}
          onSelect={place => setFocusPlace({ window: world.window, place })}
          onScene={() => { if (expanded) setPanelHidden(true); }}
          onOpen={openFromScene} onAction={actFromScene} busy={disabled} decision={decision?.id}
          choices={sceneChoices} onAdvance={archive && !decision && !applications.length && !world.ended ? () => { void game.advance(); } : undefined}
          settling={game.waiting} error={expanded && panelHidden ? game.error : undefined}/>
        <section ref={panel} id="yr-decision" tabIndex={-1} hidden={expanded && panelHidden}
          className={`yr-panel${floating.dragging ? ' yr-panel-dragging' : ''}`}
          style={floating.style} aria-label={archive ? '本期决策' : '学年档案'}>
          {expanded && <div className="yr-panel-handle">
            <button type="button" className="yr-panel-grip" {...floating.gripProps} aria-label="拖动决策卡"
              title="拖动决策卡，或用方向键移动"><GripHorizontal size={19}/>拖动</button>
            <button type="button" className="yr-panel-home" onClick={floating.reset}
              aria-label="重置决策卡位置" title="重置位置"><RotateCcw size={15}/></button>
          </div>}
          {!archive ? <>
            <span className="yr-kicker">2026 年 9 月 1 日 · 樱坡广场</span>
            <h2>社团第一天</h2>
            <p>{scenarios[scenario].story} 可以先逛校园，到广场选摊位就开局。</p>
            <label className="yr-mode-select">开局背景
              <select value={scenario} onChange={event => setScenario(event.target.value as ScenarioId)}>
                {Object.entries(scenarios).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
              </select>
            </label>
            <Link className="yr-scenario-link" href="/campus-chaos/year/scenarios">比较四种开局</Link>
            <label className="yr-mode-select">导演方式
              <select value={mode} onChange={event => setMode(event.target.value as Mode)}>
                <option value="demo">固定种子</option>{liveAvailable && <option value="live">实时 AI</option>}
              </select>
            </label>
            <button className="yr-primary" disabled={disabled} onClick={() => void game.start(seed, mode, false, { scenario })}>开始学年 <ArrowRight size={17} /></button>
            {game.saves.length > 0 && <div className="yr-archive-list">
              {game.saves.map((save, i) => <button className="yr-ghost" key={save.id} disabled={disabled} onClick={() => void game.open(save.id)}>
                {save.ended ? '回看六月档案' : i === 0 ? '继续最近学年' : '继续学年'} · {windowAt(save.window)?.label ?? '存档'} <ChevronRight size={15} />
                {save.origin && <small>{scenarios[save.origin.scenario].label}{save.origin.carry ? ` · 第 ${save.origin.carry.season} 学年` : ''}</small>}
              </button>)}
            </div>}
            <label className="yr-import">导入年度 JSON <input type="file" accept=".json,application/json" disabled={disabled} onChange={event => {
              const file = event.currentTarget.files?.[0];
              if (file) void game.importFrom(file);
              event.currentTarget.value = '';
            }}/></label>
            {game.error && <button className="yr-ghost" onClick={() => void game.start(seed, mode, true, { scenario })}>在当前标签临时试玩</button>}
          </> : <>
            <div className="yr-panel-top"><span className="yr-kicker">第 {world.window} / 24 窗口</span><span>{sourceLabel}</span></div>
            {expanded && <div className="yr-panel-top"><span>{period.chapter.title}</span><strong>可用 ¥{cash(world.clubs.player.cash - world.clubs.player.held)}</strong></div>}
            {world.ended && world.ending ? <>
              <h2>六月交接完成</h2><p>{world.ending.resolution}。</p>
              <ul className="yr-ending"><li>移交结余 ¥{cash(world.ending.retainedCents)}</li>
                <li>本社完成 {Object.values(world.projects).filter(project => project.lead === 'player' && project.stage === 'complete').length} 项活动</li>
                <li>待接续承诺和应付款 {world.ending.activeCommitments.length + (world.campaign?.debts.length ?? 0)} 项</li></ul>
              <button className="yr-primary" onClick={game.download}><Download size={16} /> 导出年度档案</button>
              {world.campaign && <button className="yr-ghost" onClick={event => openTab('yearbook', event.currentTarget)}>翻阅年度年鉴</button>}
              {carry && <button className="yr-ghost" disabled={disabled} onClick={() => void game.start(world.seed, archive.mode, game.transient, carry)}>交给下一届</button>}
            </> : decision ? <>
              <h2>{decision.title}</h2><p>{decision.story}</p>
              <div className="yr-choices">{sceneChoices.map(({ option, legality }) => {
                const action = { kind: 'choose', decisionId: decision.id, optionId: option.id } as const;
                return <button key={option.id} disabled={disabled || !legality.ok} onClick={() => void game.submit(action)} className="yr-choice">
                  <span><strong>{option.label}</strong><small>{legality.ok ? option.preview : legality.message}</small></span><ChevronRight size={16} />
                </button>;
              })}</div>
            </> : <><h2>{game.waiting ? '人物正在安排下一步' : '校园晨报'}</h2>
              {headlines.length ? <ul className="yr-headlines">{headlines.map(event => <li key={event.id}>
                <button className="yr-headline-link" onClick={click => openTab('ledger', click.currentTarget, event.id)}>
                  {event.type === 'project' ? event.detail : event.title}
                </button></li>)}</ul> : <p>这段时间可以查看社团或继续推进。</p>}
            </>}
            {applications.map(application => <article className="yr-application" key={application.id}>
              <strong>{world.people[application.actorId].name}申请 ¥{cash(application.cents)} 宣传费</strong>
              <div><button disabled={disabled || world.clubs.player.cash - world.clubs.player.held < application.cents} className="yr-ghost"
                onClick={() => void game.submit({ kind: 'application', id: application.id, accept: true })}>批准</button>
              <button disabled={disabled} className="yr-ghost" onClick={() => void game.submit({ kind: 'application', id: application.id, accept: false })}>谢绝</button></div>
            </article>)}
            {!world.ended && world.campaign?.queue?.stage === 'open' && <article className="yr-application">
              <strong>候补 {world.campaign.queue.amount} 人 · 第 {world.campaign.queue.due} 窗口截止</strong>
              <div className="yr-contract-tools">{(['expand', 'stagger', 'small'] as const).map(method => {
                  const action = { kind: 'queue', method } as const;
                  const check = execute(world, makeCommand(world, 'queue-preview', action));
                  return <button className="yr-ghost" key={method} title={check.ok ? undefined : check.message}
                    disabled={disabled || !check.ok} onClick={() => void game.submit(action)}>
                    {{ expand: '增开入口', stagger: '分时入场', small: '小场退款' }[method]}</button>;
                })}</div>
            </article>}
            {!world.ended && world.campaign?.debts.map((debt, index) => <article className="yr-application" key={`${debt.club}-${index}`}>
              <strong>交接应付款 · {world.clubs[debt.club].label} ¥{cash(debt.cents)}</strong>
              <button className="yr-ghost" disabled={disabled || world.clubs.player.cash - world.clubs.player.held < debt.cents}
                onClick={() => void game.submit({ kind: 'debt', index })}>结清应付款</button>
            </article>)}
            {!world.ended && world.window >= 22 && world.choices['22'] && world.campaign && !world.campaign.playerVote && <article className="yr-application">
              <strong>你的换届票</strong>
              <div className="yr-contract-tools">{[...nominees(world).map(person => ({ id: person.id, name: person.name })),
                { id: 'rotation' as const, name: '轮值组' }].map(person => <button key={person.id} className="yr-ghost"
                  disabled={disabled} onClick={() => void game.submit({ kind: 'vote', nominee: person.id })}>投给{person.name}</button>)}</div>
            </article>}
            {!world.ended && <>
              {!world.campaign && <button className="yr-ghost" disabled={disabled} onClick={() => void game.upgrade()}>在副本中解锁谈判与带教</button>}
              <button className="yr-ghost yr-grant" disabled={disabled} onClick={() => void game.submit({ kind: 'grant', actorId: 'anan', enabled: !hasGrant })}>
                {hasGrant ? `撤回阿南授权 · 已用 ¥${cash(grant!.spent)}` : '给阿南 ¥40 宣传授权'}
              </button>
              {game.waiting ? <button className="yr-primary" onClick={game.skip}>用本地规则继续 <ArrowRight size={16} /></button> :
                <button className="yr-primary" disabled={disabled || Boolean(decision) || Boolean(applications.length)} onClick={() => void game.advance()}>
                  {world.window === 24 ? '完成六月交接' : '结算并推进'} <ArrowRight size={16} />
                </button>}
              {quietWindow(world) && <button className="yr-ghost" disabled={disabled} onClick={() => void game.fastForward()}>
                {archive.mode === 'live' ? '按本地规则快进' : '快进到下一件事'}
              </button>}
            </>}
          </>}
          {game.error && <div className="yr-error" role="alert">{game.error}
            {archive && !game.transient && <button onClick={() => void game.open(world.yearId)} className="yr-ghost">读取最新进度</button>}
          </div>}
        </section>
      </div>
      {archive && <footer className="yr-footer">
        <div>{navigation.map(item => <button className="yr-ghost" key={item.id} onClick={event => openTab(item.id, event.currentTarget)}>
          {item.id === 'people' ? <Users size={16} /> : item.id === 'ledger' ? <BookOpen size={16} /> : <CalendarDays size={16} />}{item.label}</button>)}</div>
        <div><small><CheckCircle2 size={14} /> {game.transient ? '临时档，离开前请导出' : archive.recovered ? '已从账本恢复' : '已保存到本机'}</small>
          <button className="yr-ghost" onClick={game.download} aria-label="导出档案"><Download size={16} /></button>
          <button className="yr-ghost" disabled={disabled} onClick={game.returnToMenu}>档案</button></div>
      </footer>}
      <p className="yr-fiction">虚构校园与社团 · 非校方信息</p>
    </main>

    <dialog ref={dialog} className="yr-dialog" onClose={() => opener.current?.focus()} aria-label={navigation.find(item => item.id === tab)?.label ?? '详情'}>
      <header><h2>{navigation.find(item => item.id === tab)?.label}</h2>
        <form method="dialog"><button className="yr-ghost" aria-label="关闭详情"><X size={20} /></button></form></header>
      {tab === 'strategy' && world.campaign ? <StrategyPanel key={world.yearId} world={world} live={archive?.mode === 'live'} submit={game.submit} disabled={disabled} /> :
        tab === 'development' && world.campaign ? <DevelopmentPanel key={world.yearId} world={world} submit={game.submit} disabled={disabled} /> :
        tab === 'yearbook' ? <Yearbook world={world} history={history} live={archive?.mode === 'live'} /> :
        tab && <Detail key={`${tab}:${logFocus ?? ''}`} world={world} history={history} tab={tab} logFocus={logFocus} />}
    </dialog>
  </div>;
}
