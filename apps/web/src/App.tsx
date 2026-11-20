import { ApiStatus } from './components/ApiStatus'
import { supabase } from './lib/supabase'

export function App() {
  return (
    <main>
      <header>
        <span className="insignia" aria-hidden="true"><i /><i /><i /></span>
        <span>開発環境</span>
      </header>
      <section className="hero" aria-labelledby="project-name">
        <div>
          <h1 id="project-name">Brain Forge</h1>
          <p><span className="signal" />開発環境は正常に起動しています。</p>
        </div>
        <div className="drawing" aria-hidden="true">
          <div className="press"><i className="column" /><i className="ram" /><i className="base" /></div>
        </div>
      </section>
      <section aria-labelledby="connections-title">
        <h2 id="connections-title">サービス接続状況</h2>
        <dl>
          <ApiStatus />
          <div className="service">
            <dt>Supabase <small>Database / Auth</small></dt>
            <dd><span className={`status ${supabase.client ? 'online' : 'pending'}`}>{supabase.status}</span></dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
