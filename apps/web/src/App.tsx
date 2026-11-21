import { ApiStatus } from './components/ApiStatus'
import { SupabaseStatus } from './components/SupabaseStatus'
import { GameLayout } from './features/game/GameLayout'
import { st001 } from './features/stages/st001'

export function App() {
  return (
    <>
      <header className="site-header">
        <div className="page-width brand">
          <span className="insignia" aria-hidden="true"><i /><i /><i /></span>
          Brain Forge
        </div>
      </header>

      <GameLayout stage={st001} />

      <footer className="page-width connections" aria-labelledby="connections-title">
        <h2 id="connections-title">サービス接続状況</h2>
        <dl className="services">
          <ApiStatus />
          <SupabaseStatus />
        </dl>
      </footer>
    </>
  )
}
