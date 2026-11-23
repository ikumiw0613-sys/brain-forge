import { FacilityBuilding } from './FacilityBuilding'
import type { FacilityKind } from './FacilityBuilding'
import './worldMap.css'

type Facility = { kind: FacilityKind; name: string } & (
  { status: 'available'; route: string } | { status: 'planned' | 'locked' }
)

const facilities: readonly Facility[] = [
  { kind: 'warehouse', name: '部品倉庫', status: 'available', route: 'prototypes/weight-search/' },
  { kind: 'factory', name: '製造工場', status: 'available', route: 'prototypes/manufacturing/' },
  { kind: 'shipping', name: '出荷センター', status: 'planned' },
  { kind: 'sorting', name: '仕分け施設', status: 'locked' },
  { kind: 'logistics', name: '物流センター', status: 'locked' },
]

const states = {
  available: '利用可能',
  planned: '準備中',
  locked: '未解放',
}

export function WorldMap() {
  return (
    <div className="world-map">
      <header className="map-header"><div className="map-shell">
        <span aria-hidden="true">◈</span><strong>Brain Forge</strong>
      </div></header>
      <main className="map-shell map-main">
        <h1>工場拠点マップ</h1>
        <p className="map-instruction">利用可能な施設を選ぶと、その工程に移動できます。</p>
        <ul className="map-site" aria-label="工場施設">
          {facilities.map(facility => {
            const content = <>
              <FacilityBuilding kind={facility.kind} />
              <div className="map-facility-label">
                <div>
                  <h2>{facility.name}</h2>
                  <p><span aria-hidden="true">{facility.status === 'available' ? '●' : facility.status === 'planned' ? '◷' : '×'}</span>{states[facility.status]}</p>
                </div>
                {facility.status === 'available' && <span className="map-enter" aria-hidden="true">↗</span>}
              </div>
            </>
            return <li key={facility.kind} data-facility={facility.kind} data-status={facility.status}>
              {facility.status === 'available'
                ? <a className="map-facility" href={`${import.meta.env.BASE_URL}${facility.route}`}>{content}</a>
                : <div className="map-facility">{content}</div>}
            </li>
          })}
        </ul>
      </main>
    </div>
  )
}
