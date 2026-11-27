import { useId, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { dashboardWindowTicks, productionTicks } from '../../factory/manufacturing/engine'
import type { MachineStatus } from '../../factory/manufacturing/engine'
import type { WarehousePreparation } from '../../factory/runtime/useManufacturingLine'
import { FacilityBuilding } from './FacilityBuilding'
import type { FacilityKind } from './FacilityBuilding'
import { SiteConnections } from './SiteConnections'
import { SiteScenery } from './SiteScenery'
import { Workspace } from '../workspace/Workspace'
import type { WorkspaceLayout } from '../workspace/windowLayout'
import { MapEventLog, MapPythonActions, MapPythonEditor } from './MapOperations'
import type { MapDelivery, MapEditorData } from './MapOperations'
import { narrowSite, wideSite } from './siteLayout'
import './worldMap.css'

type Facility = { kind: FacilityKind; name: string } & (
  { status: 'available'; route: string } | { status: 'planned' | 'locked' }
)

const routes = {
  map: 'map/',
  warehouse: 'map/?view=warehouse',
  factory: 'prototypes/manufacturing/',
  analysis: 'map/?view=benchmark',
  sorting: 'map/?view=sorting',
}

const navigation = [
  { label: '工場マップ', route: routes.map, icon: 'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3zM8 2v17M16 5v17' },
  { label: '部品倉庫', route: routes.warehouse, icon: 'M3 10 12 4l9 6v10H3zM7 20v-7h10v7M7 16h10' },
  { label: '製造工場', route: routes.factory, icon: 'M3 21V11l6-4v4l6-4v5h3V4h3v17zM7 16h1m4 0h1m4 0h1' },
  { label: '性能試験', route: routes.analysis, icon: 'M9 3h6m-5 0v7L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10' },
  { label: '仕分け施設', route: routes.sorting, icon: 'M7 4v16m-3-3 3 3 3-3m4-12h6m-6 5h4m-4 5h2' },
] as const

const facilities: readonly Facility[] = [
  { kind: 'warehouse', name: '部品倉庫', status: 'available', route: routes.warehouse },
  { kind: 'factory', name: '製造工場', status: 'available', route: routes.factory },
  { kind: 'shipping', name: '出荷センター', status: 'planned' },
  { kind: 'analysis', name: '分析室', status: 'available', route: routes.analysis },
  { kind: 'sorting', name: '仕分け施設', status: 'available', route: routes.sorting },
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
  measurementIndex?: number | null
  running?: boolean
  started?: boolean
  preparation?: WarehousePreparation
  onToggleRunning?: () => void
  machineStatus?: MachineStatus
  progress?: number
  delivery?: MapDelivery | null
  revenue?: number
  revenueRate?: number
  windowTicks?: number
  elapsedTicks?: number
  completed?: number
  order?: { readonly id: string; readonly requiredWeight: number }
  editor?: MapEditorData
  sortingEditor?: ReactNode
  workspace?: WorkspaceLayout
}

export function WorldMap({ measurementIndex = null, running = false, started = false, preparation, onToggleRunning, machineStatus,
  progress = 0, delivery = null, revenue = 0, revenueRate = 0, windowTicks = 0, elapsedTicks, completed, order, editor, sortingEditor, workspace }: MapActivity) {
  const narrow = useSyncExternalStore(subscribeToViewport, isNarrowViewport)
  const layout = narrow ? narrowSite : wideSite
  const grid = useId()
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false)
  // Receipt references remain stable between ticks. The initial one predates this visit.
  const [deliveryOnEntry] = useState(delivery)
  const preparing = preparation?.status === 'preparing'
  const sortingError = preparation?.status === 'error'
  const sortingActivity = preparation && {
    idle: '仕分け待ち', preparing: '仕分け準備中', ready: '準備完了', error: '仕分けエラー',
  }[preparation.status]
  const weighing = running && measurementIndex !== null
  const measurementActivity = measurementIndex === null ? undefined
    : `棚 ${measurementIndex} · ${weighing ? '計量中' : '計量一時停止'}`
  const warehouseActivity = measurementActivity
    ?? (
      editor?.report.status === 'failed' ? 'Python実行エラー'
        : editor?.report.status === 'loading' ? 'Python準備中'
          : editor?.report.status === 'running' ? (running ? '探索中' : '探索一時停止') : '待機中'
    )
  const latestMeasurement = editor?.measurements.at(-1)
  const producing = running && machineStatus === 'PROCESSING'
  const factoryActivity = machineStatus && {
    WAITING: '部品待ち',
    RECEIVED: '部品受取',
    PROCESSING: `${producing ? '製造中' : '一時停止'} · ${progress}/${productionTicks}`,
    COMPLETED: '製造完了',
  }[machineStatus]
  const performance = (
    <div className="map-info">
      <dl className="map-revenue">
        <div className="map-rate"><dt>生産効率</dt><dd>{revenueRate.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} <small>Cr/100 Tick</small></dd></div>
        <div><dt>累計売上</dt><dd>{revenue.toLocaleString('ja-JP')} <small>Cr</small></dd></div>
        <div className="map-revenue-window"><dt>計測区間</dt><dd>{windowTicks === dashboardWindowTicks ? '直近' : '経過'}{windowTicks} Tick</dd></div>
      </dl>
      {completed !== undefined && <dl className="map-completed">
        <div><dt>製造完了数</dt><dd>{completed.toLocaleString('ja-JP')} <small>個</small></dd></div>
      </dl>}
      <a className="map-performance-link" href={`${import.meta.env.BASE_URL}${routes.analysis}`}>性能試験を開く</a>
      {(order || editor || factoryActivity) && <div className="map-current-order">
        <h3 id="map-process-title">
          {narrow ? <button type="button" aria-expanded={orderDetailsOpen} aria-controls="map-order-details"
            onClick={() => setOrderDetailsOpen(open => !open)}>現在の注文と工程
            <span aria-hidden="true">{orderDetailsOpen ? '−' : '+'}</span>
          </button> : '現在の注文と工程'}
        </h3>
        <dl className="map-process" id="map-order-details" aria-labelledby="map-process-title" hidden={narrow && !orderDetailsOpen}>
          {order && <><div><dt>注文</dt><dd>{order.id}</dd></div>
            <div><dt>必要重量</dt><dd>{order.requiredWeight.toLocaleString('ja-JP')} kg</dd></div></>}
          {editor && <>
            <div><dt>部品倉庫</dt><dd>{warehouseActivity}</dd></div>
            <div><dt>今回の計量</dt><dd>{editor.measurements.length.toLocaleString('ja-JP')} 回</dd></div>
          </>}
          {latestMeasurement && <div><dt>直近の計量結果</dt>
            <dd>棚 {latestMeasurement.index} · {latestMeasurement.weight.toLocaleString('ja-JP')} kg</dd></div>}
          {factoryActivity && <div><dt>製造工場</dt><dd>{factoryActivity}</dd></div>}
        </dl>
      </div>}
    </div>
  )
  return (
    <div className="world-map" data-running={running}>
      <header className="map-header"><div className="map-shell">
        <span className="map-brand-mark" aria-hidden="true">◈</span><strong>Brain Forge</strong>
        <div className="map-header-status">
          {elapsedTicks !== undefined && <span>{elapsedTicks.toLocaleString('ja-JP')} Tick</span>}
          <span className="map-live-status" role="status" data-running={running}>
            {preparing || sortingError ? sortingActivity : running ? '稼働中' : started ? '一時停止中' : '停止中'}
          </span>
          {onToggleRunning && <button className="map-run-control" type="button" onClick={onToggleRunning}>
            {preparing ? '仕分けを中止' : sortingError ? '再試行' : running ? '一時停止' : started ? '再開' : '起動'}
          </button>}
        </div>
      </div></header>
      <div className="map-shell map-workspace">
        <nav className="map-nav" aria-label="工場内ナビゲーション">
          {navigation.map(({ label, route, icon }) => (
            <a key={route} href={`${import.meta.env.BASE_URL}${route}`} aria-current={route === routes.map ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={icon} />
              </svg>
              {label}
            </a>
          ))}
        </nav>
      <main className="map-main" aria-labelledby="map-title">
        <div className="map-overview">
          <h1 id="map-title">工場拠点マップ</h1>
          <p className="map-instruction"><span>主搬送経路</span> 部品倉庫 → 製造工場 → 出荷センター</p>
          {preparation?.status === 'ready' && <p className="map-instruction map-preparation-status"><span>仕分け施設</span> 準備完了</p>}
          {sortingError && <div className="map-sorting-error" role="alert">
            <pre>{preparation.detail}</pre>
            <a href={`${import.meta.env.BASE_URL}${routes.sorting}`}>sorting.py を編集</a>
          </div>}
        </div>
        <div className="map-scene">
        <svg className="map-site" viewBox={`0 0 ${layout.width} ${layout.height}`} role="group" aria-label="工場施設">
          <defs>
            <pattern id={grid} width="34" height="34" patternUnits="userSpaceOnUse"
              patternTransform="matrix(1 .307 -.7 .45 0 0)">
              <path className="map-grid-line" d="M34 0H0V34" />
            </pattern>
          </defs>
          <path className="map-yard map-production-yard"
            d={narrow ? 'M20 37H299L324 78V557L298 598H22Z' : 'M32 45H957L1054 109V300L1008 336H32Z'} aria-hidden="true" />
          <path className="map-yard map-support-yard"
            d={narrow ? 'M20 627H320L349 665V989L325 1000H20Z' : 'M28 354H951L1053 418V546L1004 574H28Z'} aria-hidden="true" />
          <rect width={layout.width} height={layout.height} fill={`url(#${grid})`} aria-hidden="true" />
          <rect className="map-perimeter" x="10" y="10" width={layout.width - 20} height={layout.height - 20} rx="14" aria-hidden="true" />
          <SiteScenery narrow={narrow} />
          <g className="map-zone-labels" aria-hidden="true">
            <text x={narrow ? 30 : 48} y={narrow ? 60 : 69}>生産区画</text>
            <text x={narrow ? 46 : 104} y={narrow ? 652 : 374}>分析・拡張区画</text>
          </g>
          <SiteConnections layout={layout} delivery={delivery !== deliveryOnEntry ? delivery : null} />
          {facilities.map(facility => {
            const [x, y] = layout.positions[facility.kind]
            const state = states[facility.status]
            const isWarehouse = facility.kind === 'warehouse'
            const isFactory = facility.kind === 'factory'
            const activity = isWarehouse ? measurementActivity : isFactory ? factoryActivity
              : facility.kind === 'sorting' ? sortingActivity : undefined
            const label = `${facility.name}、${state}${activity ? `、${activity}` : ''}`
            const showGauge = isFactory && machineStatus !== undefined
            const content = <>
              <g transform={`scale(${layout.scale})`} aria-hidden="true">
                <FacilityBuilding kind={facility.kind} lamp={isWarehouse && weighing ? 'weighing' : isFactory && producing ? 'producing' : undefined} />
              </g>
              <g className="map-facility-label" transform={`translate(${42 * layout.scale} ${134 * layout.scale + (narrow ? 9 : 0)})`} aria-hidden="true">
                <rect x="-74" y="-20" width="148" height={showGauge ? 70 : activity || facility.kind === 'analysis' ? 64 : 47} rx="7" />
                <text className="map-facility-name" textAnchor="middle">{facility.name}{facility.status === 'available' ? ' ↗' : ''}</text>
                <text className="map-facility-status" textAnchor="middle" y="18">
                  {facility.status === 'available' ? '●' : facility.status === 'planned' ? '◷' : '×'} {state}
                </text>
                {(activity || facility.kind === 'analysis') && <text className="map-facility-activity" textAnchor="middle" y="35">{activity ?? 'アルゴリズム性能試験'}</text>}
                {showGauge && <g className="map-progress" data-progress={progress}>
                  <rect x="-56" y="41" width="112" height="4" rx="2" />
                  <rect className="map-progress-fill" x="-56" y="41" width={112 * progress / productionTicks} height="4" rx="2" />
                </g>}
              </g>
            </>
            return <g key={facility.kind} transform={`translate(${x} ${y})`} data-facility={facility.kind} data-status={facility.status}
              data-weighing={isWarehouse && weighing ? true : undefined}>
              {facility.status === 'available'
                ? <a className="map-facility" aria-label={label} href={`${import.meta.env.BASE_URL}${facility.route}`}>{content}</a>
                : <g role="img" aria-label={label}>{content}</g>}
            </g>
          })}
        </svg>
        {editor && workspace ? <Workspace layout={workspace} defaultTab={sortingEditor ? 'sorting' : 'python'}
          titleActions={{ python: <MapPythonActions {...editor} /> }} panels={{
          python: <MapPythonEditor data={editor} />,
          ...(sortingEditor ? { sorting: sortingEditor } : {}),
          events: <MapEventLog orderId={order?.id} started={started} measurements={editor.measurements} delivery={delivery}
            status={machineStatus} completed={completed} report={editor.report} />,
          performance,
        }} /> : performance}
        </div>
        <div className="map-legend">
          <span><i className="map-legend-main" aria-hidden="true" />主搬送路</span>
          <span><i className="map-legend-sorting" aria-hidden="true" />初期仕分け</span>
          <span><i className="map-legend-analysis" aria-hidden="true" />分析室への連絡路</span>
          <span><i className="map-legend-future" aria-hidden="true" />将来の分岐</span>
          <span><i className="map-legend-road" aria-hidden="true" />構内道路</span>
          {delivery && <span>直近の部品発送：{delivery.orderId}</span>}
        </div>
      </main>
      </div>
    </div>
  )
}
