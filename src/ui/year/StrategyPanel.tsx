'use client';

import { useRef, useState } from 'react';
import { termsSchema } from '../../year/commands';
import { places } from '../../year/content/clubs';
import { draftFromText, draftOutput, replyOutput, type Draft } from '../../year/content/strategy';
import { dealIssue, dealLabels, replyOptions } from '../../year/engine/deals';
import { execute, makeCommand } from '../../year/engine/reducer';
import type { Action, Deal, DealTerms, World } from '../../year/model';
import { digest } from '../../year/view/digest';

export type Submit = (action: Action) => void | Promise<void>;
const example = '想和音乐社在第6窗口的湖畔舞台联演，江一负责，2小时，预算¥20，对方分成10%，独立署名。';
const fees = (n: number) => `¥${(n / 100).toFixed(n % 100 ? 2 : 0)}`;

function Editor({ draft, world, update, remove, number }: {
  draft: Draft; world: World; number: number; update: (patch: Draft) => void; remove: () => void;
}) {
  const check = termsSchema.safeParse(draft);
  const issue = check.success ? dealIssue(world, check.data) : check.error.issues.map(item => {
    const names: Record<string, string> = { fee: '费用', units: '工时', club: '伙伴', place: '地点', owner: '负责人',
      window: '窗口', share: '分成', credit: '署名', kind: '活动' };
    return names[String(item.path[0])];
  }).filter(Boolean).join('、');
  const numberValue = (value: string, factor = 1) => value.trim() ? Math.round(Number(value) * factor) : undefined;
  return <fieldset className="yr-editor">
    <legend>提案 {number}</legend>
    <label>活动<select value={draft.kind ?? ''} onChange={e => update({ kind: (e.target.value || undefined) as Draft['kind'] })}>
      <option value="">待补</option>{Object.entries(dealLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>
    <label>伙伴<select value={draft.club ?? ''} onChange={e => update({ club: (e.target.value || undefined) as Draft['club'] })}>
      <option value="">待补</option>{Object.values(world.clubs).filter(club => club.id !== 'player').map(club => <option key={club.id} value={club.id}>{club.label}</option>)}
    </select></label>
    <label>地点<select value={draft.place ?? ''} onChange={e => update({ place: (e.target.value || undefined) as Draft['place'] })}>
      <option value="">待补</option>{Object.entries(places).map(([id, place]) => <option key={id} value={id}>{place.label}</option>)}
    </select></label>
    <label>负责人<select value={draft.owner ?? ''} onChange={e => update({ owner: (e.target.value || undefined) as Draft['owner'] })}>
      <option value="">待补</option>{Object.values(world.people).filter(p => p.status === 'active' && p.club === 'player')
        .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <label>活动窗口<input type="number" min={world.window + 1} max="23" value={draft.window ?? ''} onChange={e => update({ window: numberValue(e.target.value) })}/></label>
    <label>工时（小时）<input type="number" min="1" max="4" step=".5" value={draft.units !== undefined ? draft.units / 2 : ''}
      onChange={e => update({ units: numberValue(e.target.value, 2) })}/></label>
    <label>费用（元）<input type="number" min="0" max="600" step=".01" value={draft.fee !== undefined ? draft.fee / 100 : ''}
      onChange={e => update({ fee: numberValue(e.target.value, 100) })}/></label>
    <label>对方分成（%）<input type="number" min="0" max="100" value={draft.share ?? ''} onChange={e => update({ share: numberValue(e.target.value) })}/></label>
    <label>署名<select value={draft.credit === undefined ? '' : String(draft.credit)} onChange={e => update({ credit: e.target.value === '' ? undefined : e.target.value === 'true' })}>
      <option value="">待补</option><option value="true">共同署名</option><option value="false">独立署名</option>
    </select></label>
    <button type="button" className="yr-ghost" onClick={remove}>移除本组</button>
    <p className={issue ? 'yr-draft-warning' : 'yr-draft-valid'}>{issue ? check.success ? issue : `请补全或修正 ${issue}` :
      '当前有档期和经费。签署后才会锁定资源。'}</p>
  </fieldset>;
}

async function ask(body: Record<string, unknown>) {
  const reply = await fetch('/api/campus/year/plan', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(6500),
  });
  if (!reply.ok) throw new Error('导演暂时无法应答');
  return reply.json();
}

function DealCard({ deal, world, selected, toggle, submit, disabled }: {
  deal: Deal; world: World; selected: boolean; toggle: () => void; submit: Submit; disabled: boolean;
}) {
  const { terms } = deal;
  const [replacement, setReplacement] = useState<DealTerms['owner'] | ''>('');
  const [counter, setCounter] = useState<Draft | null>(null);
  const status = { quoted: deal.outcome === 'counter' ? '对方反价' : '待签署', signed: '已签署', refused: '已关闭',
    fulfilled: '已履约', defaulted: '已取消并赔付', expired: '已到期' }[deal.state];
  const amend = (operation: Extract<Action, { kind: 'amend' }>['operation']): Action =>
    ({ kind: 'amend', id: deal.id, version: deal.version, operation, owner: replacement || undefined });
  return <article className="yr-row yr-deal">
    <header><strong>{world.clubs[terms.club].label} · {dealLabels[terms.kind]}</strong><small>{status} · v{deal.version}</small></header>
    <p>第 {terms.window} 窗口 · {places[terms.place].label} · {world.people[terms.owner].name} · {terms.units / 2} 小时</p>
    <p>{fees(terms.fee)} · 对方分成 {terms.share}% · {terms.credit ? '共同署名' : '独立署名'}
      {deal.state === 'quoted' ? ` · 第 ${deal.expires} 窗口结算时失效` : ''}
      {deal.state === 'signed' ? ` · 冻结 ${fees(deal.held)} · ${deal.prepared ? '准备单已核对' : '等待核对准备单'}` : ''}</p>
    {deal.state === 'quoted' && <div className="yr-contract-tools">
      <label><input aria-label={`选择${world.clubs[terms.club].label}报价`} type="checkbox" checked={selected} onChange={toggle}/>纳入本次签署</label>
      <button className="yr-ghost" disabled={disabled} onClick={() => setCounter(counter ? null : terms)}>编辑反提案</button>
    </div>}
    {deal.state === 'quoted' && counter && <>
      <Editor draft={counter} world={world} number={deal.version + 1} remove={() => setCounter(null)}
        update={patch => setCounter({ ...counter, ...patch })}/>
      <button className="yr-primary" disabled={disabled || !termsSchema.safeParse(counter).success} onClick={() => {
        const parsed = termsSchema.safeParse(counter);
        if (parsed.success) { void submit({ kind: 'counter', id: deal.id, version: deal.version, terms: parsed.data }); setCounter(null); }
      }}>提交反提案</button>
    </>}
    {deal.state === 'signed' && <div className="yr-contract-tools">
      <select aria-label="替代负责人" value={replacement} onChange={e => setReplacement(e.target.value as DealTerms['owner'] | '')}>
        <option value="">选替班成员</option>{Object.values(world.people).filter(p => p.id !== terms.owner && p.club === 'player' && p.status === 'active')
          .map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button className="yr-ghost" disabled={disabled || !replacement} onClick={() => void submit(amend('reassign'))}>更换负责人</button>
      <button className="yr-ghost" disabled={disabled || terms.window >= 23} onClick={() => void submit(amend('reschedule'))}>顺延一窗</button>
      <button className="yr-ghost" disabled={disabled || terms.units <= 2} onClick={() => void submit(amend('resize'))}>缩小班次</button>
      <button className="yr-ghost" disabled={disabled} onClick={() => void submit(amend('cancel'))}>取消并赔付</button>
    </div>}
  </article>;
}

export function StrategyPanel({ world, live, submit, disabled }: { world: World; live: boolean; submit: Submit; disabled: boolean }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [notice, setNotice] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const basis = digest(world);
  const latest = useRef(basis);
  latest.current = basis;
  const deals = Object.values(world.campaign!.deals).toReversed();
  const valid = drafts.every(draft => {
    const parsed = termsSchema.safeParse(draft);
    return parsed.success && !dealIssue(world, parsed.data);
  });
  const signing = deals.filter(deal => deal.state === 'quoted' && selected.includes(deal.id)).map(({ id, version }) => ({ id, version }));
  const locked = waiting || disabled;

  async function parse() {
    const local = draftFromText(text, world.window);
    setWaiting(true);
    setNotice('');
    try {
      if (live) {
        const remote = await ask({ kind: 'draft', basis, window: world.window, text });
        if (latest.current !== basis || remote.basis !== basis) return;
        const check = draftOutput.safeParse({ groups: remote.groups });
        if (check.success && check.data.groups.length && remote.source === 'model') {
          setDrafts(check.data.groups.map((group, i) => ({ ...local[i], ...group })));
          setNotice('实时 AI 已提取草案，核对具体条款后再询价。');
          return;
        }
      }
    } catch { /* The text remains available for rule parsing. */ }
    finally { setWaiting(false); }
    if (latest.current === basis) {
      setDrafts(local);
      setNotice('草案已就绪。每组条款都可以单独编辑。');
    }
  }

  async function requestQuotes() {
    const terms = drafts.map(draft => termsSchema.parse(draft));
    const request: Extract<Action, {kind: 'quote'}> = { kind: 'quote', terms };
    setWaiting(true);
    setNotice('');
    try {
      if (live) {
        const remote = await ask({ kind: 'reply', basis, groups: terms.map(t => ({ terms: t, variants: replyOptions(world, t) })) });
        if (latest.current !== basis || remote.basis !== basis) return;
        const check = replyOutput.safeParse({ styles: remote.styles });
        if (check.success && remote.source === 'model' && typeof remote.traceId === 'string') {
          request.reply = { styles: check.data.styles, traceId: remote.traceId };
        }
      }
    } catch { /* Quotes can still use the terms mandated by each club. */ }
    finally { setWaiting(false); }
    if (latest.current !== basis) return;
    const preview = execute(world, makeCommand(world, 'joint-preview', request));
    if (!preview.ok) { setNotice(preview.message); return; }
    await submit(request);
  }

  function respond(accept: boolean) {
    const action: Action = { kind: 'respond', deals: signing, accept };
    const preview = execute(world, makeCommand(world, 'joint-preview', action));
    if (!preview.ok) { setNotice(preview.message); return; }
    setNotice('');
    void submit(action);
    setSelected([]);
  }

  return <div className="yr-strategy">
    {!world.ended && <>
      <label className="yr-strategy-input">给社团伙伴的计划
        <textarea value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder={example} rows={3}/>
      </label>
      <div className="yr-contract-tools">
        <button className="yr-primary" disabled={locked || text.trim().length < 2} onClick={() => void parse()}>{waiting ? '正在处理' : '解析成草案'}</button>
        <button className="yr-ghost" disabled={locked} onClick={() => setText(example)}>填入联演示例</button>
        <button className="yr-ghost" disabled={locked || drafts.length >= 4} onClick={() => setDrafts([...drafts, {}])}>手动加一组</button>
      </div>
      {drafts.map((draft, i) => <Editor draft={draft} world={world} number={i + 1} key={i}
        update={patch => setDrafts(drafts.map((item, n) => n === i ? { ...item, ...patch } : item))}
        remove={() => setDrafts(drafts.filter((_, n) => n !== i))} />)}
      {drafts.length > 0 && <button className="yr-primary" disabled={locked || !valid} onClick={() => void requestQuotes()}>向伙伴询价</button>}
    </>}
    {notice && <p className="yr-draft-warning" role="status">{notice}</p>}
    <div className="yr-rows">{deals.map(deal => <DealCard key={deal.id} deal={deal} world={world}
      selected={selected.includes(deal.id)} disabled={locked || world.ended} toggle={() => setSelected(previous =>
        previous.includes(deal.id) ? previous.filter(id => id !== deal.id) : [...previous, deal.id].slice(-4))}
      submit={action => {
        const check = execute(world, makeCommand(world, 'contract-preview', action));
        if (!check.ok) setNotice(check.message);
        else { setNotice(''); void submit(action); }
      }}/>)}</div>
    {signing.length > 0 && <div className="yr-contract-tools">
      <button className="yr-primary" disabled={locked} onClick={() => respond(true)}>签署所选 {signing.length} 组</button>
      <button className="yr-ghost" disabled={locked} onClick={() => respond(false)}>拒绝所选</button>
    </div>}
  </div>;
}
