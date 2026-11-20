import Link from 'next/link';
import { scenarios } from '../../../../year/content/scenarios';
import '../year.css';

export default function ScenarioGallery() {
  return <main className="yr-shell">
    <header className="yr-header"><Link className="yr-brand" href="/campus-chaos/year">返回学年档案</Link></header>
    <section className="yr-main yr-scenarios">
      <div className="yr-heading"><div><h1>从哪一种社团开始</h1>
        <div>四种背景共用六章日历。开局条件会改变合作、招新和带教的优先级。</div></div></div>
      <div className="yr-scenario-grid">{Object.entries(scenarios).map(([id, scenario]) => <article className="yr-panel" key={id}>
        <h2>{scenario.label}</h2><p>{scenario.story}</p>
        <Link className="yr-ghost" href={`/campus-chaos/year?scenario=${id}`}>选用这个背景</Link>
      </article>)}</div>
    </section>
  </main>;
}
