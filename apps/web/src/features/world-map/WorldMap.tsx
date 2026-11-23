import { useId, useState, useSyncExternalStore } from 'react'
import { productionTicks } from '../manufacturing/engine'
import type { MachineStatus } from '../manufacturing/engine'
import { FacilityBuilding } from './FacilityBuilding'
import type { FacilityKind } from './FacilityBuilding'
import { SiteConnections } from './SiteConnections'
import { narrowSite, wideSite } from './siteLayout'
import './worldMap.css'

type Facility = { kind: FacilityKind; name: string } & (
  { status: 'available'; route: string } | { status: 'planned' | 'locked' }
)

const facilities: readonly Facility[] = [
  { kind: 'warehouse', name: '部品倉庫', status: 'available', route: 'map/?view=warehouse' },
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

const narrowQuery = '(max-width: 720px)'
function subscribeToViewport(update: () => void) {
  const media = window.matchMedia?.(narrowQuery)
  media?.addEventListener('change', update)
  return () => media?.removeEventListener('change', update)
}
function isNarrowViewport() { return window.matchMedia?.(narrowQuery).matches ?? false }

type MapActivity = {
  measuring?: boolean
  running?: boolean
  machineStatus?: MachineStatus
  progress?: number
  delivery?: { readonly orderId: string } | null
  revenue?: number
}

export function WorldMap({ measuring = false, running = false, machineStatus,
  progress = 0, delivery = null, revenue = 0 }: MapActivity) {
  const narrow = useSyncExternalStore(subscribeToViewport, isNarrowViewport)
  const layout = narrow ? narrowSite : wideSite
  const grid = useId()
  // Receipt references remain stable between ticks. The initial one predates this visit.
  const [deliveryOnEntry] = useState(delivery)
  const weighing = running && measuring
  const producing = running && machineStatus === 'PROCESSING'
  const factoryActivity = machineStatus && {
    WAITING: '部品待ち',
    RECEIVED: '部品受取',
    PROCESSING: `${producing ? '製造中' : '一時停止'} · ${progress}/${productionTicks}`,
    COMPLETED: '製造完了',
  }[machineStatus]
  return (
    <div className="world-map">
      <header className="map-header"><div className="map-shell">
        <span aria-hidden="true">◈</span><strong>Brain Forge</strong>
      </div></header>
      <main className="map-shell map-main">
        <div className="map-overview">
          <div>
            <h1>工場拠点マップ</h1>
            <p className="map-instruction">主搬送路：部品倉庫 → 製造工場 → 出荷センター</p>
          </div>
          <dl className="map-revenue">
            <div><dt>累計売上</dt><dd>{revenue.toLocaleString('ja-JP')} <small>Cr</small></dd></div>
          </dl>
        </div>
        <svg className="map-site" viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="工場施設">
          <defs>
            <pattern id={grid} width="34" height="34" patternUnits="userSpaceOnUse"
              patternTransform="matrix(1 .307 -.7 .45 0 0)">
              <path className="map-grid-line" d="M34 0H0V34" />
            </pattern>
          </defs>
          <rect width={layout.width} height={layout.height} fill={`url(#${grid})`} aria-hidden="true" />
          <rect className="map-perimeter" x="10" y="10" width={layout.width - 20} height={layout.height - 20} rx="14" aria-hidden="true" />
          <SiteConnections layout={layout} delivery={delivery !== deliveryOnEntry ? delivery : null} />
          {facilities.map(facility => {
            const [x, y] = layout.positions[facility.kind]
            const state = states[facility.status]
            const isWarehouse = facility.kind === 'warehouse'
            const isFactory = facility.kind === 'factory'
            const activity = isWarehouse && measuring ? (weighing ? '計量中' : '計量一時停止') : isFactory ? factoryActivity : undefined
            const label = `${facility.name}、${state}${activity ? `、${activity}` : ''}`
            const showGauge = isFactory && machineStatus !== undefined
            const content = <>
              <g transform={`scale(${layout.scale})`} aria-hidden="true">
                <FacilityBuilding kind={facility.kind} lamp={isWarehouse && weighing ? 'weighing' : isFactory && producing ? 'producing' : undefined} />
              </g>
              <g className="map-facility-label" transform={`translate(${42 * layout.scale} ${134 * layout.scale + (narrow ? 9 : 0)})`} aria-hidden="true">
                <rect x="-74" y="-20" width="148" height={showGauge ? 55 : 47} rx="7" />
                <text className="map-facility-name" textAnchor="middle">{facility.name}{facility.status === 'available' ? ' ↗' : ''}</text>
                <text className="map-facility-status" textAnchor="middle" y="18">
                  {activity ?? `${facility.status === 'available' ? '●' : facility.status === 'planned' ? '◷' : '×'} ${state}`}
                </text>
                {showGauge && <g className="map-progress" data-progress={progress}>
                  <rect x="-56" y="25" width="112" height="4" rx="2" />
                  <rect className="map-progress-fill" x="-56" y="25" width={112 * progress / productionTicks} height="4" rx="2" />
                </g>}
              </g>
            </>
            return <g key={facility.kind} transform={`translate(${x} ${y})`} data-facility={facility.kind} data-status={facility.status}>
              {facility.status === 'available'
                ? <a className="map-facility" aria-label={label} href={`${import.meta.env.BASE_URL}${facility.route}`}>{content}</a>
                : <g role="img" aria-label={label}>{content}</g>}
            </g>
          })}
        </svg>
        <div className="map-legend">
          <span><i className="map-legend-main" aria-hidden="true" />主搬送路</span>
          <span><i className="map-legend-future" aria-hidden="true" />将来の分岐</span>
          {delivery && <span>直近の部品発送：{delivery.orderId}</span>}
        </div>
      </main>
    </div>
  )
}
