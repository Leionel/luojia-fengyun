'use client';

import {
  ArrowRight, BookOpen, CalendarDays, Check, CircleHelp, ClipboardCheck, Coins,
  Flower2, Handshake, HeartHandshake, MapPin, Maximize, Megaphone, Minimize, RotateCcw, Sparkles, Store, Users, X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { events } from '../game/events';
import { actions, maxTurns, npcIds, npcs, scenarioIds, type Effect, type GameState, type RunMode, type ScenarioId } from '../game/model';
import { offers } from '../game/offers';
import { actionBlock, actionDetails, actionEffect, getAttendance, getOutcome, previewEffect } from '../game/rules';
import { scenarios } from '../game/scenarios';
import { Avatar, Courtyard, moodText } from './Courtyard';
import { useCampusRun, type RunOptions } from './useCampusRun';

const modes = { demo: '演示模式', live_ai: '实时 AI', fallback: '降级模式' };
const resources = [
  { key: 'budget', label: '剩余预算', icon: Coins, tone: 'amber' },
  { key: 'signups', label: '报名 / 接待上限', icon: Users, tone: 'rose' },
  { key: 'readiness', label: '活动准备度', icon: ClipboardCheck, tone: 'purple' },
  { key: 'cohesion', label: '团队凝聚力', icon: HeartHandshake, tone: 'green' },
] as const;
const statLabels = { budget: '预算', signups: '报名', capacity: '接待', readiness: '准备', cohesion: '凝聚', reputation: '声誉' };
const actionIcons = {
  PRINT_POSTERS: Megaphone, BUILD_BOOTH: Store, REHEARSE: ClipboardCheck,
  CLUB_ALLIANCE: Handshake, SEEK_SPONSOR: Coins, RESOLVE_CONFLICT: HeartHandshake,
};
const actionTones = {
  PRINT_POSTERS: 'rose', BUILD_BOOTH: 'amber', REHEARSE: 'purple',
  CLUB_ALLIANCE: 'green', SEEK_SPONSOR: 'amber', RESOLVE_CONFLICT: 'rose',
};
const signed = (value: number) => value > 0 ? `+${value}` : `−${Math.abs(value)}`;

function Effects({ effect, hideBudget = false }: { effect: Effect; hideBudget?: boolean }) {
  return <span className="effects">
    {Object.entries(effect).map(([stat, value]) => {
      const key = stat as keyof Effect;
      if (key === 'budget' && hideBudget) return null;
      return <span key={key} className={value < 0 ? 'negative' : ''}>
        {statLabels[key]} {signed(value)}{key === 'budget' ? ' 元' : ''}
      </span>;
    })}
  </span>;
}

function Hud({ state }: { state: GameState }) {
  const latest = state.history.findLast(entry => entry.delta);
  const { goals } = scenarios[state.scenario];
  const attendance = getAttendance(state.stats);
  return <section className="hud" aria-label="社团资源">
    {resources.map(({ key, label, icon: Icon, tone }) => {
      const value = state.stats[key];
      const goal = key === 'budget' ? undefined : key === 'signups' ? goals.attendance : goals[key];
      const reached = key === 'signups' ? attendance.admitted : value;
      const delta = latest?.delta?.[key] ?? (key === 'signups' ? latest?.delta?.capacity : undefined);
      return <div className={`resource ${tone}`} key={key}>
        <span className="resource-icon"><Icon size={19} /></span>
        <div className="resource-data">
          <span className="resource-label">{label}</span>
          <div className="resource-value">
            <span data-testid={key}>{key === 'budget' && <small>¥</small>}{value}</span>
            {key === 'signups' && <span className="resource-goal">/ <b data-testid="capacity">{state.stats.capacity}</b></span>}
            {goal && key !== 'signups' && <span className="resource-goal">/ {goal}</span>}
            {delta ? <span key={`${state.history.indexOf(latest!)}-${key}`} className={`delta ${delta < 0 ? 'negative' : ''}`}>{signed(delta)}</span> : null}
          </div>
          {goal && <div className="meter"><i style={{ width: `${Math.min(100, reached / goal * 100)}%` }} /></div>}
        </div>
      </div>;
    })}
  </section>;
}

function Modal({ dialogRef, title, children }: {
  dialogRef: React.RefObject<HTMLDialogElement | null>; title: string; children: ReactNode;
}) {
  return <dialog ref={dialogRef} className="modal" aria-label={title}>
    <div className="modal-top"><h2>{title}</h2>
      <form method="dialog"><button className="icon-button" aria-label="关闭"><X size={19} /></button></form>
    </div>
    {children}
  </dialog>;
}

export function CampusGame(options: RunOptions) {
  const { state, started, mode, runMode, restored, begin, respond, chooseAction, skipDirector, useOffer, setUseOffer } = useCampusRun(options);
  const [cinema, setCinema] = useState(false);
  const [scenarioChoice, setScenarioChoice] = useState<ScenarioId>(options.startingScenario);
  const [modeChoice, setModeChoice] = useState<RunMode>(options.startingMode);
  const shell = useRef<HTMLDivElement>(null);
  const help = useRef<HTMLDialogElement>(null);
  const journal = useRef<HTMLDialogElement>(null);
  const restart = useRef<HTMLDialogElement>(null);
  const actionSection = useRef<HTMLElement>(null);
  const incidentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let enteredNative = false;
    function syncFullscreen() {
      if (document.fullscreenElement === shell.current) enteredNative = true;
      else if (enteredNative) {
        enteredNative = false;
        setCinema(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !document.fullscreenElement && !shell.current?.querySelector('dialog[open]')) setCinema(false);
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  async function toggleFullscreen() {
    if (cinema) {
      setCinema(false);
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
    } else {
      setCinema(true);
      try { await shell.current?.requestFullscreen?.(); } catch { /* Use the full viewport layout. */ }
    }
  }

  function startRun(seed: string, scenario: ScenarioId, selectedMode: RunMode) {
    if (restart.current?.open) restart.current.close();
    begin(seed, scenario, selectedMode);
    requestAnimationFrame(() => {
      const first = actionSection.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      first?.focus({ preventScroll: true });
    });
  }

  function openSetup() {
    setScenarioChoice(state.scenario);
    setModeChoice(runMode);
    restart.current?.showModal();
  }

  const incident = state.incident;
  const event = incident && events[incident.eventId];
  const offer = incident?.offerId ? offers[incident.offerId] : null;
  const waiting = state.phase === 'directing';
  const finished = state.phase === 'finished';
  const scenario = scenarios[state.scenario];
  const outcome = finished ? getOutcome(state.stats, state.scenario) : null;
  const settlingIncident = Boolean(incident && !incident.responded);
  const latestResponse = incident?.responded && state.history.at(-1)?.kind === 'response' ? state.history.at(-1) : undefined;
  const newSeed = () => `sakura-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;

  useEffect(() => {
    if ((state.turn > 1 && state.phase === 'ready') || state.phase === 'finished') {
      incidentHeading.current?.focus({ preventScroll: true });
    }
  }, [state.turn, state.phase]);

  return (
    <div className={`game-shell ${cinema ? 'cinema' : ''} ${state.scenario}`} ref={shell}>
      <header className="topbar">
        <div className="top-inner">
          <div className="wordmark"><span><Flower2 size={21} /></span>珞珈社团风云</div>
          <div className="top-tools">
            <span className={`mode ${mode}`} title={mode === 'fallback' ? '本回合由本地规则接管' : undefined}><i />{modes[mode]}</span>
            <button className="text-button top-journal" onClick={() => journal.current?.showModal()}><BookOpen size={17} /> <span>回合日志</span></button>
            <button className="icon-button fullscreen-toggle" aria-label={cinema ? '退出全屏' : '进入全屏'} title={cinema ? '退出全屏' : '进入全屏'}
              onClick={() => void toggleFullscreen()}>{cinema ? <Minimize size={18} /> : <Maximize size={18} />}
              <span>{cinema ? '退出全屏' : '全屏游玩'}</span></button>
            <button className="icon-button" aria-label="玩法说明" title="玩法说明" onClick={() => help.current?.showModal()}><CircleHelp size={20} /></button>
            {started && <button className="icon-button" aria-label="重新开始" title="重新开始" onClick={openSetup}><RotateCcw size={17} /></button>}
          </div>
        </div>
      </header>

      <main className="board">
        <div className="game-heading">
          <div>
            <h1>{state.scenario === 'rain' ? '雨天也要开市' : '办好樱花市集'}</h1>
            <p>接待 {scenario.goals.attendance} 人 · 准备度 {scenario.goals.readiness} · 凝聚力 {scenario.goals.cohesion}{restored && ' · 已恢复进度'}</p>
          </div>
          <div className="calendar" role="group" aria-label={finished ? '五回合已结束' : `第 ${state.turn} 天，共五天`}>
            <div><CalendarDays size={16} /><span>{finished ? '筹备结束' : <>第 <b>{state.turn}</b> / {maxTurns} 天</>}</span></div>
            <div className="days" aria-hidden="true">{Array.from({ length: maxTurns }, (_, index) => (
              <i key={index} className={finished || index < state.turn - 1 ? 'past' : index === state.turn - 1 ? 'today' : ''} />
            ))}</div>
          </div>
        </div>
        <Hud state={state} />

        <div className="play-grid">
          <Courtyard state={state} started={started} onStart={() => startRun(options.startingSeed, state.scenario, runMode)}
            onSetup={openSetup} onFullscreen={() => void toggleFullscreen()} cinema={cinema} />
          <section className="situation" aria-label="今日局势">
            <div className="situation-heading"><span><Sparkles size={16} /> {finished ? '市集结局' : '今日局势'}</span>
              {incident && <span className="event-source">{incident.mode === 'demo' && runMode === 'live_ai' ? '规则局势' : modes[incident.mode]}</span>}</div>
            <div className="situation-body" aria-live="polite">
              <h2 ref={incidentHeading} tabIndex={-1}>{outcome?.title ?? (waiting ? '社员正在商量' : event?.title ?? scenario.opening.title)}</h2>
              {outcome ? <p>{outcome.won ? `${outcome.admitted} 人能入场${outcome.waiting ? `，还有 ${outcome.waiting} 人候补` : '，报名的同学都能参加'}。` : '查看还差多少，以及这五天的决策记录。'}</p>
                : waiting ? <><p>你的行动已生效，正在确认下一天的突发状况。</p>
                  <button className="compact-button" onClick={skipDirector}>跳过等待，使用本地规则 <ArrowRight size={14} /></button></>
                : <p>{incident && event ? <><strong className={npcs[event.npc].color}>{npcs[event.npc].name} · </strong>{incident.line}</> : scenario.opening.line}</p>}
              {!finished && latestResponse && <div className="resolved"><Check size={14} /> {latestResponse.label}</div>}
            </div>
            {settlingIncident && event?.choices && <div className="incident-actions">
              {event.choices.map(({ label, effect, flag }, index) => (
                <button key={label} className="incident-option" onClick={() => {
                  respond(index === 0 ? 0 : 1);
                  requestAnimationFrame(() => (shell.current?.querySelector<HTMLElement>('.offer-card input') ??
                    actionSection.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true }));
                }}
                  disabled={state.stats.budget + (effect.budget ?? 0) < 0}>
                  <span className="incident-label">{label}<ArrowRight size={14} /></span>
                  <Effects effect={previewEffect(state, effect)} />
                  {flag === 'venue' && <small>下次搭建省 ¥70</small>}
                  {flag === 'posterFatigue' && <small>下次行动若选宣传，报名收益减 5</small>}
                </button>
              ))}
            </div>}
            {offer && <div className={`offer-card ${npcs[offer.npc].color}`}>
              <div><Sparkles size={15} /><strong>{offer.label}</strong><span>仅今天</span></div>
              <label><input type="checkbox" checked={useOffer} onChange={event => setUseOffer(event.target.checked)} />
                <span>用于「{actionDetails[offer.action].label}」</span></label>
              <Effects effect={offer.effect} />
            </div>}
            <div className="roster">
              {npcIds.map(id => <div key={id} className={`roster-member ${offer?.npc === id ? 'speaking' : ''}`} title={`${npcs[id].role} · ${npcs[id].trait}`}>
                <Avatar id={id} /><div><strong>{npcs[id].name}</strong><small>{moodText(state.mood[id])}</small></div>
              </div>)}
            </div>
          </section>
        </div>

        {outcome ? <section className="results" aria-label="结局复盘">
          <div>
            <h2>五天筹备复盘</h2>
            <p>{outcome.won ? `接待 ${outcome.admitted} / 报名 ${state.stats.signups} 人 · 结余 ¥${state.stats.budget}` : Object.entries(outcome.gaps)
              .filter(([, value]) => value > 0).map(([key, value]) => `${statLabels[key as keyof Effect]}还差 ${value}`).join(' · ')}</p>
          </div>
          <div className="replay">
            <button className="secondary" onClick={() => journal.current?.showModal()}><BookOpen size={16} /> 看回合日志</button>
            <button className="secondary" onClick={() => startRun(state.seed, state.scenario, 'demo')}>固定种子重练</button>
            <button className="primary" onClick={openSetup}><RotateCcw size={16} /> 开新一局</button>
          </div>
        </section> : <section ref={actionSection} className="actions" aria-labelledby="action-heading">
          <div className="section-head">
            <h2 id="action-heading">社长行动</h2>
            <span>{settlingIncident ? '先处理今日局势' : '每天选择一项主行动'}</span>
          </div>
          <div className="action-grid">{actions.map(id => {
            const action = actionDetails[id];
            const effect = actionEffect(state, id, useOffer);
            const cost = effect.budget ?? 0;
            const blocked = actionBlock(state, id, useOffer);
            const assisted = offer?.action === id && useOffer;
            const Icon = actionIcons[id];
            return <button className={`action-card ${actionTones[id]} ${assisted ? 'assisted' : ''}`} key={id}
              disabled={!started || waiting || settlingIncident || Boolean(blocked)}
              onClick={() => void chooseAction(id)}>
              <span className="action-icon"><Icon size={19} /></span>
              <span className="action-info"><strong>{action.label}</strong>
                <span className="action-description">{blocked || (assisted ? `采用提案 · ${offer.label}` : action.description)}</span>
                <Effects effect={previewEffect(state, effect)} hideBudget />
              </span>
              <span className={`action-cost ${cost > 0 ? 'gain' : ''}`}>{cost === 0 ? '免费' : `${cost > 0 ? '+' : '−'}¥${Math.abs(cost)}`}</span>
            </button>;
          })}</div>
        </section>}

        <footer className="foot">
          <span><MapPin size={13} /> 虚构校园社团 · 非校方活动</span>
          <button className="text-button" onClick={() => journal.current?.showModal()}><BookOpen size={15} /> 回合日志</button>
        </footer>
      </main>

      <Modal dialogRef={help} title="玩法说明">
        <ol className="guide">
          <li>你有五天。每天选一项主行动，按钮上会标出预期资源变化。</li>
          <li>第二天起，先处理部长带来的局势，再决定当天的主行动。</li>
          <li>可入场人数取报名和接待上限的较小值。搭建、彩排和联动可增加接待上限。</li>
          <li>部长提案只在当天影响关联行动。取消勾选可按原计划做。</li>
        </ol>
        <div className="guide-team">{npcIds.map(id => (
          <div key={id}><Avatar id={id} /><p><strong>{npcs[id].name} · {npcs[id].role}</strong><br />{npcs[id].trait}</p></div>
        ))}</div>
        <p className="muted">演示模式使用固定种子。实时 AI 选择合法事件及提案，游戏规则负责结算。进度保存在当前浏览器。</p>
      </Modal>

      <Modal dialogRef={journal} title="回合日志">
        <p className="muted">{scenario.label} · 局面种子 <code>{state.seed}</code> · 声誉 {state.stats.reputation}</p>
        {state.history.length === 0 && <p>接手社团并选择行动后，你可以在这里查看资源变化。</p>}
        <ol className="journal">{state.history.map((entry, index) => (
          <li key={index}>
            <span className="journal-day">第 {entry.turn} 天</span>
            <div><strong>{entry.label}</strong>
              {entry.offerUsed && <p className="muted">已采用「{offers[entry.offerUsed].label}」</p>}
              {entry.delta && <Effects effect={entry.delta} />}
              {entry.incident && <details>
                <summary>{modes[entry.incident.mode]} · 已校验并载入局势</summary>
                <p>{entry.incident.reason}</p>
                {entry.incident.offerId && <p>提案 · {offers[entry.incident.offerId].label}</p>}
                <code>{entry.incident.requestId}</code>
              </details>}
            </div>
          </li>
        ))}</ol>
      </Modal>

      <Modal dialogRef={restart} title="选择开场方案">
        <fieldset className="scenario-options"><legend>市集场次</legend>
          {scenarioIds.map(key => <label key={key} className={`scenario-option ${key}`}>
            <input type="radio" name="scenario" value={key} checked={scenarioChoice === key} onChange={() => setScenarioChoice(key)} />
            <strong>{scenarios[key].label}</strong><small>{scenarios[key].description}</small>
          </label>)}
        </fieldset>
        {options.liveAvailable && <label className="director-setting">导演方式
          <select value={modeChoice} onChange={event => setModeChoice(event.target.value === 'live_ai' ? 'live_ai' : 'demo')}>
            <option value="live_ai">实时 AI</option><option value="demo">演示模式 · 固定种子</option>
          </select>
        </label>}
        {started && !finished && <p className="muted">开新一局会替换当前进度。</p>}
        <div className="replay">
          {started && <button className="secondary" onClick={() => startRun(state.seed, state.scenario, 'demo')}>固定种子重练</button>}
          <button className="primary" onClick={() => startRun(started ? newSeed() : options.startingSeed, scenarioChoice, modeChoice)}>开始筹备</button>
        </div>
      </Modal>
    </div>
  );
}
