'use client';

import { useState } from 'react';
import { execute, makeCommand } from '../../year/engine/reducer';
import { skills } from '../../year/engine/growth';
import { buildYearbook } from '../../year/engine/succession';
import { yearbookOutput } from '../../year/content/strategy';
import type { ActorId, Skill, WorldEvent, World } from '../../year/model';
import type { Submit } from './StrategyPanel';

export function DevelopmentPanel({ world, submit, disabled }: { world: World; submit: Submit; disabled: boolean }) {
  const [skill, setSkill] = useState<Skill>('operations');
  const [pupil, setPupil] = useState<ActorId>('jiangyi');
  const mentor = skills[skill].mentor;
  const campaign = world.campaign!;
  const action = { kind: 'train', mentor, pupil, skill } as const;
  const preview = execute(world, makeCommand(world, 'practice-preview', action));
  return <div className="yr-strategy">
    {!world.ended && <>
      <div className="yr-editor">
        <label>练习岗位<select value={skill} onChange={e => setSkill(e.target.value as Skill)}>
          {Object.entries(skills).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
        </select></label>
        <label>学员<select value={pupil} onChange={e => setPupil(e.target.value as ActorId)}>
          {Object.values(world.people).filter(p => p.club === 'player' && p.status === 'active').map(p =>
            <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      </div>
      <p>导师 {world.people[mentor].name} · {skills[skill].ability}</p>
      <button className="yr-primary" disabled={disabled || !preview.ok} onClick={() => void submit(action)}>安排两小时练习</button>
      {!preview.ok && <p className="yr-draft-warning">{preview.message}</p>}
    </>}
    {Object.entries(campaign.trainings).map(([id, work]) => <article className="yr-row" key={id}>
      <header><strong>{world.people[work.pupil].name} · {skills[work.skill].label}</strong>
        <small>{work.reviewed ? campaign.skills[work.pupil]?.includes(work.skill) ? '已认证' : '已复盘' : work.performed ? '待复盘' : `第 ${work.window} 窗口练习`}</small></header>
      <p>{skills[work.skill].ability}</p>
      {!world.ended && work.performed && !work.reviewed && <button className="yr-ghost" disabled={disabled}
        onClick={() => void submit({ kind: 'review', id })}>登记练习复盘</button>}
    </article>)}
    {Object.entries(campaign.skills).map(([id, list]) => <article className="yr-row" key={id}>
      <strong>{world.people[id as ActorId].name}可以独立承担</strong>
      <p>{list.map(item => skills[item].label).join('、')}</p>
    </article>)}
  </div>;
}

export function Yearbook({ world, history, live }: { world: World; history: WorldEvent[]; live: boolean }) {
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const data = buildYearbook(world);
  if (!data) return null;
  const turns = history.filter(event => event.type !== 'ballot' && (event.type === 'year_end' ||
    data.routes.some(route => route.evidence.includes(event.id))));
  const milestones = history.filter(event => ['photoMusic', 'aidFulfilled', 'queueHandled'].some(key => world.facts[key] === event.id));
  const evidence = [...new Map([...milestones, ...turns].map(event => [event.id, event])).values()].slice(-10);
  const highlights = highlighted.length ? evidence.filter(item => highlighted.includes(item.id)) : evidence.slice(-3);

  async function curate() {
    if (!live || !evidence.length) return;
    setBusy(true);
    try {
      const response = await fetch('/api/campus/year/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'yearbook', basis: world.yearId, facts: evidence.map(e => `${e.title} ${e.detail}`.slice(0, 130)) }),
        signal: AbortSignal.timeout(6500) });
      const body = await response.json();
      const parsed = yearbookOutput.safeParse({ picks: body.picks });
      if (!parsed.success || body.basis !== world.yearId || body.source !== 'model') throw new Error('fallback');
      setHighlighted(parsed.data.picks.map(i => evidence[i - 1]?.id).filter(Boolean));
      setSource(`实时 AI 选编 · ${String(body.traceId).slice(0, 8)}`);
    } catch { setSource('当前使用账本摘录'); }
    finally { setBusy(false); }
  }

  function download() {
    const publicEvents = history.filter(e => e.type === 'project' && e.title === '活动已举行').slice(-5);
    const lines = [`# 校园社团年度纪念册 · ${data!.title}`, '', `累计实际接待 ${data!.attendance} 人`, '',
      ...publicEvents.map(e => `- 第 ${e.window} 窗口 · ${e.detail}`)];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `campus-yearbook-${world.seed}.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="yr-strategy">
    <h3>{data.title}</h3><p>{data.setting} · 累计实际接待 {data.attendance} 人</p>
    <p>{data.ending.resolution}</p>
    <div className="yr-rows">{data.routes.map(route => <article className="yr-row" key={route.name}>
      <header><strong>{route.name}</strong><small>{route.met ? '已达成' : '未达成'} · {route.score} 分</small></header>
      <p>{history.filter(event => route.evidence.includes(event.id)).slice(-3).map(event => event.title).join(' · ') || '本路线暂无记录'}</p>
    </article>)}</div>
    <h3>换届投票</h3>
    {data.ballot.map(item => <article className="yr-row" key={item.voter}>
      <strong>{item.voter === 'player' ? '玩家' : world.people[item.voter].name} → {item.vote === 'rotation' ? '轮值组' : world.people[item.vote].name}</strong>
      <p>{item.reason}</p>
    </article>)}
    {data.debts.length > 0 && <p>下届应付款 · {data.debts.map(item => `${world.clubs[item.club].label} ¥${item.cents / 100}`).join('、')}</p>}
    <h3>学年片段</h3>
    {source && <p role="status">{source}</p>}
    {highlights.map(event => <article className="yr-row" key={event.id}><strong>{event.title}</strong><p>{event.detail}</p></article>)}
    <div className="yr-contract-tools">
      {live && <button className="yr-ghost" disabled={busy} onClick={() => void curate()}>{busy ? '正在挑选' : '请 AI 选编事实'}</button>}
      <button className="yr-primary" onClick={download}>下载年鉴</button>
    </div>
  </div>;
}
